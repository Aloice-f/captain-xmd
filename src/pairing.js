import { config } from './config.js'

/** Shared state between the WhatsApp socket (index.js) and the website (server.js). */
export const pairing = {
  sock: null,
  ready: false, // socket is waiting to be linked
  linked: false, // this session already belongs to a WhatsApp account
  last: null, // { number, code, at, gen }
  gen: 0, // increases with every new socket; a code only works on the socket that issued it
  attach(sock, registered) {
    this.sock = sock
    this.gen++
    this.last = null // codes from an older socket are dead
    this.ready = false
    this.linked = registered
  },
  markReady() {
    this.ready = true
    waiters.splice(0).forEach((resolve) => resolve())
  },
  markLinked() {
    this.linked = true
  }
}

const waiters = []
const waitUntilReady = (ms) =>
  new Promise((resolve) => {
    if (pairing.ready) return resolve()
    const timer = setTimeout(resolve, ms)
    waiters.push(() => (clearTimeout(timer), resolve()))
  })

export const format = (code) => code.match(/.{1,4}/g)?.join('-') ?? code
export const needsPassword = () => !!config.pairPassword

/** Normalise and validate a phone number. Returns { number } or { error }. */
export function cleanNumber(input) {
  const raw = String(input ?? '').trim()
  const number = raw.replace(/[\s\-().+]/g, '')
  if (!/^\d+$/.test(number)) return { error: 'Use digits only, for example 254712345678.' }
  if (number.startsWith('0')) return { error: 'Start with your country code instead of 0. Kenya example: 254712345678.' }
  if (number.length < 8 || number.length > 15) return { error: 'That number looks the wrong length. Include the country code, digits only.' }
  return { number }
}

/** Ask WhatsApp for a pairing code. Throws Error with a user-readable message. */
export async function requestCode(number) {
  if (pairing.linked) throw new Error('This bot is already linked to a WhatsApp account.')
  const recent = pairing.last
  if (recent && recent.number === number && Date.now() - recent.at < 45_000) return recent // avoid hammering WhatsApp
  await waitUntilReady(20_000)
  if (!pairing.ready || !pairing.sock) throw new Error('The bot is still starting. Try again in a few seconds.')
  const code = await pairing.sock.requestPairingCode(number)
  pairing.last = { number, code, at: Date.now(), gen: pairing.gen }
  console.log(`Pairing code issued for ${number}`)
  return pairing.last
}
