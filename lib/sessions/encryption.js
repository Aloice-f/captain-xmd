
import {
  createCipheriv,
  createDecipheriv,
  randomBytes
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey() {
  const encoded = process.env.WHATSAPP_SESSION_ENCRYPTION_KEY;

  if (!encoded) {
    throw new Error('WhatsApp encryption key is missing.');
  }

  // Accept valid Base64 with or without trailing padding.
  const normalized =
    encoded + '='.repeat((4 - encoded.length % 4) % 4);

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error('WhatsApp encryption key has invalid Base64 characters.');
  }

  const key = Buffer.from(normalized, 'base64');

  if (
    key.length !== 32 ||
    key.toString('base64') !== normalized
  ) {
    throw new Error(
      'WhatsApp encryption key must decode to exactly 32 bytes.'
    );
  }

  return key;
}

export function encryptSessionData(data) {
  if (
    typeof data !== 'string' &&
    !Buffer.isBuffer(data)
  ) {
    throw new Error('Session data must be a string or Buffer.');
  }

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = Buffer.isBuffer(data)
    ? data
    : Buffer.from(data, 'utf8');

  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final()
  ]);

  return JSON.stringify({
    version: 1,
    algorithm: ALGORITHM,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64')
  });
}

export function decryptSessionData(encryptedData) {
  const key = getEncryptionKey();

  let envelope;

  try {
    envelope = JSON.parse(encryptedData);
  } catch {
    throw new Error('Invalid encrypted session format.');
  }

  if (
    envelope?.version !== 1 ||
    envelope?.algorithm !== ALGORITHM
  ) {
    throw new Error('Unsupported encrypted session format.');
  }

  const iv = Buffer.from(envelope.iv || '', 'base64');
  const tag = Buffer.from(envelope.tag || '', 'base64');
  const data = Buffer.from(envelope.data || '', 'base64');

  if (
    iv.length !== IV_LENGTH ||
    tag.length !== TAG_LENGTH
  ) {
    throw new Error('Invalid encrypted session parameters.');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(data),
    decipher.final()
  ]);
}
