import { groupInfo } from './utils.js'
import { runGuards } from './guards.js'
import { onStatusMessage, noteContact } from './statuses.js'

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

// Duplicate-message protection
const processedMessages = new Map()
const DEDUPE_TTL = 2 * 60 * 1000

function isDuplicateMessage(session, msg) {
  const id = msg.key?.id
  const jid = msg.key?.remoteJid

  if (!id || !jid) return false

  const key = `${session.id}|${jid}|${id}`
  const now = Date.now()
  const seenAt = processedMessages.get(key)

  if (seenAt && now - seenAt < DEDUPE_TTL) {
    return true
  }

  processedMessages.set(key, now)

  // Clean expired entries to prevent memory growth
  if (processedMessages.size > 5000) {
    for (const [entry, timestamp] of processedMessages) {
      if (now - timestamp >= DEDUPE_TTL) {
        processedMessages.delete(entry)
      }
    }
  }

  return false
}

/** Autotyping / autorecording */
function showPresence(sock, jid, session) {
  const { flags } = session

  const state = flags.autorecording
    ? 'recording'
    : flags.autotyping
      ? 'composing'
      : null

  if (!state) return

  const key = `${session.id}|${jid}`
  const now = Date.now()

  if (now - (lastPresence.get(key) ?? 0) < 3000) return

  lastPresence.set(key, now)

  sock.sendPresenceUpdate(state, jid).catch(() => {})

  setTimeout(() => {
    sock.sendPresenceUpdate('paused', jid).catch(() => {})
  }, 4000)
}

const LINK_RE = /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i

/** Antilink */
async function antiLink(sock, msg, jid, sender, session) {
  const mode = await session.store.get(jid, 'antilink')

  if (!mode) return

  const g = await groupInfo(sock, jid, sender)

  if (g.isAdmin || !g.isBotAdmin) return

  await sock.sendMessage(jid, { delete: msg.key })

  if (mode === 'kick') {
    await sock.groupParticipantsUpdate(
      jid,
      [sender],
      'remove'
    )
  }

  await sock.sendMessage(jid, {
    text: `🚫 @${sender.split('@')[0].split(':')[0]} group links are not allowed here.`,
    mentions: [sender]
  })
}

/** React to the original command message */
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

  // Prevent the same message from executing more than once
  if (isDuplicateMessage(session, msg)) {
    if (process.env.DEBUG) {
      console.log(
        `[${session.id}] [dedupe] ignored duplicate message ${msg.key?.id}`
      )
    }
    return
  }

  const jid = msg.key.remoteJid

  if (!jid) return

  // WhatsApp status handling
  if (jid === 'status@broadcast') {
    if (
      session.flags.autoviewstatus &&
      !msg.key.fromMe &&
      !msg.message.protocolMessage
    ) {
      sock.readMessages([msg.key]).catch(() => {})
    }

    onStatusMessage(sock, msg, session).catch((e) =>
      console.error(`[${session.id}] status:`, e.message)
    )

    return
  }

  if (!msg.key.fromMe) {
    showPresence(sock, jid, session)
    noteContact(session, jid)
  }

  const text = extractText(msg.message).trim()

  if (process.env.DEBUG) {
    console.log(
      `[${session.id}] [msg] from=${jid} fromMe=${!!msg.key.fromMe} text="${text.slice(0, 60)}"`
    )
  }

  // Antilink protection
  if (
    jid.endsWith('@g.us') &&
    !msg.key.fromMe &&
    LINK_RE.test(text)
  ) {
    await antiLink(
      sock,
      msg,
      jid,
      msg.key.participant || jid,
      session
    ).catch((e) => console.error('antilink:', e.message))
  }

  const prefix = session.prefix

  // Run message guards
  const guarded = await runGuards({
    sock,
    msg,
    jid,
    session,
    text
  }).catch((e) => {
    console.error(`[${session.id}] guards:`, e.message)
    return false
  })

  if (guarded) return

  if (!text.startsWith(prefix)) return

  // Parse command
  const [rawName, ...args] = text
    .slice(prefix.length)
    .trim()
    .split(/\s+/)

  const cmd = commands.get(rawName?.toLowerCase())

  if (!cmd) {
    console.log(
      `[${session.id}] [cmd] unknown command "${rawName}"`
    )
    return
  }

  const sender = msg.key.fromMe
    ? sock.user?.id || jid
    : msg.key.participant || jid

  const senderNumber = sender
    .split('@')[0]
    .split(':')[0]

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

    setFlag: (key, value) =>
      session.setFlag(key, value),

    isGroup: jid.endsWith('@g.us'),

    isOwner:
      !!msg.key.fromMe ||
      session.isOwner(senderNumber),

    isRealOwner:
      !!msg.key.fromMe ||
      session.isRealOwner(senderNumber),

    group: () => groupInfo(sock, jid, sender),

    reply: (content) =>
      sock.sendMessage(
        jid,
        typeof content === 'string'
          ? { text: content }
          : content,
        { quoted: msg }
      )
  }

  // Private mode protection
  if (!ctx.isOwner) {
    if (session.cfg.mode === 'private') return

    if (
      ctx.isGroup &&
      session.cfg.bannedGroups.includes(jid)
    ) {
      return
    }
  }

  // React when command starts
  await reactToCommand(sock, msg, '⏳')

  try {
    // Owner-only commands
    if (cmd.ownerOnly && !ctx.isOwner) {
      await ctx.reply('⛔ Owner only command.')
      await reactToCommand(sock, msg, '❌')
      return
    }

    // Group-only and admin commands
    if (cmd.groupOnly || cmd.adminOnly) {
      if (!ctx.isGroup) {
        await ctx.reply(
          '👥 This command works in groups only.'
        )

        await reactToCommand(sock, msg, '❌')
        return
      }

      if (cmd.adminOnly) {
        const g = await ctx.group()

        if (!g.isAdmin && !ctx.isOwner) {
          await ctx.reply(
            '⛔ Group admins only.'
          )

          await reactToCommand(sock, msg, '❌')
          return
        }

        if (cmd.needsBotAdmin && !g.isBotAdmin) {
          await ctx.reply(
            '⚠️ Make me a group admin first.'
          )

          await reactToCommand(sock, msg, '❌')
          return
        }
      }
    }

    console.log(
      `[${session.id}] [cmd] running ${cmd.name}`
    )

    // Execute command once
    await cmd.run(ctx)

    // Successful command
    await reactToCommand(sock, msg, '✅')
  } catch (err) {
    console.error(
      `[${session.id}] Command ${cmd.name} failed:`,
      err
    )

    await ctx.reply(
      '⚠️ Something went wrong running that command.'
    ).catch(() => {})

    // Failed command
    await reactToCommand(sock, msg, '❌')
  }
    }
