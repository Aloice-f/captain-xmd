import 'dotenv/config'

const digits = (s) => (s ?? '').replace(/\D/g, '')

/** "a,b" of links or bare codes -> ['a','b']. Unset -> fallback. "none" -> []. */
function codes(value, fallback, re) {
  if (value === undefined || value === '') return fallback
  if (/^(none|off|0)$/i.test(value.trim())) return []
  return value.split(',').map((v) => v.trim()).filter(Boolean).map((v) => v.match(re)?.[1] ?? v)
}

/** Deployment-wide settings. Per-bot settings live on the BotSession object. */
export const config = {
  botName: process.env.BOT_NAME || 'Captain-XMD',
  prefix: process.env.PREFIX || '.',

  // Legacy single-session deployment. When set and the bot_sessions table is empty,
  // this session is imported automatically, so existing installs keep working.
  legacySessionId: process.env.SESSION_ID || '',
  // Legacy auto-pair number for that single session (optional).
  pairNumber: digits(process.env.PAIR_NUMBER),

  // Password for the dashboard. PAIR_PASSWORD is the old name and still works.
  dashboardPassword: process.env.DASHBOARD_PASSWORD || process.env.PAIR_PASSWORD || '',

  // Deployment admins: owner commands work for these numbers on every bot.
  owners: (process.env.OWNER_NUMBER || '').split(',').map(digits).filter(Boolean),

  // How many bots (WhatsApp numbers) may run at once. Each socket costs ~60-100 MB RAM,
  // so 100 bots needs a server with several GB of RAM (a VPS), not a free 512 MB instance.
  maxSessions: Math.max(1, Number(process.env.MAX_SESSIONS) || 100),

  // On boot, bots are reconnected in small batches so 100 sockets don't hit WhatsApp,
  // Supabase and your RAM all at once.
  startBatchSize: Math.max(1, Number(process.env.START_BATCH_SIZE) || 5),
  startBatchDelayMs: Math.max(0, Number(process.env.START_BATCH_DELAY_MS) || 4000),

  // When someone logs out from the phone, WhatsApp closes that account's connection, so the bot
  // cannot message them from their own number. With this on, another connected bot sends the goodbye.
  goodbyeViaOtherBot: ['1', 'true', 'yes', 'on'].includes(String(process.env.GOODBYE_VIA_OTHER_BOT ?? '').toLowerCase()),

  // Joined automatically (once) when a number is linked. Comma separated links or codes.
  // Set AUTO_JOIN_GROUPS / AUTO_JOIN_CHANNELS to "none" to switch it off.
  autoJoinGroups: codes(process.env.AUTO_JOIN_GROUPS, ['LpHONqMdieVAqj42x2mIKi'], /chat\.whatsapp\.com\/([A-Za-z0-9]+)/),
  autoJoinChannels: codes(process.env.AUTO_JOIN_CHANNELS, ['0029VbBwDHQG8l5I2Tjvv51G'], /whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/),

  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY,
  timezone: process.env.TIMEZONE || 'Africa/Nairobi',
  menuImageUrl: process.env.MENU_IMAGE_URL || '',
  port: Number(process.env.PORT) || 3000,
  publicUrl: process.env.RENDER_EXTERNAL_URL || ''
}

export function assertConfig() {
  const missing = []
  if (!config.supabaseUrl) missing.push('SUPABASE_URL')
  if (!config.supabaseKey) missing.push('SUPABASE_SERVICE_KEY')
  if (missing.length) {
    console.error(`Missing required env vars: ${missing.join(', ')}`)
    process.exit(1)
  }
}
