
import {
  DisconnectReason
} from '@whiskeysockets/baileys';

import {
  getSession,
  registerSession,
  removeSession,
  unregisterSession,
  getSessionCount
} from './manager.js';

import { createUserContext } from './context.js';
import { createUserSupabase } from '../supabase.js';
import { handleMessage } from '../handler.js';
import { createUserSocket } from './socket-factory.js';

const pendingConnections = new Map();

function normalizePhoneNumber(value) {
  if (typeof value !== 'string') {
    throw new Error('Enter your WhatsApp phone number.');
  }

  const digits = value.replace(/\D/g, '');

  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new Error(
      'Enter a valid international phone number with country code.'
    );
  }

  return digits;
}

function getDisconnectCode(lastDisconnect) {
  const rawCode =
    lastDisconnect?.error?.output?.statusCode ??
    lastDisconnect?.error?.statusCode ??
    lastDisconnect?.error?.data?.statusCode;

  if (rawCode === undefined || rawCode === null) return null;

  const numericCode = Number(rawCode);
  return Number.isFinite(numericCode) ? numericCode : null;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isManualRecoveryCode(code) {
  if (code == null) return false;

  const recoveryCodes = [
    DisconnectReason.connectionReplaced,
    DisconnectReason.forbidden,
    DisconnectReason.badSession,
    DisconnectReason.multideviceMismatch
  ].filter(value => value != null);

  return recoveryCodes.includes(code);
}

async function cleanupSocket(sock, auth) {
  if (sock) {
    try {
      sock.end(undefined);
    } catch (error) {
      console.error('Socket cleanup error:', error.message);
    }
  }

  if (auth) {
    try {
      await auth.flush();
    } catch (error) {
      console.error('Session cleanup error:', error.message);
    }
  }
}

function attachSocketEvents(userId, session, isCurrentSocket) {
  const { sock, auth, context } = session;

  sock.ev.on('creds.update', async update => {
  if (!isCurrentSocket(sock)) return;

  console.log('[CREDS-UPDATE-DIAG]', {
    updateReceived: Boolean(update),
    registered: auth.state.creds.registered,
    hasMe: Boolean(auth.state.creds.me),
    hasAccount: Boolean(auth.state.creds.account)
  });

  try {
    await auth.saveCreds();

    console.log('[CREDS-SAVE-DIAG] Credentials saved successfully.');
  } catch (error) {
    console.error('[CREDS-SAVE-DIAG] Credential save failed:', error.message);
  }
});

  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    if (action !== 'add' || !context.groupSettings?.welcomeGroups?.has(id)) return;
    if (!isCurrentSocket(sock) || session.stopping) return;

    for (const participant of participants || []) {
      const mention = String(participant).split('@')[0].split(':')[0];

      try {
        await sock.sendMessage(id, {
          text: `👋 Welcome @${mention} to the group!`,
          mentions: [participant]
        });
      } catch (error) {
        console.error('Welcome message failed:', error.message);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages = [], type }) => {
    console.log(`[MSG-DIAG] upsert type=${type} count=${messages.length}`);

    if (type !== 'notify') {
      console.log(`[MSG-DIAG] ignored non-notify upsert type=${type}`);
      return;
    }

    if (!isCurrentSocket(sock)) {
      console.log('[MSG-DIAG] ignored event from stale socket');
      return;
    }

    if (session.stopping) {
      console.log('[MSG-DIAG] ignored event because session is stopping');
      return;
    }

    for (const message of messages) {
      if (!isCurrentSocket(sock) || session.stopping) break;

      console.log(
        `[MSG-DIAG] notify message hasPayload=${Boolean(message?.message)} fromMe=${Boolean(message?.key?.fromMe)}`
      );

      try {
        await handleMessage(sock, message, context);
        console.log('[MSG-DIAG] handleMessage completed');
      } catch (error) {
        console.error('[MSG-DIAG] Message handling error:', error?.stack || error);
      }
    }
  });

  sock.ev.on('connection.update', async update => {
    if (!isCurrentSocket(sock)) return;

    const { connection, lastDisconnect } = update;

    if (connection === 'connecting') {
      session.status = 'connecting';
      console.log(`WhatsApp connecting for user ${userId}`);
    }

    if (connection === 'open') {
      session.status = 'connected';
      session.everConnected = true;
      session.connectedAt = new Date().toISOString();
      session.reconnectAttempts = 0;
      session.reconnecting = false;
      console.log(`WhatsApp connected for user ${userId}`);
    }

    if (connection !== 'close') return;
    if (session.reconnecting) return;

    session.status = 'disconnected';
    session.reconnecting = true;

    const code = getDisconnectCode(lastDisconnect);
    const disconnectError = lastDisconnect?.error;

    const failureReason =
      disconnectError?.data?.reason ||
      disconnectError?.data?.attrs?.reason ||
      null;

    console.warn('WhatsApp socket closed:', {
      userId,
      code: code ?? null,
      message: disconnectError?.message || 'Unknown connection error',
      failureReason,
      rawData: disconnectError?.data ?? null
    });

    try {
      await auth.flush();
    } catch (error) {
      console.error('Final session save failed:', error.message);
    }

    if (!isCurrentSocket(sock)) return;

    if (session.stopping) {
      unregisterSession(userId);
      return;
    }

    const loggedOutCode = Number(DisconnectReason.loggedOut);

if (code === loggedOutCode || code === 401) {
  console.warn(
    `WhatsApp rejected the saved login for user ${userId} (401).`
  );

  console.warn(
    'Preserving encrypted WhatsApp credentials for diagnosis.'
  );

  unregisterSession(userId);
  session.status = 'loggedOut';
  session.reconnecting = false;
  return;
}
    if (!session.everConnected && !auth.state.creds.registered) {
      session.status = 'connectionFailed';
      unregisterSession(userId);
      session.reconnecting = false;

      console.warn(
        `Initial WhatsApp handshake failed for user ${userId}. Code: ${code ?? 'unknown'}`
      );

      return;
    }

    if (isManualRecoveryCode(code)) {
      console.warn(
        `WhatsApp requires manual recovery for user ${userId}. Code: ${code}`
      );

      unregisterSession(userId);
      session.status = 'recoveryRequired';
      session.reconnecting = false;
      return;
    }

    session.reconnectAttempts += 1;

    if (session.reconnectAttempts > 5) {
      console.error(`Reconnect limit reached for user ${userId}`);
      unregisterSession(userId);
      session.status = 'reconnectFailed';
      session.reconnecting = false;
      return;
    }

    const waitMs = Math.min(
      2000 * (2 ** (session.reconnectAttempts - 1)),
      30000
    );

    console.log(
      `Reconnecting user ${userId} in ${waitMs}ms. Code: ${code ?? 'unknown'}`
    );

    await delay(waitMs);

    if (
      session.stopping ||
      getSession(userId) !== session ||
      !isCurrentSocket(sock)
    ) {
      session.reconnecting = false;
      return;
    }

    let next;

    try {
      next = await createUserSocket(userId);

      if (
        session.stopping ||
        getSession(userId) !== session ||
        !isCurrentSocket(sock)
      ) {
        await cleanupSocket(next.sock, next.auth);
        session.reconnecting = false;
        return;
      }

      session.sock = next.sock;
      session.auth = next.auth;
      session.status = 'connecting';
      session.reconnecting = false;

      attachSocketEvents(
        userId,
        session,
        candidate => session.sock === candidate
      );
    } catch (error) {
      console.error(`Reconnect failed for user ${userId}:`, error.message);

      if (next) {
        await cleanupSocket(next.sock, next.auth);
      }

      if (
        getSession(userId) === session &&
        !session.stopping
      ) {
        session.status = 'reconnectFailed';
        unregisterSession(userId);
      }

      session.reconnecting = false;
    }
  });
}

