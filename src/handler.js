import { groupInfo } from './utils.js'

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
function showPresence(sock, jid, session) {
  const { flags } = session
  const state = flags.autorecording ? 'recording' : flags.autotyping ? 'composing' : null
  if (!state) return

  const key = `${session.id}|${jid}`
  const now = Date.now()

  if (now - (lastPresence.get(key) ?? 0) < 3000) return

  lastPresence.set(key, now)
  sock.sendPresenceUpdate(state, jid).catch(() => {})

  setTimeout(() => sock.sendPresenceUpdate('paused', jid).catch(() => {}), 4000)
}

const LINK_RE = /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i

/** Antilink: delete (or kick for) WhatsApp group invite links posted by non-admins. */
async function antiLink(sock, msg, jid, sender, session) {
  const mode = await session.store.get(jid, 'antilink')
  if (!mode) return

  const g = await groupInfo(sock, jid, sender)
  if (g.isAdmin || !g.isBotAdmin) return

  await sock.sendMessage(jid, { delete: msg.key })

  if (mode === 'kick') {
    await sock.groupParticipantsUpdate(jid, [sender], 'remove')
  }

  await sock.sendMessage(jid, {
    text: `🚫 @${sender.split('@')[0].split(':')[0]} group links are not allowed here.`,
    mentions: [sender]
  })
}

/** React to the original command message; reaction errors must not break commands. */
async function reactToCommand(sock, msg, emoji) {
  try {
    await sock.sendMessage(msg.key.remoteJid, {
      react: {
        text: emoji,
        key: msg.key
      }
    })
  } catch (err) {
    if (process.env.DEBUG) {
      console.warn('command reaction failed:', err.message)
    }
  }
}

export async function handleMessage(sock, msg, commands, session) {
  if (!msg.message) return

  const jid = msg.key.remoteJid
  if (!jid) return

  if (jid === 'status@broadcast') {
    if (session.flags.autoviewstatus && !msg.key.fromMe) {
      sock.readMessages([msg.key]).catch(() => {})
    }
    return
  }

  if (!msg.key.fromMe) {
    showPresence(sock, jid, session)
  }

  const text = extractText(msg.message).trim()

  if (process.env.DEBUG) {
    console.log(
      `[${session.id}] [msg] from=${jid} fromMe=${!!msg.key.fromMe} text="${text.slice(0, 60)}"`
    )
  }

  if (jid.endsWith('@g.us') && !msg.key.fromMe && LINK_RE.test(text)) {
    await antiLink(sock, msg, jid, msg.key.participant || jid, session).catch((e) =>
      console.error('antilink:', e.message)
    )
  }

  const prefix = session.prefix
  if (!text.startsWith(prefix)) return

  // Messages typed from the bot's own phone (fromMe) are allowed when they start with the prefix.
  // Bot replies never start with the prefix, so this cannot loop.
  const [rawName, ...args] = text.slice(prefix.length).trim().split(/\s+/)
  const cmd = commands.get(rawName?.toLowerCase())

  if (!cmd) {
    console.log(`[${session.id}] [cmd] unknown command "${rawName}"`)
    return
  }

  const sender = msg.key.fromMe
    ? sock.user?.id || jid
    : msg.key.participant || jid

  const senderNumber = sender.split('@')[0].split(':')[0]

  const ctx = {
    sock,
    msg,
    jid,
    sender,
    args,
    text: args.join(' '),
    commands,
    session,
    prefix,
    botName: session.botName,
    owners: session.owners,
    flags: session.flags,
    setFlag: (key, value) => session.setFlag(key, value),
    isGroup: jid.endsWith('@g.us'),
    isOwner: !!msg.key.fromMe || session.isOwner(senderNumber),
    group: () => groupInfo(sock, jid, sender),
    reply: (content) =>
      sock.sendMessage(
        jid,
        typeof content === 'string' ? { text: content } : content,
        { quoted: msg }
      )
  }

  // Mark recognized commands as processing on the user's original message.
  await reactToCommand(sock, msg, '⏳')

  try {
    if (cmd.ownerOnly && !ctx.isOwner) {
      await ctx.reply('⛔ Owner only command.')
      await reactToCommand(sock, msg, '❌')
      return
    }

    if (cmd.groupOnly || cmd.adminOnly) {
      if (!ctx.isGroup) {
        await ctx.reply('👥 This command works in groups only.')
        await reactToCommand(sock, msg, '❌')
        return
      }

      if (cmd.adminOnly) {
        const g = await ctx.group()

        if (!g.isAdmin && !ctx.isOwner) {
          await ctx.reply('⛔ Group admins only.')
          await reactToCommand(sock, msg, '❌')
          return
        }

        if (cmd.needsBotAdmin && !g.isBotAdmin) {
          await ctx.reply('⚠️ Make me a group admin first.')
          await reactToCommand(sock, msg, '❌')
          return
        }
      }
    }

    console.log(`[${session.id}] [cmd] running ${cmd.name}`)

    await cmd.run(ctx)

    // Change the original message reaction to success.
    await reactToCommand(sock, msg, '✅')
  } catch (err) {
    console.error(`[${session.id}] Command ${cmd.name} failed:`, err)

    await ctx.reply('⚠️ Something went wrong running that command.').catch(() => {})

    // Change the original message reaction to failure.
    await reactToCommand(sock, msg, '❌')
  }
}
