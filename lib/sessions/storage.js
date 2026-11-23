
import { createServerSupabase } from '../supabase.js';
import {
  encryptSessionData,
  decryptSessionData
} from './encryption.js';

const BUCKET = 'whatsapp-sessions';

function validateUserId(userId) {
  if (
    typeof userId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
  ) {
    throw new Error('Invalid authenticated user ID.');
  }
}

function getSessionPath(userId) {
  validateUserId(userId);
  return `${userId}/session.enc`;
}

export async function saveEncryptedSession(userId, sessionData) {
  const path = getSessionPath(userId);

  if (
    typeof sessionData !== 'string' &&
    !Buffer.isBuffer(sessionData)
  ) {
    throw new Error('Session data must be a string or Buffer.');
  }

  const supabase = createServerSupabase();
  const encrypted = encryptSessionData(sessionData);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([encrypted]), {
      contentType: 'application/json',
      upsert: true
    });

  if (error) throw error;

  return true;
}

export async function loadEncryptedSession(userId) {
  const path = getSessionPath(userId);
  const supabase = createServerSupabase();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(path);

  if (error) {
    if (error.statusCode === '404' || error.status === 404) {
      return null;
    }
    throw error;
  }

  return decryptSessionData(await data.text());
}

export async function deleteEncryptedSession(userId) {
  const path = getSessionPath(userId);
  const supabase = createServerSupabase();

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([path]);

  if (error) throw error;

  return true;
}
