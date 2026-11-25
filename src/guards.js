import { downloadMediaMessage, jidNormalizedUser } from '@whiskeysockets/baileys'
import pino from 'pino'
import { groupInfo, num } from './utils.js'

const silent = pino({ level: 'silent' })
const CACHE_MAX = 150
const DEFAULT_REACTS = ['❤️', '🔥', '💯', '😍', '👍', '😂']
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)]

export const defaultReacts = () => [...DEFAULT_REACTS]

/** Strip the wrappers WhatsApp puts around messages (ephemeral, view once, ...). */
export function unwrap(message = {}) {
  let m = message
  for (let i = 0; i < 4; i++) {
    const inner =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.documentWithCaptionMessage?.message
    if (!inner) break
    m = inner
  }
  return m
}

const isViewOnce = (message = {}) => {
  if (message.viewOnceMessage || message.viewOnceMessageV2 || message.viewOnceMessageV2Extension) return true
  const inner = unwrap(message)
  return !!(inner.imageMessage?.viewOnce || inner.videoMessage?.viewOnce || inner.audioMessage?.viewOnce)
}

/** Per-group switches (antisticker, antitag, antistatus, jailed list, autoreact). One row per group. */
export async function getGuards(session, jid) {
  return (await session.store.get(jid, 'guards', null)) || {}
}

export async function setGuard(session, jid, patch) {
  const next = { ...(await getGuards(session, jid)), ...patch }
  await session.store.set(jid, 'guards', next)
  return next
}

/** Download a (view once) media message and turn it into something sendMessage accepts. */
export async function mediaToContent(sock, fullMessage) {
  const inner = unwrap(fullMessage.message)
  const buffer = await downloadMediaMessage(fullMessage, 'buffer', {}, {
    logger: silent,
    reuploadRequest: sock.updateMediaMessage
  })
  if (inner.imageMessage) return { image: buffer, caption: inner.imageMessage.caption || '' }
  if (inner.videoMessage) return { video: buffer, caption: inner.videoMessage.caption || '' }
  if (inner.audioMessage) return { audio: buffer, mimetype: inner.audioMessage.mimetype || 'audio/mpeg', ptt: !!inner.audioMessage.ptt }
  return null
}

const ownChat = (sock) => jidNormalizedUser(sock.user.id)

async function restoreDeleted(sock, session, revokedId) {
  const cached = session.msgCache.get(revokedId)
  if (!cached) return
  const target = ownChat(sock)
  const where = cached.jid.endsWith('@g.us') ? `in group ${cached.jid}` : 'in a private chat'
  await sock.sendMessage(target, {
    text: `🗑 *Deleted message*\nFrom: @${num(cached.sender)}\nWhere: ${where}`,
    mentions: [cached.sender]
  })
  await sock.sendMessage(target, { forward: cached.msg })
}

async function revealViewOnce(sock, msg, session) {
  const content = await mediaToContent(sock, msg)
  if (!content) return
  const from = msg.key.participant || msg.key.remoteJid
  const label = `👁 *View once* from @${num(from)}`
  const target = ownChat(sock)
  await sock.sendMessage(target, { text: label, mentions: [from] })
  await sock.sendMessage(target, content)
}

async function tryDelete(sock, jid, msg) {
  await sock.sendMessage(jid, { delete: msg.key }).catch(() => {})
}

/**
 * Runs on every incoming message before commands.
 * Returns true when the message must not be processed any further.
 */
export async function runGuards({ sock, msg, jid, session, text }) {
  const { cfg } = session
  const fromMe = !!msg.key.fromMe
  const message = msg.message
  const isGroup = jid.endsWith('@g.us')

  // someone deleted a message -> antidelete
  const proto = message.protocolMessage
  if (proto) {
    if ((proto.type === 0 || proto.type === 'REVOKE') && proto.key?.id && cfg.antidelete && !fromMe) {
      await restoreDeleted(sock, session, proto.key.id).catch((e) => console.error(`[${session.id}] antidelete:`, e.message))
    }
    return false
  }

  if (fromMe) return false
  const sender = msg.key.participant || jid

  if (cfg.antidelete && !message.reactionMessage && !message.senderKeyDistributionMessage?.groupId) {
    session.msgCache.set(msg.key.id, { msg, jid, sender })
    if (session.msgCache.size > CACHE_MAX) session.msgCache.delete(session.msgCache.keys().next().value)
  }

  if (cfg.antionce && isViewOnce(message)) {
    revealViewOnce(sock, msg, session).catch((e) => console.error(`[${session.id}] antionce:`, e.message))
  }

  if (cfg.autoread) sock.readMessages([msg.key]).catch(() => {})

  const isCommand = text.startsWith(session.prefix)
  const reacts = cfg.reacts?.length ? cfg.reacts : DEFAULT_REACTS

  if (cfg.creact && !isCommand && !message.reactionMessage) {
    sock.sendMessage(jid, { react: { text: pickOne(reacts), key: msg.key } }).catch(() => {})
  }

  if (!isGroup) return false

  const g = await getGuards(session, jid)

  if (g.autoreact && !isCommand && !message.reactionMessage) {
    sock.sendMessage(jid, { react: { text: pickOne(reacts), key: msg.key } }).catch(() => {})
  }

  // jail: everything the member sends is deleted and they cannot use commands
  if (g.jailed?.includes(num(sender)) && !session.isOwner(sender)) {
    await tryDelete(sock, jid, msg)
    return true
  }

  const inner = unwrap(message)
  const mentioned = Object.values(inner).find((v) => v && typeof v === 'object' && v.contextInfo?.mentionedJid)?.contextInfo
    ?.mentionedJid
  const hit =
    (g.antisticker && inner.stickerMessage && 'stickers') ||
    (g.antitag && (mentioned?.length ?? 0) >= 5 && 'mass tagging') ||
    (g.antistatus && (message.groupStatusMentionMessage || inner.groupStatusMentionMessage) && 'status mentions')

  if (hit && !session.isOwner(sender)) {
    const info = await groupInfo(sock, jid, sender)
    if (info.isAdmin || !info.isBotAdmin) return false
    await tryDelete(sock, jid, msg)
    await sock
      .sendMessage(jid, { text: `🚫 @${num(sender)}, ${hit} are not allowed in this group.`, mentions: [sender] })
      .catch(() => {})
    return true
  }

  return false
}
