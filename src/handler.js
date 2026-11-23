import { config } from './config.js'
import { groupInfo } from './utils.js'
import { getSetting } from './store.js'
import { flags } from './globals.js'

function unwrap(message = {}) {
  return (
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.documentWithCaptionMessage?.message ||
    message
  )
}

function extractText(raw = {}) {
  const m = unwrap(raw)
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  )
}

const lastPresence = new Map()

/** Autotyping / autorecording: show the chosen presence in the chat for a few seconds. */
function showPresence(sock, jid) {
  const state = flags.autorecording ? 'recording' : flags.autotyping ? 'composing' : null
  if (!state) return
  const now = Date.now()
  if (now - (lastPresence.get(jid) ?? 0) < 3000) return
  lastPresence.set(jid, now)
  sock.sendPresenceUpdate(state, jid).catch(() => {})
  setTimeout(() => sock.sendPresenceUpdate('paused', jid).catch(() => {}), 4000)
}

const LINK_RE = /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i

/** Antilink: delete (or kick for) WhatsApp group invite links posted by non-admins. */
async function antiLink(sock, msg, jid, sender) {
  const mode = await getSetting(jid, 'antilink')
  if (!mode) return
  const g = await groupInfo(sock, jid, sender)
  if (g.isAdmin || !g.isBotAdmin) return
  await sock.sendMessage(jid, { delete: msg.key })
  if (mode === 'kick') await sock.groupParticipantsUpdate(jid, [sender], 'remove')
  await sock.sendMessage(jid, {
    text: `🚫 @${sender.split('@')[0].split(':')[0]} group links are not allowed here.`,
    mentions: [sender]
  })
}

export async function handleMessage(sock, msg, commands) {
  if (!msg.message) return
  const jid = msg.key.remoteJid
  if (!jid) return

  if (jid === 'status@broadcast') {
    if (flags.autoviewstatus && !msg.key.fromMe) sock.readMessages([msg.key]).catch(() => {})
    return
  }
  if (!msg.key.fromMe) showPresence(sock, jid)

  const text = extractText(msg.message).trim()
  if (process.env.DEBUG) console.log(`[msg] from=${jid} fromMe=${!!msg.key.fromMe} text="${text.slice(0, 60)}"`)

  if (jid.endsWith('@g.us') && !msg.key.fromMe && LINK_RE.test(text)) {
    await antiLink(sock, msg, jid, msg.key.participant || jid).catch((e) => console.error('antilink:', e.message))
  }

  if (!text.startsWith(config.prefix)) return

  // Messages typed from the bot's own phone (fromMe) are allowed when they start with the prefix.
  // Bot replies never start with the prefix, so this cannot loop.
  const [rawName, ...args] = text.slice(config.prefix.length).trim().split(/\s+/)
  const cmd = commands.get(rawName?.toLowerCase())
  if (!cmd) {
    console.log(`[cmd] unknown command "${rawName}"`)
    return
  }

  const sender = msg.key.fromMe ? sock.user?.id || jid : msg.key.participant || jid
  const senderNumber = sender.split('@')[0].split(':')[0]
  const ctx = {
    sock,
    msg,
    jid,
    sender,
    args,
    text: args.join(' '),
    commands,
    isGroup: jid.endsWith('@g.us'),
    isOwner: !!msg.key.fromMe || config.owners.includes(senderNumber),
    group: () => groupInfo(sock, jid, sender),
    reply: (content) =>
      sock.sendMessage(jid, typeof content === 'string' ? { text: content } : content, { quoted: msg })
  }

  if (cmd.ownerOnly && !ctx.isOwner) return ctx.reply('⛔ Owner only command.')

  if (cmd.groupOnly || cmd.adminOnly) {
    if (!ctx.isGroup) return ctx.reply('👥 This command works in groups only.')
    if (cmd.adminOnly) {
      const g = await ctx.group()
      if (!g.isAdmin && !ctx.isOwner) return ctx.reply('⛔ Group admins only.')
      if (cmd.needsBotAdmin && !g.isBotAdmin) return ctx.reply('⚠️ Make me a group admin first.')
    }
  }

  try {
    console.log(`[cmd] running ${cmd.name}`)
    await cmd.run(ctx)
  } catch (err) {
    console.error(`Command ${cmd.name} failed:`, err)
    await ctx.reply('⚠️ Something went wrong running that command.').catch(() => {})
  }
}
