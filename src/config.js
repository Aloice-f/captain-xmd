import 'dotenv/config'

const digits = (s) => (s ?? '').replace(/\D/g, '')

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

  // How many bots (WhatsApp numbers) may run at once. Each socket costs ~60-100 MB RAM.
  maxSessions: Math.max(1, Number(process.env.MAX_SESSIONS) || 4),

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
