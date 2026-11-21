import 'dotenv/config';

const digits = (process.env.OWNER_NUMBER || '').replace(/\D/g, '');

export const config = {
  prefix: process.env.PREFIX || '.',
  botName: process.env.BOT_NAME || 'Captain XMD',
  ownerNumber: digits,
  sessionDir: process.env.SESSION_DIR || './session',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  translateUrl: process.env.TRANSLATE_URL || '',
  translateApiKey: process.env.TRANSLATE_API_KEY || ''
};

export function ownerJid() {
  return config.ownerNumber ? `${config.ownerNumber}@s.whatsapp.net` : '';
}
