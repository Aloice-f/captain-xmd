import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys'

/** Read one session's creds without opening a socket. Returns null when the bot is not linked yet. */
export async function readCreds(supabase, sessionId, table = 'wa_sessions') {
  const { data, error } = await supabase
    .from(table)
    .select('value')
    .eq('session_id', sessionId)
    .eq('key', 'creds')
    .maybeSingle()
  if (error) throw new Error(`Supabase read failed: ${error.message}`)
  return data ? JSON.parse(data.value, BufferJSON.reviver) : null
}

/**
 * Baileys auth state backed by a Supabase table (see supabase/schema.sql).
 * Drop-in replacement for useMultiFileAuthState.
 */
export async function useSupabaseAuthState(supabase, sessionId, table = 'wa_sessions') {
  const serialize = (data) => JSON.stringify(data, BufferJSON.replacer)
  const parse = (text) => JSON.parse(text, BufferJSON.reviver)

  const writeMany = async (entries) => {
    if (!entries.length) return
    const rows = entries.map(([key, data]) => ({
      session_id: sessionId,
      key,
      value: serialize(data),
      updated_at: new Date().toISOString()
    }))
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'session_id,key' })
    if (error) throw new Error(`Supabase write failed: ${error.message}`)
  }

  const removeMany = async (keys) => {
    if (!keys.length) return
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('session_id', sessionId)
      .in('key', keys)
    if (error) throw new Error(`Supabase delete failed: ${error.message}`)
  }

  const readMany = async (keys) => {
    if (!keys.length) return {}
    const { data, error } = await supabase
      .from(table)
      .select('key, value')
      .eq('session_id', sessionId)
      .in('key', keys)
    if (error) throw new Error(`Supabase read failed: ${error.message}`)
    const out = {}
    for (const row of data ?? []) out[row.key] = parse(row.value)
    return out
  }

  const existing = await readMany(['creds'])
  // A pairing attempt that never finished leaves a half-made identity (me, pairingCode) in storage.
  // Reusing it makes WhatsApp treat the bot as an old device and reject new codes, so start clean.
  const unfinished = existing.creds && !existing.creds.registered && !existing.creds.account
  if (unfinished) {
    console.log('Discarding an unfinished pairing attempt and starting a fresh link session.')
    await supabase.from(table).delete().eq('session_id', sessionId)
  }
  const creds = existing.creds && !unfinished ? existing.creds : initAuthCreds()

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const names = ids.map((id) => `${type}-${id}`)
          const found = await readMany(names)
          const result = {}
          for (const id of ids) {
            let value = found[`${type}-${id}`]
            if (value && type === 'app-state-sync-key') {
              value = proto.Message.AppStateSyncKeyData.fromObject(value)
            }
            if (value) result[id] = value
          }
          return result
        },
        set: async (data) => {
          const upserts = []
          const deletes = []
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id]
              const name = `${category}-${id}`
              if (value) upserts.push([name, value])
              else deletes.push(name)
            }
          }
          await writeMany(upserts)
          await removeMany(deletes)
        }
      }
    },
    saveCreds: () => writeMany([['creds', creds]]),
    clearSession: async () => {
      const { error } = await supabase.from(table).delete().eq('session_id', sessionId)
      if (error) throw new Error(`Supabase clear failed: ${error.message}`)
    }
  }
}
