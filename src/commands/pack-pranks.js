import { animate, getTargets, tag } from '../utils.js'

// ALL of these are harmless jokes. Nothing is hacked, tracked or harmed; they only edit a chat message.
const JOKE_NOTE = '\n\n😂 _Just a prank command. Nothing real happened._'

const targetName = (msg, text) => {
  const t = getTargets(msg)[0]
  return t ? { label: tag(t), mentions: [t] } : { label: text || 'the target', mentions: [] }
}

export default [
  {
    name: 'hack', category: 'Pranks', description: 'Fake hacking animation (joke)', usage: '[@user|name]',
    async run({ sock, jid, msg, text }) {
      const { label, mentions } = targetName(msg, text)
      await animate(sock, jid, msg, [
        `💻 Initializing hack on *${label}*...`,
        `[█▒▒▒▒▒▒▒▒▒] 10% — Connecting to server...`,
        `[███▒▒▒▒▒▒▒] 30% — Bypassing firewall...`,
        `[█████▒▒▒▒▒] 50% — Reading very secret memes...`,
        `[████████▒▒] 80% — Downloading 4,000 cat photos...`,
        `[██████████] 100% — ACCESS GRANTED ✅` + JOKE_NOTE
      ], 1500, mentions)
    }
  },
  {
    name: 'kill', category: 'Pranks', description: 'Fictional game-style takedown (joke)', usage: '@user',
    async run({ sock, jid, msg, text }) {
      const { label, mentions } = targetName(msg, text)
      if (!mentions.length && !text) return sock.sendMessage(jid, { text: 'Mention someone: .kill @user' }, { quoted: msg })
      await animate(sock, jid, msg, [
        `🥷 Sneaking up on ${label}...`,
        `⚔️ Critical hit!`,
        `💥 ${label} has been *eliminated* in this totally fictional game.`,
        `✨ ${label} respawned with full health. 🎮` 
      ], 1500, mentions)
    }
  },
  {
    name: 'nuke', category: 'Pranks', description: 'Fake nuke countdown (joke)', usage: '[name]',
    async run({ sock, jid, msg, text }) {
      await animate(sock, jid, msg, [
        `☢️ Launching on *${text || 'the group chat'}* in 3...`, `2...`, `1...`,
        `💥 BOOM! ...of confetti. 🎉` + JOKE_NOTE
      ], 1200)
    }
  },
  {
    name: 'virus', category: 'Pranks', description: 'Fake virus upload (joke)', usage: '[@user|name]',
    async run({ sock, jid, msg, text }) {
      const { label, mentions } = targetName(msg, text)
      await animate(sock, jid, msg, [
        `🦠 Uploading virus to *${label}*...`, `[███▒▒▒▒▒▒▒] 30%`, `[███████▒▒▒] 70%`,
        `[██████████] 100% — Virus installed: *"TooMuchHomework.exe"* 📚` + JOKE_NOTE
      ], 1300, mentions)
    }
  },
  {
    name: 'trace', category: 'Pranks', description: 'Fake IP trace (joke)', usage: '[@user|name]',
    async run({ sock, jid, msg, text }) {
      const { label, mentions } = targetName(msg, text)
      await animate(sock, jid, msg, [
        `📡 Tracing *${label}*...`, `🛰 Locking satellites...`,
        `📍 IP: 192.0.2.${Math.floor(Math.random() * 255)}  (a reserved example address)\n🌍 Location: Somewhere on Planet Earth\n🕵️ Status: Probably eating snacks` + JOKE_NOTE
      ], 1400, mentions)
    }
  }
]
