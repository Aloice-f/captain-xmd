import './quiet.js'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys'
import pino from 'pino'
import { config, assertConfig } from './config.js'
import { supabase } from './supabase.js'
import { getSetting } from './store.js'
import { flags, loadFlags } from './globals.js'
import { useSupabaseAuthState } from './supabaseAuthState.js'
import { loadCommands } from './commandLoader.js'
import { handleMessage } from './handler.js'
import { startServer } from './server.js'
import { sendBanner } from './utils.js'
import { pairing, format } from './pairing.js'

assertConfig()

const logger = pino({ level: process.env.LOG_LEVEL || 'silent' })

let status = { connection: 'starting' }
let announced = false // send the "connected" message once per process start
startServer(() => status)

const commands = await loadCommands()
await loadFlags()
let onlineTimer
console.log(`Loaded ${new Set(commands.values()).size} commands`)

async function announceConnected(sock) {
  const targets = new Set(config.owners.map((n) => `${n}@s.whatsapp.net`))
  if (sock.user?.id) targets.add(jidNormalizedUser(sock.user.id)) // the bot's own chat
  const when = new Date().toLocaleString('en-GB', { timeZone: config.timezone, hour12: false })
  const text =
    `✅ *${config.botName} connected successfully!*\n\n` +
    `Prefix : ${config.prefix}\nCommands : ${new Set(commands.values()).size}\nTime : ${when}\n\n` +
    `Type *${config.prefix}menu* to see everything I can do.`
  for (const jid of targets) {
    await sendBanner(sock, jid, text)
    await new Promise((r) => setTimeout(r, 1000))
  }
}

async function start() {
  const { state, saveCreds, clearSession } = await useSupabaseAuthState(supabase, config.sessionId)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false, // skip old chat history: it is what triggers the Bad MAC noise
    markOnlineOnConnect: flags.alwaysonline,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    }
  })

  pairing.attach(sock, !!state.creds.registered)

  sock.ev.on('creds.update', () => saveCreds().catch((e) => console.error(e.message)))

  let pairingRequested = false
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    // A "qr" event means the socket is ready to be linked. We use a pairing code instead of the QR.
    if (qr && !state.creds.registered) {
      pairing.markReady()
      if (!pairingRequested) {
        pairingRequested = true
        if (!config.pairNumber) {
          console.log('Not linked yet. Open the bot website, enter your number and use the pairing code (or set PAIR_NUMBER).')
        } else {
          try {
            const code = await sock.requestPairingCode(config.pairNumber)
            pairing.last = { number: config.pairNumber, code, at: Date.now(), gen: pairing.gen }
            console.log('\n==============================================')
            console.log(`  PAIRING CODE: ${format(code)}`)
            console.log('  WhatsApp > Linked devices > Link with phone number')
            console.log('==============================================\n')
          } catch (err) {
            console.error('Failed to request pairing code:', err.message)
          }
        }
      }
    }

    if (connection) status = { connection }
    if (connection === 'open') {
      pairing.markLinked()
      console.log(`✅ ${config.botName} connected`)
      clearInterval(onlineTimer)
      onlineTimer = setInterval(() => {
        if (flags.alwaysonline) sock.sendPresenceUpdate('available').catch(() => {})
      }, 30_000)
      if (!announced) {
        announced = true
        announceConnected(sock).catch((e) => console.error('Connected message failed:', e.message))
      }
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      console.log(`Connection closed (code ${code})`)
      if (code === DisconnectReason.loggedOut) {
        console.log('Logged out from WhatsApp. Clearing stored session.')
        await clearSession().catch((e) => console.error(e.message))
      }
      if (code === DisconnectReason.connectionReplaced) {
        console.log('Another instance took over this session (is the bot also running on Render or another window?). Not reconnecting.')
        status = { connection: 'replaced' }
        return
      }
      setTimeout(() => start().catch(console.error), 3000)
    }
  })

  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    try {
      if (action !== 'add' && action !== 'remove') return
      if (!(await getSetting(id, 'welcome'))) return
      const jids = participants.map((p) => (typeof p === 'string' ? p : p.id))
      const names = jids.map((j) => `@${j.split('@')[0].split(':')[0]}`).join(' ')
      const text = action === 'add' ? `👋 Welcome aboard ${names}! Type ${config.prefix}menu to see what I can do.` : `👋 Goodbye ${names}.`
      await sock.sendMessage(id, { text, mentions: jids })
    } catch (e) {
      console.error('welcome failed:', e.message)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // 'append' covers messages typed from the bot's own phone; only handle fresh ones
    const fresh = (m) => Date.now() / 1000 - Number(m.messageTimestamp ?? 0) < 60
    if (type !== 'notify' && type !== 'append') return
    // not awaited: a slow command (download, animation) must not block other messages
    for (const msg of messages) {
      if (type === 'append' && !(msg.key.fromMe && fresh(msg))) continue
      handleMessage(sock, msg, commands).catch((e) => console.error('Handler error:', e))
    }
  })
}

process.on('unhandledRejection', (e) => console.error('Unhandled rejection:', e))
start().catch((e) => {
  console.error('Fatal start error:', e)
  process.exit(1)
})
