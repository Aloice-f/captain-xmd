import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dns from 'node:dns/promises'
import net from 'node:net'
import pino from 'pino'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { config } from './config.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

export const num = (jid = '') => String(jid).split('@')[0].split(':')[0]

export function formatUptime(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return `${d ? d + 'd ' : ''}${h}h ${m}m ${Math.floor(s % 60)}s`
}

/** Banner image for the menu / connected message. MENU_IMAGE_URL overrides the bundled assets/menu.jpg */
export async function menuImage() {
  if (config.menuImageUrl) return { url: config.menuImageUrl }
  return await readFile(path.join(root, 'assets', 'menu.jpg'))
}

/** Send the banner with a caption; falls back to plain text if the image cannot be sent. */
export async function sendBanner(sock, jid, caption, options = {}) {
  try {
    return await sock.sendMessage(jid, { image: await menuImage(), caption }, options)
  } catch (err) {
    console.error('Banner send failed, sending text only:', err.message)
    return await sock.sendMessage(jid, { text: caption }, options)
  }
}

/** JIDs mentioned in the message, or the author of the quoted message. */
export function getTargets(msg) {
  const m = msg.message ?? {}
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    {}
  const list = [...(ctx.mentionedJid ?? [])]
  if (!list.length && ctx.participant) list.push(ctx.participant)
  return list
}

/** Group metadata plus admin checks for the sender and the bot. */
export async function groupInfo(sock, jid, senderJid) {
  const meta = await sock.groupMetadata(jid)
  const ids = (p) => [p.id, p.jid, p.lid, p.phoneNumber].filter(Boolean).map(num)
  const adminIds = new Set(meta.participants.filter((p) => p.admin).flatMap(ids))
  const botIds = [sock.user?.id, sock.user?.lid].filter(Boolean).map(num)
  return {
    meta,
    isAdmin: adminIds.has(num(senderJid)),
    isBotAdmin: botIds.some((b) => adminIds.has(b))
  }
}

// ---------------------------------------------------------------- small helpers
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
export const tag = (jid) => `@${num(jid)}`

export function hashStr(str) {
  let h = 0
  for (const ch of str.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; CaptainXMD/2.0)' }

export async function getJson(url, opts = {}) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: UA, ...opts })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export async function getText(url, opts = {}) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: UA, ...opts })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
}

/** Refuse links that point at private/internal addresses (stops people using the bot to probe your server). */
const isPrivateIp = (ip) =>
  net.isIPv4(ip)
    ? /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
    : /^(::1|::$|fc|fd|fe80)/i.test(ip)

export async function assertPublicUrl(input) {
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
  const { address } = await dns.lookup(url.hostname)
  if (isPrivateIp(address)) throw new Error('That address is not allowed.')
  return url
}

export async function getBuffer(input, maxMB = 50) {
  const url = await assertPublicUrl(input)
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: UA })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const limit = maxMB * 1e6
  if (Number(r.headers.get('content-length') || 0) > limit) throw new Error(`File is larger than ${maxMB}MB.`)
  const buffer = Buffer.from(await r.arrayBuffer())
  if (buffer.length > limit) throw new Error(`File is larger than ${maxMB}MB.`)
  return { buffer, type: r.headers.get('content-type') || '', url }
}

/** Animate a message by editing it frame by frame (falls back to new messages if edit fails). */
export async function animate(sock, jid, quoted, frames, delay = 1500, mentions = []) {
  const sent = await sock.sendMessage(jid, { text: frames[0], mentions }, { quoted })
  for (const frame of frames.slice(1)) {
    await sleep(delay)
    try {
      await sock.sendMessage(jid, { text: frame, mentions, edit: sent.key })
    } catch {
      await sock.sendMessage(jid, { text: frame, mentions })
    }
  }
}

const unwrapMsg = (m = {}) =>
  m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m

/** Download media attached to the message, or to the message it replies to. */
export async function getMedia(sock, msg, kinds = ['imageMessage', 'videoMessage', 'stickerMessage']) {
  const direct = unwrapMsg(msg.message)
  const info = (direct.extendedTextMessage || direct.imageMessage || direct.videoMessage || {}).contextInfo
  let source = null
  const dk = kinds.find((k) => direct[k])
  if (dk) {
    source = { key: msg.key, message: msg.message, kind: dk, content: direct[dk] }
  } else if (info?.quotedMessage) {
    const q = unwrapMsg(info.quotedMessage)
    const qk = kinds.find((k) => q[k])
    if (qk) {
      source = {
        key: { remoteJid: msg.key.remoteJid, id: info.stanzaId, participant: info.participant, fromMe: false },
        message: info.quotedMessage, kind: qk, content: q[qk]
      }
    }
  }
  if (!source) return null
  const buffer = await downloadMediaMessage(
    { key: source.key, message: source.message },
    'buffer',
    {},
    { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
  )
  return { buffer, kind: source.kind, mimetype: source.content?.mimetype }
}

/** Info about the message being replied to. */
export function getQuoted(msg) {
  const m = unwrapMsg(msg.message) ?? {}
  const info = (m.extendedTextMessage || m.imageMessage || m.videoMessage || {}).contextInfo
  if (!info?.stanzaId) return null
  return { id: info.stanzaId, participant: info.participant, message: info.quotedMessage }
}
