
import {
  encryptSessionData,
  decryptSessionData
} from './encryption.js';

const userTokens = new Map();

export function storeUserTokens(userId, tokens) {
  if (
    typeof userId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
  ) {
    throw new Error('Invalid authenticated user ID.');
  }

  if (
    !tokens ||
    typeof tokens.accessToken !== 'string' ||
    typeof tokens.refreshToken !== 'string'
  ) {
    throw new Error('Valid user authentication tokens are required.');
  }

  const encrypted = encryptSessionData(
    JSON.stringify({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt ?? null
    })
  );

  userTokens.set(userId, encrypted);
}

export function getUserTokens(userId) {
  const encrypted = userTokens.get(userId);

  if (!encrypted) return null;

  return JSON.parse(
    decryptSessionData(encrypted).toString('utf8')
  );
}

export function removeUserTokens(userId) {
  return userTokens.delete(userId);
}

export function getTokenVaultSize() {
  return userTokens.size;
}
