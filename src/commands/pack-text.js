import crypto from 'node:crypto'

const need = (name, usage) => `Usage: .${name} ${usage}`

// --- unicode styles (contiguous mathematical alphabets) ---
const style = (upperStart, lowerStart) => (t) =>
  [...t].map((c) => {
    if (/[A-Z]/.test(c)) return String.fromCodePoint(upperStart + c.charCodeAt(0) - 65)
    if (/[a-z]/.test(c)) return String.fromCodePoint(lowerStart + c.charCodeAt(0) - 97)
    return c
  }).join('')
const STYLES = [style(0x1d400, 0x1d41a), style(0x1d4d0, 0x1d4ea), style(0x1d56c, 0x1d586), style(0x1d670, 0x1d68a)]

const FLIP = 'ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz'
const MORSE = {
  a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--',
  n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.'
}
const UNITS = {
  m: ['len', 1], km: ['len', 1000], cm: ['len', 0.01], mm: ['len', 0.001], mi: ['len', 1609.344], ft: ['len', 0.3048], in: ['len', 0.0254], yd: ['len', 0.9144],
  kg: ['mass', 1], g: ['mass', 0.001], lb: ['mass', 0.45359237], oz: ['mass', 0.028349523],
  l: ['vol', 1], ml: ['vol', 0.001], gal: ['vol', 3.785411784]
}
const toC = { c: (v) => v, f: (v) => (v - 32) * 5 / 9, k: (v) => v - 273.15 }
const fromC = { c: (v) => v, f: (v) => v * 9 / 5 + 32, k: (v) => v + 273.15 }

export default [
  { name: 'reverse', category: 'Text', description: 'Reverse text', usage: '<text>',
    async run({ reply, text }) { await reply(text ? [...text].reverse().join('') : need('reverse', '<text>')) } },
  { name: 'upper', category: 'Text', description: 'UPPERCASE text', usage: '<text>',
    async run({ reply, text }) { await reply(text ? text.toUpperCase() : need('upper', '<text>')) } },
  { name: 'lower', category: 'Text', description: 'lowercase text', usage: '<text>',
    async run({ reply, text }) { await reply(text ? text.toLowerCase() : need('lower', '<text>')) } },
  { name: 'mock', category: 'Text', description: 'sPoNgEbOb mocking text', usage: '<text>',
    async run({ reply, text }) {
      if (!text) return reply(need('mock', '<text>'))
      let i = 0
      await reply([...text].map((c) => (/[a-z]/i.test(c) ? (i++ % 2 ? c.toUpperCase() : c.toLowerCase()) : c)).join(''))
    } },
  { name: 'fancy', category: 'Text', description: 'Stylish fonts', usage: '<text>',
    async run({ reply, text }) { await reply(text ? STYLES.map((f) => f(text)).join('\n\n') : need('fancy', '<text>')) } },
  { name: 'upside', category: 'Text', description: 'Upside-down text', usage: '<text>',
    async run({ reply, text }) {
      if (!text) return reply(need('upside', '<text>'))
      await reply([...text.toLowerCase()].reverse().map((c) => (/[a-z]/.test(c) ? FLIP[c.charCodeAt(0) - 97] : c)).join(''))
    } },
  { name: 'binary', category: 'Text', description: 'Text to binary', usage: '<text>',
    async run({ reply, text }) {
      if (!text) return reply(need('binary', '<text>'))
      await reply([...Buffer.from(text)].map((b) => b.toString(2).padStart(8, '0')).join(' '))
    } },
  { name: 'debinary', category: 'Text', description: 'Binary to text', usage: '<binary>',
    async run({ reply, text }) {
      const bytes = text.split(/\s+/).filter((x) => /^[01]{8}$/.test(x)).map((b) => parseInt(b, 2))
      await reply(bytes.length ? Buffer.from(bytes).toString() : 'Give me 8-bit groups, e.g. 01001000 01101001')
    } },
  { name: 'b64', aliases: ['base64'], category: 'Text', description: 'Base64 encode', usage: '<text>',
    async run({ reply, text }) { await reply(text ? Buffer.from(text).toString('base64') : need('b64', '<text>')) } },
  { name: 'unb64', category: 'Text', description: 'Base64 decode', usage: '<base64>',
    async run({ reply, text }) {
      if (!text) return reply(need('unb64', '<base64>'))
      await reply(Buffer.from(text, 'base64').toString('utf8'))
    } },
  { name: 'morse', category: 'Text', description: 'Text to Morse code', usage: '<text>',
    async run({ reply, text }) {
      if (!text) return reply(need('morse', '<text>'))
      await reply([...text.toLowerCase()].map((c) => (c === ' ' ? '/' : MORSE[c] ?? '')).filter(Boolean).join(' '))
    } },
  { name: 'wordcount', aliases: ['wc'], category: 'Text', description: 'Count words and characters', usage: '<text>',
    async run({ reply, text }) {
      if (!text) return reply(need('wordcount', '<text>'))
      await reply(`📝 Words: ${text.split(/\s+/).filter(Boolean).length}\nCharacters: ${text.length}`)
    } },
  { name: 'password', aliases: ['pass'], category: 'Text', description: 'Strong random password', usage: '[length]',
    async run({ reply, args }) {
      const len = Math.min(Math.max(parseInt(args[0]) || 16, 8), 64)
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?'
      let out = ''
      for (const b of crypto.randomBytes(len)) out += chars[b % chars.length]
      await reply(`🔐 ${out}\n\n_Use this in a private chat, and don't reuse it._`)
    } },
  { name: 'bmi', category: 'Text', description: 'Body mass index', usage: '<kg> <cm>',
    async run({ reply, args }) {
      const [kg, cm] = args.map(Number)
      if (!kg || !cm) return reply('Usage: .bmi 70 175')
      const bmi = kg / (cm / 100) ** 2
      const cat = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese'
      await reply(`⚖️ BMI: *${bmi.toFixed(1)}* (${cat})\n_General guide only, not medical advice._`)
    } },
  { name: 'age', category: 'Text', description: 'Age from birth date', usage: 'YYYY-MM-DD',
    async run({ reply, args }) {
      const d = new Date(args[0])
      if (isNaN(d) || d > new Date()) return reply('Usage: .age 2000-05-17')
      const n = new Date()
      let y = n.getFullYear() - d.getFullYear(), m = n.getMonth() - d.getMonth(), day = n.getDate() - d.getDate()
      if (day < 0) { m--; day += new Date(n.getFullYear(), n.getMonth(), 0).getDate() }
      if (m < 0) { y--; m += 12 }
      await reply(`🎂 ${y} years, ${m} months, ${day} days`)
    } },
  { name: 'convert', aliases: ['conv'], category: 'Text', description: 'Convert units', usage: '<n> <from> <to>',
    async run({ reply, args }) {
      const v = parseFloat(args[0]); const f = (args[1] || '').toLowerCase(); const t = (args[2] || '').toLowerCase()
      const help = 'Usage: .convert 10 km mi\nUnits: m km cm mm mi ft in yd | kg g lb oz | l ml gal | c f k'
      if (isNaN(v) || !f || !t) return reply(help)
      let out
      if (toC[f] && toC[t]) out = fromC[t](toC[f](v))
      else if (UNITS[f] && UNITS[t] && UNITS[f][0] === UNITS[t][0]) out = (v * UNITS[f][1]) / UNITS[t][1]
      else return reply(help)
      await reply(`🔁 ${v} ${f} = *${+out.toFixed(4)} ${t}*`)
    } }
]
