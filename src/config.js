import 'dotenv/config'

const digits = (s) => (s ?? '').replace(/\D/g, '')

export const config = {
  botName: process.env.BOT_NAME || 'Captain-XMD',
  prefix: process.env.PREFIX || '.',
  sessionId: process.env.SESSION_ID || 'captain-xmd',
  pairNumber: digits(process.env.PAIR_NUMBER),
  pairPassword: process.env.PAIR_PASSWORD || '',
  owners: (process.env.OWNER_NUMBER || '').split(',').map(digits).filter(Boolean),
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
