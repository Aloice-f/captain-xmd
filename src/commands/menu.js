import { config } from '../config.js'
import { formatUptime, sendBanner } from '../utils.js'

const ICONS = {
  General: '⚓', Fun: '🎲', Pranks: '😈', Text: '🔤', Info: '🌍', Download: '📥',
  Group: '👥', Auto: '⚙️', Tools: '🛠', Owner: '👑'
}
const ORDER = ['General', 'Fun', 'Pranks', 'Text', 'Info', 'Download', 'Group', 'Auto', 'Tools', 'Owner']

function groupBy(commands) {
  const groups = {}
  for (const c of new Set(commands.values())) (groups[c.category ?? 'General'] ??= []).push(c)
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => a.name.localeCompare(b.name))
  const cats = [...ORDER.filter((c) => groups[c]), ...Object.keys(groups).filter((c) => !ORDER.includes(c))]
  return { groups, cats }
}

// Names only: no descriptions.
const block = (cat, list) =>
  `╭━━❰ ${ICONS[cat] ?? '•'} *${cat.toUpperCase()}* ❱━━⬣\n` +
  list.map((c) => `┃ ◈ ${config.prefix}${c.name}`).join('\n') +
  `\n╰━━━━━━━━━━━━━━⬣`

/** Split long text into WhatsApp-friendly chunks, keeping each category block whole. */
function chunk(blocks, max = 3000) {
  const out = []
  let cur = ''
  for (const b of blocks) {
    if (cur && cur.length + b.length + 2 > max) { out.push(cur); cur = '' }
    cur += (cur ? '\n\n' : '') + b
  }
  if (cur) out.push(cur)
  return out
}

export default [
  {
    name: 'menu',
    aliases: ['help', 'commands'],
    category: 'General',
    description: 'Show categories',
    async run({ sock, jid, msg, commands, text }) {
      const { groups, cats } = groupBy(commands)
      const total = new Set(commands.values()).size
      const wanted = cats.find((c) => c.toLowerCase() === text.trim().toLowerCase())

      if (wanted) {
        for (const p of chunk([block(wanted, groups[wanted])])) await sock.sendMessage(jid, { text: p }, { quoted: msg })
        return
      }

      const now = new Date().toLocaleString('en-GB', { timeZone: config.timezone, hour12: false })
      const caption =
        `╭━━━━〔 ⚓ *${config.botName.toUpperCase()}* 〕━━━━⬣\n` +
        `┃ ✦ Prefix   : ${config.prefix}\n` +
        `┃ ✦ Commands : ${total}\n` +
        `┃ ✦ Uptime   : ${formatUptime(process.uptime())}\n` +
        `┃ ✦ Time     : ${now}\n` +
        `╰━━━━━━━━━━━━━━━━━━⬣\n\n` +
        `╭━━❰ 📂 *CATEGORIES* ❱━━⬣\n` +
        cats.map((c) => `┃ ${ICONS[c] ?? '•'} ${config.prefix}menu ${c.toLowerCase()}  ›  ${groups[c].length}`).join('\n') +
        `\n╰━━━━━━━━━━━━━━⬣\n\n` +
        `_Send *${config.prefix}allmenu* to see every command._`
      await sendBanner(sock, jid, caption, { quoted: msg })
    }
  },
  {
    name: 'allmenu',
    aliases: ['all', 'list'],
    category: 'General',
    description: 'Show every command',
    async run({ sock, jid, msg, commands }) {
      const { groups, cats } = groupBy(commands)
      for (const part of chunk(cats.map((c) => block(c, groups[c])))) {
        await sock.sendMessage(jid, { text: part }, { quoted: msg })
      }
    }
  }
]
