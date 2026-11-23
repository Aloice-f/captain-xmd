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
