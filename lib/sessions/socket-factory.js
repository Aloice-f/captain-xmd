import {
  default as makeWASocket,
  fetchLatestWaWebVersion,
  Browsers
} from '@whiskeysockets/baileys';

import { createUserAuthState } from './baileys-auth.js';

function waitForPairingReady(sock, delayMs = 5000, timeoutMs = 20000) {
  let delayTimer;
  let timeoutTimer;
  let started = false;
  let settled = false;

  const ready = new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(delayTimer);
      clearTimeout(timeoutTimer);
      sock.ev.off('connection.update', onUpdate);
    };

    const finish = error => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };

    const onUpdate = ({ connection, qr, lastDisconnect }) => {
      if (connection === 'close') {
        const error = lastDisconnect?.error || new Error(
          'WhatsApp closed the connection before pairing was ready.'
        );
        finish(error);
        return;
      }

      if (!started && (connection === 'connecting' || qr || connection === 'open')) {
        started = true;
        delayTimer = setTimeout(() => finish(), delayMs);
      }
    };

    sock.ev.on('connection.update', onUpdate);
    timeoutTimer = setTimeout(() => {
      finish(new Error('Timed out waiting for WhatsApp connection startup.'));
    }, timeoutMs);
  });

  // The caller awaits this promise when pairing is required. This catch also
  // prevents an unhandled rejection when an already-registered session starts.
  ready.catch(() => {});
  return ready;
}

export async function createUserSocket(userId) {
  const auth = await createUserAuthState(userId);

  let versionResult;
  try {
    versionResult = await fetchLatestWaWebVersion();
  } catch (error) {
    throw new Error(`Could not retrieve the current WhatsApp Web version: ${error.message}`);
  }

  if (!Array.isArray(versionResult?.version) || versionResult.version.length !== 3) {
    throw new Error('WhatsApp Web did not return a valid version number.');
  }

  const version = versionResult.version;
  console.log(
    `Using WhatsApp Web version ${version.join('.')} (latest: ${Boolean(versionResult.isLatest)}).`
  );

  const sock = makeWASocket({
    version,
    auth: auth.state,
    printQRInTerminal: false,
    browser: Browsers.windows('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    generateHighQualityLinkPreview: false
  });

  return {
    sock,
    auth,
    pairingReady: waitForPairingReady(sock)
  };
}
