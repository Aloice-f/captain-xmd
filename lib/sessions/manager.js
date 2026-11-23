import path from 'node:path';
import fs from 'node:fs';

const sessions = new Map();

const SESSION_ROOT = path.resolve(
  process.env.USER_SESSIONS_DIR || './user-sessions'
);

function validateUserId(userId) {
  if (
    typeof userId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
  ) {
    throw new Error('Invalid authenticated user ID.');
  }
}

export function getUserSessionDirectory(userId) {
  validateUserId(userId);
  return path.join(SESSION_ROOT, userId);
}

export function getSession(userId) {
  validateUserId(userId);
  return sessions.get(userId) || null;
}

// Get the current WhatsApp session status.
export function getSessionStatus(userId) {
  validateUserId(userId);

  const session = sessions.get(userId);

  if (!session) {
    return 'disconnected';
  }

  if (session.status) {
    return session.status;
  }

  if (session.sock?.user) {
    return 'connected';
  }

  return 'connecting';
}

export function registerSession(userId, session) {
  validateUserId(userId);

  if (!session?.sock) {
    throw new Error('A valid WhatsApp socket is required.');
  }

  if (sessions.has(userId)) {
    throw new Error('This user already has an active session.');
  }

  sessions.set(userId, session);
  return session;
}

// Remove a session without ending its socket.
// Use this when Baileys has already disconnected.
export function unregisterSession(userId) {
  validateUserId(userId);
  return sessions.delete(userId);
}

// Stop an active socket and remove its session.
export function removeSession(userId) {
  validateUserId(userId);

  const session = sessions.get(userId);

  if (!session) return false;

  sessions.delete(userId);

  try {
    session.sock?.end(undefined);
  } catch (error) {
    console.error('Session shutdown error:', error.message);
  }

  return true;
}

export function getSessionCount() {
  return sessions.size;
}

export function listSessionUserIds() {
  return [...sessions.keys()];
}

export function ensureSessionRoot() {
  fs.mkdirSync(SESSION_ROOT, {
    recursive: true,
    mode: 0o700
  });
}