export async function startAuthenticatedUserConnection(req) {
  const userId = req?.user?.id;
  const header = req?.headers?.authorization || '';

  if (!userId || !header.startsWith('Bearer ')) {
    throw new Error('Authenticated user is required.');
  }

  const accessToken = header.slice(7).trim();

  if (!accessToken) {
    throw new Error('Valid access token is required.');
  }

  const suppliedPhoneNumber = req?.body?.phoneNumber;

  if (
    getSession(userId) ||
    pendingConnections.has(userId)
  ) {
    throw new Error(
      'A WhatsApp connection is already active or starting.'
    );
  }

  const pending = {
    cancelled: false
  };

  pendingConnections.set(userId, pending);

  let auth;
  let sock;
  let pairingReady;
  let session;

  try {
    const supabase = createUserSupabase(accessToken);

    const context = await createUserContext({
      userId,
      supabase,
      disconnect: () => stopUserConnection(userId)
    });

    if (pending.cancelled) {
      throw new Error('WhatsApp connection was cancelled.');
    }

    const created = await createUserSocket(userId);

    sock = created.sock;
    auth = created.auth;
    pairingReady = created.pairingReady;

    if (pending.cancelled) {
      await cleanupSocket(sock, auth);
      sock = null;
      auth = null;
      throw new Error('WhatsApp connection was cancelled.');
    }

    session = {
      sock,
      auth,
      context,
      status: 'connecting',
      stopping: false,
      reconnecting: false,
      reconnectAttempts: 0,
      connectedAt: null,
      everConnected: false
    };

    registerSession(userId, session);

    attachSocketEvents(
      userId,
      session,
      candidate => session.sock === candidate
    );

    // Safe diagnostic: logs credential state only, not credential values.
    console.log('[AUTH-DIAG]', {
      registered: auth.state.creds.registered,
      hasMe: Boolean(auth.state.creds.me),
      hasAccount: Boolean(auth.state.creds.account)
    });

    if (!auth.state.creds.registered) {
      console.log('[AUTH-DIAG]', {
  registered: auth.state.creds.registered,
  hasMe: Boolean(auth.state.creds.me),
  hasAccount: Boolean(auth.state.creds.account)
});
      const phoneNumber = normalizePhoneNumber(suppliedPhoneNumber);

      if (typeof sock.requestPairingCode !== 'function') {
        throw new Error(
          'Pairing codes are unavailable in this Baileys socket.'
        );
      }

      if (pairingReady) await pairingReady;

      if (
        pending.cancelled ||
        session.stopping ||
        getSession(userId) !== session
      ) {
        throw new Error(
          'WhatsApp connection was cancelled before pairing.'
        );
      }

      const pairingCode = await sock.requestPairingCode(phoneNumber);
      console.log('[PAIRING-DIAG] Requesting pairing code...');
      console.log('[PAIRING-DIAG] Pairing code returned successfully.');

      if (typeof pairingCode !== 'string' || !pairingCode) {
        throw new Error('WhatsApp did not return a pairing code.');
      }

      if (
        pending.cancelled ||
        session.stopping ||
        getSession(userId) !== session
      ) {
        throw new Error(
          'WhatsApp connection stopped before pairing completed.'
        );
      }

      return {
        ...session,
        pairingCode
      };
    }

    if (
      pending.cancelled ||
      session.stopping ||
      getSession(userId) !== session
    ) {
      throw new Error('WhatsApp connection was cancelled.');
    }

    return {
      ...session,
      pairingCode: null
    };
  } catch (error) {
    if (session && getSession(userId) === session) {
      session.stopping = true;
      removeSession(userId);
    } else if (sock) {
      try {
        sock.end(undefined);
      } catch (cleanupError) {
        console.error(
          'Socket cleanup after startup failure:',
          cleanupError.message
        );
      }
    }

    try {
      await auth?.flush();
    } catch (saveError) {
      console.error('Session save after startup failure:', saveError.message);
    }

    throw error;
  } finally {
    if (pendingConnections.get(userId) === pending) {
      pendingConnections.delete(userId);
    }
  }
}

export function stopUserConnection(userId) {
  const pending = pendingConnections.get(userId);

  if (pending) {
    pending.cancelled = true;
  }

  const session = getSession(userId);

  if (!session) {
    return Boolean(pending);
  }

  session.stopping = true;
  session.status = 'stopped';

  return removeSession(userId);
}

export function getActiveConnectionCount() {
  return getSessionCount();
}