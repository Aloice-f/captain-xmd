import { jidNormalizedUser } from '@whiskeysockets/baileys'
import { num } from './utils.js'
import { unwrap, mediaToContent, defaultReacts } from './guards.js'

const STATUS_MAX = 60 // statuses remembered per bot
const KEEP_MEDIA = 15 // how many of them keep their downloaded media (antidelete only)
const MAX_MEDIA_BYTES = 12 * 1024 * 1024
const DAY = 24 * 60 * 60 * 1000
const REPLY_COOLDOWN = 6 * 60 * 60 * 1000
const CONTACT_MAX = 1500

const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)]
const lastReply = new Map() // `${sessionId}|${number}` -> timestamp

export const isStatusJid = (jid) => jid === 'status@broadcast'

function kindOf(message = {}) {
  const m = unwrap(message)
  if (m.imageMessage) return { type: 'image', body: m.imageMessage, caption: m.imageMessage.caption || '' }
  if (m.videoMessage) return { type: 'video', body: m.videoMessage, caption: m.videoMessage.caption || '' }
  if (m.audioMessage) return { type: 'audio', body: m.audioMessage, caption: '' }
  const text = m.extendedTextMessage?.text || m.conversation || ''
  if (text) return { type: 'text', body: m, caption: '', text }
  return null
}

// ------------------------------------------------------------------ contacts (status audience)
let saveTimers = new Map()

/** Remember a contact so statuses posted by the bot can be sent to them. */
export function noteContact(session, jid) {
  if (!jid || !jid.endsWith('@s.whatsapp.net')) return
  const n = num(jid)
  if (!n || session.contacts.has(n)) return
  if (session.contacts.size >= CONTACT_MAX) return
  session.contacts.add(n)
  if (saveTimers.has(session.id)) return
  const t = setTimeout(() => {
    saveTimers.delete(session.id)
    session.store.set('global', 'contacts', [...session.contacts]).catch(() => {})
  }, 30_000)
  t.unref?.()
  saveTimers.set(session.id, t)
}

/** Who may see a status posted by this bot: known contacts, minus blocked ones, plus the bot itself. */
export function audience(sock, session) {
  const blocked = new Set(session.cfg.statusBlocked ?? [])
  const list = [...session.contacts].filter((n) => !blocked.has(n)).map((n) => `${n}@s.whatsapp.net`)
  list.push(jidNormalizedUser(sock.user.id))
  return [...new Set(list)]
}

// ------------------------------------------------------------------ status cache
function record(session, msg, participant) {
  const info = kindOf(msg.message)
  if (!info) return null
  const entry = {
    id: msg.key.id,
    jid: participant,
    pn: msg.key.participantPn || msg.key.participantAlt || null,
    number: num(msg.key.participantPn || msg.key.participantAlt || participant),
    name: msg.pushName || '',
    at: Date.now(),
    type: info.type,
    text: info.text || '',
    caption: info.caption || '',
    size: Number(info.body?.fileLength || 0),
    msg,
    content: null
  }
  session.statuses.push(entry)
  const cutoff = Date.now() - DAY
  while (session.statuses.length > STATUS_MAX || (session.statuses[0] && session.statuses[0].at < cutoff)) {
    session.statuses.shift()
  }
  // media of older entries is dropped to keep memory small
  for (const old of session.statuses.slice(0, -KEEP_MEDIA)) old.content = null
  return entry
}

export function statusesOf(session, jidOrNumber) {
  const n = num(jidOrNumber)
  const cutoff = Date.now() - DAY
  return session.statuses.filter((e) => e.at >= cutoff && (e.number === n || num(e.jid) === n))
}

/** [{ number, name, count, types, last }] newest first. */
export function summary(session) {
  const cutoff = Date.now() - DAY
  const by = new Map()
  for (const e of session.statuses) {
    if (e.at < cutoff) continue
    const row = by.get(e.number) ?? { number: e.number, name: e.name, count: 0, types: new Set(), last: 0 }
    row.count++
    row.types.add(e.type)
    row.last = Math.max(row.last, e.at)
    if (e.name) row.name = e.name
    by.set(e.number, row)
  }
  return [...by.values()].sort((a, b) => b.last - a.last)
}

/** Sendable content for a cached status (downloads the media if it is not held yet). */
export async function contentOf(sock, entry) {
  if (entry.type === 'text') return { text: entry.text }
  if (entry.content) return entry.content
  entry.content = await mediaToContent(sock, entry.msg)
  return entry.content
}

// ------------------------------------------------------------------ incoming statuses
async function onDeleted(sock, session, revokedId) {
  if (!session.cfg.antidelete) return
  const entry = session.statuses.find((e) => e.id === revokedId)
  if (!entry) return
  const own = jidNormalizedUser(sock.user.id)
  const who = entry.number
  const content = await contentOf(sock, entry).catch(() => null)
  await sock.sendMessage(own, {
    text: `🗑 *Deleted status*\nFrom: @${who}${entry.name ? ` (${entry.name})` : ''}\nType: ${entry.type}`,
    mentions: [entry.pn || entry.jid]
  })
  if (content) await sock.sendMessage(own, content)
  else await sock.sendMessage(own, { forward: entry.msg }).catch(() => {})
}

async function autoLike(sock, msg, participant, session) {
  if (!session.cfg.autolike) return
  const reacts = session.cfg.reacts?.length ? session.cfg.reacts : defaultReacts()
  const emoji = session.cfg.statusEmoji || pickOne(reacts)
  await sock.sendMessage(
    'status@broadcast',
    { react: { text: emoji, key: msg.key } },
    { statusJidList: [participant, jidNormalizedUser(sock.user.id)] }
  )
}

async function autoReply(sock, msg, participant, session) {
  const { statusReplyOn, statusReply } = session.cfg
  if (!statusReplyOn || !statusReply) return
  const key = `${session.id}|${num(participant)}`
  if (Date.now() - (lastReply.get(key) ?? 0) < REPLY_COOLDOWN) return
  lastReply.set(key, Date.now())
  await sock.sendMessage(participant, { text: statusReply }, { quoted: msg })
}

/** Every message that arrives on status@broadcast ends up here. */
export async function onStatusMessage(sock, msg, session) {
  const proto = msg.message?.protocolMessage
  if (proto) {
    if ((proto.type === 0 || proto.type === 'REVOKE') && proto.key?.id) {
      await onDeleted(sock, session, proto.key.id).catch((e) => console.error(`[${session.id}] status antidelete:`, e.message))
    }
    return
  }

  const participant = msg.key.participant
  if (msg.key.fromMe || !participant || !msg.message) return

  noteContact(session, participant)
  const entry = record(session, msg, participant)

  // antidelete: grab the media right away, because it can disappear once the status is deleted
  if (entry && session.cfg.antidelete && entry.type !== 'text' && (!entry.size || entry.size <= MAX_MEDIA_BYTES)) {
    contentOf(sock, entry).catch(() => {})
  }

  await autoLike(sock, msg, participant, session).catch((e) => console.error(`[${session.id}] autolikestatus:`, e.message))
  await autoReply(sock, msg, participant, session).catch((e) => console.error(`[${session.id}] statusreply:`, e.message))
}

export const STATUS_COLORS = ['#128C7E', '#25D366', '#075E54', '#34B7F1', '#7E57C2', '#E91E63', '#FF7043', '#263238']
