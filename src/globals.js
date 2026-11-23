import { getSetting, setSetting } from './store.js'

/** Bot-wide switches. Kept in memory for speed and saved in Supabase so they survive restarts. */
export const flags = {
  autotyping: false,
  autorecording: false,
  autoviewstatus: false,
  alwaysonline: false
}

export async function loadFlags() {
  for (const key of Object.keys(flags)) flags[key] = !!(await getSetting('global', key, false))
}

export async function setFlag(key, value) {
  await setSetting('global', key, value)
  flags[key] = value
}
