
import {
  BufferJSON,
  initAuthCreds,
  proto
} from '@whiskeysockets/baileys';

import {
  saveEncryptedSession,
  loadEncryptedSession,
  deleteEncryptedSession
} from './storage.js';

function serializeState(creds, keys) {
  return JSON.stringify(
    { creds, keys },
    BufferJSON.replacer
  );
}

function deserializeState(data) {
  const restored = JSON.parse(
    data.toString('utf8'),
    BufferJSON.reviver
  );

  if (!restored?.creds || typeof restored.creds !== 'object') {
    throw new Error('Stored WhatsApp credentials are invalid.');
  }

  return {
    creds: restored.creds,
    keys: restored.keys || {}
  };
}

export async function createUserAuthState(userId) {
  const stored = await loadEncryptedSession(userId);
  console.log('[SESSION-DIAG]', {
  userId,
  sessionFound: Boolean(stored),
  sessionLength: stored ? stored.length : 0
});

  let creds;
  let keyData;

  if (stored) {
  const restored = deserializeState(stored);
  creds = restored.creds;
  keyData = restored.keys;
  
  console.log('[SESSION-FIELDS-DIAG]', {
  registered: creds.registered,
  hasMe: Boolean(creds.me),
  hasAccount: Boolean(creds.account),
  hasNoiseKey: Boolean(creds.noiseKey),
  hasSignedIdentityKey: Boolean(creds.signedIdentityKey),
  hasSignedPreKey: Boolean(creds.signedPreKey),
  hasAdvSecretKey: Boolean(creds.advSecretKey),
  hasNextPreKeyId: Number.isInteger(creds.nextPreKeyId),
  keyCategories: Object.keys(keyData || {})
});
} else {
  creds = initAuthCreds();
  keyData = {};
}

console.log('[SESSION-CREDS-DIAG]', {
  registered: creds.registered,
  hasMe: Boolean(creds.me),
  hasAccount: Boolean(creds.account)
});

  let writeQueue = Promise.resolve();

  function persist() {
    // Capture a snapshot before queuing the write.
    const snapshot = serializeState(creds, keyData);

    writeQueue = writeQueue
      .catch(() => {})
      .then(() => saveEncryptedSession(userId, snapshot));

    return writeQueue;
  }

  const keys = {
    async get(type, ids) {
      const result = {};

      for (const id of ids) {
        let value = keyData[type]?.[id];

        if (value !== undefined && value !== null) {
          if (type === 'app-state-sync-key') {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }

          result[id] = value;
        }
      }

      return result;
    },

    async set(data) {
      for (const [type, entries] of Object.entries(data)) {
        keyData[type] ??= {};

        for (const [id, value] of Object.entries(entries || {})) {
          if (value === null || value === undefined) {
            delete keyData[type][id];
          } else {
            keyData[type][id] = value;
          }
        }
      }

      await persist();
    }
  };

  async function saveCreds() {
    await persist();
  }

  async function clearState() {
    await writeQueue.catch(() => {});
    await deleteEncryptedSession(userId);
  }

  return {
    state: {
      creds,
      keys
    },
    saveCreds,
    flush: () => writeQueue,
    clearState
  };
}
