import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys'
import pino from 'pino'
import { config } from './config.js'
import { supabase } from './supabase.js'
import { useSupabaseAuthState, readCreds } from './supabaseAuthState.js'
import { scopedStore, updateSessionRow } from './store.js'
import { handleMessage } from './handler.js'
import { sendBanner } from './utils.js'

const logger = pino({ level: process.env.LOG_LEVEL || 'silent' })

const num = (jid = '') => String(jid).split('@')[0].split(':')[0]

// One network lookup shared by every socket instead of one per bot.
let versionPromise
const latestVersion = () =>
  (versionPromise ??= fetchLatestBaileysVersion()
    .then((v) => v.version)
    .catch(() => undefined))

const FLAG_KEYS = ['autotyping', 'autorecording', 'autoviewstatus', 'alwaysonline']
const IDLE_MS = 10 * 60_000

/**
 * One WhatsApp account (one linked device) running on this deployment.
 * Every bot has its own Supabase auth state, flags, owners and pairing state,
 * so two or more people can connect their numbers at the same time.
 */
export class BotSession {
  constructor(row) {
    this.id = row.id
    this.label = row.label || (row.owner_number ? `Bot ${String(row.owner_number).slice(-4)}` : row.id)
    this.ownerNumber = num(row.owner_number || '')
    this.linkedNumber = num(row.linked_number || '')
    this.createdAt = row.created_at || null

    this.commands = null
    this.store = scopedStore(`session:${row.id}`)
    this.flags = Object.fromEntries(FLAG_KEYS.map((k) => [k, false]))

    this.status = 'offline' // offline | connecting | open | reconnecting | replaced | unpaired
    this.lastError = ''
    this.pairing = { ready: false, linked: false, last: null, gen: 0 }

    this.sock = null
    this.state = null
    this.creds = null
    this.clearSession = null
    this.stopped = false
    this.announced = false
    this.reconnectDelay = 3000

    this.reconnectTimer = null
    this.presenceTimer = null
    this.idleTimer = null
    this._waiters = []
    this._starting = null
  }

  get prefix() {
    return config.prefix
  }

  get botName() {
    return config.botName
  }

  /** The bot's own number + the number its owner used + deployment admins. */
  get owners() {
    return [...new Set([this.ownerNumber, this.linkedNumber, ...config.owners].filter(Boolean))]
  }

  isOwner(numberOrJid) {
    return this.owners.includes(num(numberOrJid))
  }

  getStatus() {
    return {
      id: this.id,
      label: this.label,
      ownerNumber: this.ownerNumber || null,
      linkedNumber: this.linkedNumber || null,
      connection: this.status,
      linked: this.pairing.linked,
      ready: this.pairing.ready,
      gen: this.pairing.gen,
      error: this.lastError || null,
      createdAt: this.createdAt
    }
  }

  /** Is there a finished pairing in Supabase for this bot? */
  async hasCreds() {
    if (!this.creds) this.creds = await readCreds(supabase, this.id).catch(() => null)
    return !!this.creds?.registered
  }

  // ------------------------------------------------------------------ lifecycle
  start() {
    if (this._starting) return this._starting
    this._starting = this._start().finally(() => {
      this._starting = null
    })
    return this._starting
  }

  async _start() {
    if (this.stopped) return
    this.clearTimers()
    if (this.sock) {
      try {
        this.sock.end(undefined)
      } catch {
        /* already closed */
      }
      this.sock = null
    }

    const { state, saveCreds, clearSession } = await useSupabaseAuthState(supabase, this.id)
    this.state = state
    this.creds = state.creds
    this.clearSession = clearSession
    if (state.creds.registered) {
      this.pairing.linked = true
      if (state.creds.me?.id) this.setLinkedFromJid(state.creds.me.id)
    }

    await this.loadFlags()

    this.status = 'connecting'
    this.lastError = ''
    const version = await latestVersion()
    const sock = makeWASocket({
      ...(version ? { version } : {}),
      logger,
      browser: Browsers.ubuntu('Chrome'),
      printQRInTerminal: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false, // old history is what triggers the Bad MAC noise
      markOnlineOnConnect: this.flags.alwaysonline,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      }
    })

