
import { createServerSupabase } from '../supabase.js';
import {
  encryptSessionData,
  decryptSessionData
} from './encryption.js';

const BUCKET = 'whatsapp-sessions';

function getAuthenticatedUserId(req) {
  const userId = req?.user?.id;

  if (
    typeof userId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
  ) {
    throw new Error('A verified authenticated user is required.');
  }

  return userId;
}

function getTokenPath(userId) {
  return `${userId}/auth-tokens.enc`;
}

export async function savePersistentUserTokens(req, tokens) {
  const userId = getAuthenticatedUserId(req);

  if (
    !tokens ||
    typeof tokens.accessToken !== 'string' ||
    typeof tokens.refreshToken !== 'string'
  ) {
    throw new Error('Valid authentication tokens are required.');
  }

  const supabase = createServerSupabase();
  const path = getTokenPath(userId);

  const encrypted = encryptSessionData(
    JSON.stringify({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt ?? null
    })
  );

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([encrypted]), {
      contentType: 'application/json',
      upsert: true
    });

  if (error) throw error;

  return { saved: true };
}

export async function loadPersistentUserTokens(req) {
  const userId = getAuthenticatedUserId(req);
  const supabase = createServerSupabase();
  const path = getTokenPath(userId);

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(path);

  if (error) {
    if (error.statusCode === '404' || error.status === 404) {
      return null;
    }
    throw error;
  }

  const decrypted = decryptSessionData(await data.text());
  const tokens = JSON.parse(decrypted.toString('utf8'));

  if (
    typeof tokens.accessToken !== 'string' ||
    typeof tokens.refreshToken !== 'string'
  ) {
    throw new Error('Stored authentication tokens are invalid.');
  }

  return tokens;
}

export async function deletePersistentUserTokens(req) {
  const userId = getAuthenticatedUserId(req);
  const supabase = createServerSupabase();
  const path = getTokenPath(userId);

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([path]);

  if (error) throw error;

  return true;
}
