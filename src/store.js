import { supabase } from './supabase.js'

const cache = new Map()
const TTL = 60_000

export async function getSetting(chat, key, fallback = null) {
  const ck = `${chat}|${key}`
  const hit = cache.get(ck)
  if (hit && Date.now() - hit.t < TTL) return hit.v
  try {
    const { data, error } = await supabase
      .from('chat_settings').select('value').eq('chat_id', chat).eq('key', key).maybeSingle()
    if (error) throw error
    const v = data ? data.value : fallback
    cache.set(ck, { v, t: Date.now() })
    return v
  } catch (e) {
    console.error('getSetting failed:', e.message)
    return fallback
  }
}

export async function setSetting(chat, key, value) {
  const { error } = await supabase.from('chat_settings').upsert({ chat_id: chat, key, value }, { onConflict: 'chat_id,key' })
  if (error) throw new Error(`Could not save setting (did you run the new SQL in supabase/schema.sql?): ${error.message}`)
  cache.set(`${chat}|${key}`, { v: value, t: Date.now() })
}

/**
 * Settings for one bot. Rows are namespaced (`session:<id>:<chat>`) so two bots that
 * sit in the same group keep separate welcome/antilink settings.
 * Reads fall back to the old un-namespaced rows once, so upgrading does not reset settings.
 */
export function scopedStore(scope) {
  const chatId = (chat) => `${scope}:${chat}`
  return {
    async get(chat, key, fallback = null) {
      const current = await getSetting(chatId(chat), key, undefined)
      if (current !== undefined) return current
      const legacy = await getSetting(chat, key, undefined)
      if (legacy !== undefined) await setSetting(chatId(chat), key, legacy).catch(() => {})
      return legacy !== undefined ? legacy : fallback
    },
    set: (chat, key, value) => setSetting(chatId(chat), key, value)
  }
}

/** Metadata for the dashboard (label, numbers). Session credentials live in wa_sessions. */
export async function updateSessionRow(id, patch) {
  const { error } = await supabase
    .from('bot_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Could not update bot: ${error.message}`)
}