    this.sock = sock
    this.pairing.gen++
    this.pairing.ready = false
    this.pairing.last = null // codes from an older socket are dead
    this.bind(sock, state, saveCreds, clearSession)
    if (!state.creds.registered) this.armIdleTimer()
  }

  bind(sock, state, saveCreds, clearSession) {
    sock.ev.on('creds.update', () => {
      saveCreds().catch((e) => console.error(`[${this.id}] save creds:`, e.message))
      if (state.creds.registered && state.creds.me?.id) this.setLinkedFromJid(state.creds.me.id)
    })

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (sock !== this.sock) return // event from a socket we already replaced
      if (qr && !state.creds.registered) this.markReady()
      if (connection) this.status = connection
      if (connection === 'open') this.onOpen(sock)
      if (connection === 'close') this.onClose(lastDisconnect, clearSession)
    })

    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
      try {
        if (action !== 'add' && action !== 'remove') return
        if (!(await this.store.get(id, 'welcome'))) return
        const jids = participants.map((p) => (typeof p === 'string' ? p : p.id))
        const names = jids.map((j) => `@${num(j)}`).join(' ')
        const text =
          action === 'add'
            ? `👋 Welcome aboard ${names}! Type ${this.prefix}menu to see what I can do.`
            : `👋 Goodbye ${names}.`
        await sock.sendMessage(id, { text, mentions: jids })
      } catch (e) {
        console.error(`[${this.id}] welcome failed:`, e.message)
      }
    })

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      // 'append' covers messages typed from the bot's own phone; only handle fresh ones
      const fresh = (m) => Date.now() / 1000 - Number(m.messageTimestamp ?? 0) < 60
      if (type !== 'notify' && type !== 'append') return
      // not awaited: a slow command (download, animation) must not block other messages
      for (const msg of messages) {
        if (type === 'append' && !(msg.key.fromMe && fresh(msg))) continue
        handleMessage(sock, msg, this.commands, this).catch((e) =>
          console.error(`[${this.id}] handler:`, e)
        )
      }
    })
  }

  onOpen(sock) {
    this.pairing.linked = true
    this.status = 'open'
    this.lastError = ''
    this.reconnectDelay = 3000
    this.clearIdleTimer()
    if (sock.user?.id) this.setLinkedFromJid(sock.user.id)
    console.log(`✅ [${this.id}] ${this.label} connected${this.linkedNumber ? ` as ${this.linkedNumber}` : ''}`)
    this.startPresence(sock)
    if (!this.announced) {
      this.announced = true
      this.announce(sock).catch((e) => console.error(`[${this.id}] connected message:`, e.message))
    }
  }

  onClose(lastDisconnect, clearSession) {
    const err = lastDisconnect?.error
    const code = err?.output?.statusCode
    // Credentials may be registered before the "open" event, and WhatsApp can close with
    // restartRequired (515) right after pairing. Both cases must reconnect.
    if (this.state?.creds?.registered || this.creds?.registered) this.pairing.linked = true
    clearInterval(this.presenceTimer)
    this.presenceTimer = null
    this.pairing.ready = false
    this.lastError = err?.message || (code ? `code ${code}` : '')

    if (code === DisconnectReason.loggedOut) {
      console.log(`[${this.id}] logged out of WhatsApp; clearing its session`)
      this.pairing.linked = false
      this.linkedNumber = ''
      this.status = 'unpaired'
      this.clearIdleTimer()
      clearSession().catch((e) => console.error(`[${this.id}] clear:`, e.message))
      updateSessionRow(this.id, { linked_number: null }).catch(() => {})
      return
    }

    if (code === DisconnectReason.connectionReplaced) {
      console.log(`[${this.id}] another instance took over this session; not reconnecting`)
      this.status = 'replaced'
      return
    }

    if (this.stopped) return

    if (!this.pairing.linked && code !== DisconnectReason.restartRequired) {
      // An unpaired socket dropped. Stay idle until someone asks for a new code.
      this.status = 'offline'
      return
    }

    this.status = 'reconnecting'
    console.log(`[${this.id}] connection closed (${code ?? 'unknown'}); reconnecting in ${Math.round(this.reconnectDelay / 1000)}s`)
    this.reconnectTimer = setTimeout(() => {
      this.start().catch((e) => console.error(`[${this.id}] reconnect:`, e.message))
    }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000)
  }

  stop() {
    this.stopped = true
    this.clearTimers()
    this.status = 'offline'
    this.pairing.ready = false
    const sock = this.sock
    this.sock = null
    try {
      sock?.end(undefined)
    } catch {
      /* already closed */
    }
  }

  async destroy() {
    this.stop()
    this.pairing.linked = false
    const { error } = await supabase.from('wa_sessions').delete().eq('session_id', this.id)
    if (error) throw new Error(`Could not delete bot credentials: ${error.message}`)
  }

  /** Remove the linked device (WhatsApp stays logged in on the phone) and forget the credentials. */
  async unlink() {
    const sock = this.sock
    const wasLinked = this.pairing.linked
    this.stopped = true
    this.clearTimers()
    this.status = 'unpaired'
    this.pairing.linked = false
    this.pairing.ready = false
    this.pairing.last = null
    this.linkedNumber = ''
    this.creds = null
    this.sock = null

    if (sock && wasLinked) {
      try {
        await sock.logout()
      } catch (e) {
        console.error(`[${this.id}] logout:`, e.message)
      }
    }
    try {
      sock?.end(undefined)
    } catch {
      /* already closed */
    }
    if (this.clearSession) {
      await this.clearSession().catch((e) => console.error(`[${this.id}] clear:`, e.message))
    }
    await updateSessionRow(this.id, { linked_number: null }).catch(() => {})
  }

  // ------------------------------------------------------------------ pairing
  markReady() {
    this.pairing.ready = true
    this._waiters.splice(0).forEach((resolve) => resolve())
  }

  waitReady(ms) {
    return new Promise((resolve) => {
      if (this.pairing.ready || this.pairing.linked) return resolve()
      const timer = setTimeout(resolve, ms)
      this._waiters.push(() => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  /** Ask WhatsApp for a pairing code. Throws Error with a user-readable message. */
  async requestCode(number) {
    if (this.pairing.linked) throw new Error('This bot is already linked to a WhatsApp account.')
    const recent = this.pairing.last
    if (recent && recent.number === number && Date.now() - recent.at < 45_000) return recent

    this.stopped = false
    if (!this.sock || this.status === 'offline' || this.status === 'unpaired') await this.start()
    this.armIdleTimer()
    await this.waitReady(25_000)
    if (!this.pairing.ready || !this.sock) {
      throw new Error('WhatsApp did not answer in time. Try again in a few seconds.')
    }

    const code = await this.sock.requestPairingCode(number)
    this.pairing.last = { number, code, at: Date.now(), gen: this.pairing.gen }
    console.log(`[${this.id}] pairing code issued for ${number}`)
    return this.pairing.last
  }

  setOwnerNumber(number) {
    this.ownerNumber = num(number)
    updateSessionRow(this.id, { owner_number: this.ownerNumber }).catch(() => {})
  }

  setLinkedFromJid(jid) {
    const n = num(jid)
    if (!n || n.length < 6 || n === this.linkedNumber) return
    this.linkedNumber = n
    const patch = { linked_number: n }
    if (!this.ownerNumber) {
      this.ownerNumber = n
      patch.owner_number = n
    }
    updateSessionRow(this.id, patch).catch((e) => console.error(`[${this.id}] ${e.message}`))
  }

  // ------------------------------------------------------------------ helpers
  async loadFlags() {
    for (const key of FLAG_KEYS) {
      this.flags[key] = !!(await this.store.get('global', key, false))
    }
  }

  async setFlag(key, value) {
    await this.store.set('global', key, value)
    this.flags[key] = value
  }

  startPresence(sock) {
    clearInterval(this.presenceTimer)
    this.presenceTimer = null
    if (!this.flags.alwaysonline) return
    const ping = () => {
      if (this.sock === sock && this.status === 'open' && this.flags.alwaysonline) {
        sock.sendPresenceUpdate('available').catch(() => {})
      }
    }
    ping()
    this.presenceTimer = setInterval(ping, 30_000)
  }

  armIdleTimer() {
    this.clearIdleTimer()
    if (this.pairing.linked) return
    this.idleTimer = setTimeout(() => {
      if (this.pairing.linked || this.state?.creds.registered) return
      console.log(`[${this.id}] nobody paired this bot; closing the idle socket`)
      this.status = 'offline'
      this.pairing.ready = false
      const sock = this.sock
      this.sock = null
      try {
        sock?.end(undefined)
      } catch {
        /* already closed */
      }
    }, IDLE_MS)
    this.idleTimer.unref?.()
  }

  clearIdleTimer() {
    clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  clearTimers() {
    clearTimeout(this.reconnectTimer)
    clearInterval(this.presenceTimer)
    clearTimeout(this.idleTimer)
    this.reconnectTimer = null
    this.presenceTimer = null
    this.idleTimer = null
    this._waiters = []
  }

  async announce(sock) {
    if (!this.commands?.size) return
    const targets = new Set(this.owners.map((n) => `${n}@s.whatsapp.net`))
    if (sock.user?.id) targets.add(jidNormalizedUser(sock.user.id)) // the bot's own chat
    const when = new Date().toLocaleString('en-GB', { timeZone: config.timezone, hour12: false })
    const text =
      `✅ *${this.botName} connected successfully!*\n\n` +
      `Bot : ${this.label}\n` +
      `Prefix : ${this.prefix}\nCommands : ${new Set(this.commands.values()).size}\nTime : ${when}\n\n` +
      `Type *${this.prefix}menu* to see everything I can do.`
    for (const jid of targets) {
      await sendBanner(sock, jid, text).catch(() => {})
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

export { FLAG_KEYS }
