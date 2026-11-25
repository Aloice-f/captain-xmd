import { getBuffer } from '../utils.js'

/**
 * AI commands use the free Pollinations API (no key needed): https://pollinations.ai
 * Each command asks a different model; if that model is not available it falls back to the default one.
 * Override with AI_BASE_URL / AI_IMAGE_URL, or the model names with AI_MODELS='{"gpt":"openai","claude":"claude"}'.
 */
const BASE = (process.env.AI_BASE_URL || 'https://text.pollinations.ai').replace(/\/$/, '')
const IMAGE_BASE = (process.env.AI_IMAGE_URL || 'https://image.pollinations.ai/prompt').replace(/\/$/, '')

const MODELS = {
  gpt: 'openai', deepseek: 'deepseek', gemini: 'gemini', claude: 'claude', copilot: 'openai', blackbox: 'qwen-coder',
  islamai: 'openai', ...(() => { try { return JSON.parse(process.env.AI_MODELS || '{}') } catch { return {} } })()
}

const SYSTEM = {
  blackbox: 'You are a coding assistant. Give short, correct answers with code in plain text. Keep answers under 1500 characters.',
  islamai:
    'You are a respectful Islamic knowledge assistant. Answer from the Quran and authentic Sunnah, name the source (surah:ayah or hadith collection) when you are sure, ' +
    'mention when scholars differ, and tell the person to ask a qualified scholar for personal rulings (fatwa). Never invent sources. Keep answers under 1500 characters.',
  default: 'You are a helpful assistant replying inside WhatsApp. Be clear and concise, under 1500 characters.'
}

const cooldown = new Map() // sender -> last call, stops one person flooding the API
const COOLDOWN_MS = 6000

async function ask(model, prompt, system) {
  const call = async (m) => {
    const qs = new URLSearchParams({ system })
    if (m) qs.set('model', m)
    const r = await fetch(`${BASE}/${encodeURIComponent(prompt)}?${qs}`, { signal: AbortSignal.timeout(60_000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const t = (await r.text()).trim()
    if (!t) throw new Error('empty answer')
    return t
  }
  try {
    return await call(model)
  } catch {
    return await call(null) // that model is down: use the default one
  }
}

const aiCmd = (name, title, aliases = []) => ({
  name, aliases, category: 'AI', description: `Ask ${title}`, usage: '<question>',
  async run({ text, reply, sender, msg }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || ''
    const prompt = [text, quotedText && `(Context: ${quotedText})`].filter(Boolean).join(' ').slice(0, 1500)
    if (!prompt) return reply(`Usage: .${name} your question`)

    const last = cooldown.get(sender) ?? 0
    if (Date.now() - last < COOLDOWN_MS) return reply('⏳ Please wait a few seconds before asking again.')
    cooldown.set(sender, Date.now())
    if (cooldown.size > 500) cooldown.delete(cooldown.keys().next().value)

    try {
      const answer = await ask(MODELS[name], prompt, SYSTEM[name] || SYSTEM.default)
      await reply(`🤖 *${title}*\n\n${answer.slice(0, 3500)}`)
    } catch (e) {
      await reply(`⚠️ The AI service did not answer (${e.message}). Try again in a minute.`)
    }
  }
})

export default [
  aiCmd('gpt', 'GPT', ['chatgpt']),
  aiCmd('deepseek', 'DeepSeek'),
  aiCmd('gemini', 'Gemini'),
  aiCmd('claude', 'Claude'),
  aiCmd('copilot', 'Copilot'),
  aiCmd('blackbox', 'Blackbox'),
  aiCmd('islamai', 'Islam AI', ['islamicai']),
  {
    name: 'texttoimage', aliases: ['imagine', 'text2img'], category: 'AI', description: 'Create an image from text', usage: '<description>',
    async run({ sock, jid, msg, text, reply, sender }) {
      if (!text) return reply('Usage: .texttoimage a lion wearing a crown, digital art')
      const last = cooldown.get(sender) ?? 0
      if (Date.now() - last < COOLDOWN_MS) return reply('⏳ Please wait a few seconds before asking again.')
      cooldown.set(sender, Date.now())
      await reply('🎨 Creating your image, this can take up to a minute...')
      const seed = Math.floor(Math.random() * 1e6)
      const url = `${IMAGE_BASE}/${encodeURIComponent(text.slice(0, 500))}?width=1024&height=1024&nologo=true&seed=${seed}`
      const { buffer } = await getBuffer(url, 15)
      await sock.sendMessage(jid, { image: buffer, caption: `🎨 ${text.slice(0, 200)}` }, { quoted: msg })
    }
  }
]
