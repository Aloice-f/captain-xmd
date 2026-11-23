import { config } from './config.js'

/** 12345678 -> 1234-5678, the format WhatsApp shows on the phone. */
export const format = (code) => code.match(/.{1,4}/g)?.join('-') ?? code

export const needsPassword = () => !!config.dashboardPassword

/** Normalise and validate a phone number. Returns { number } or { error }. */
export function cleanNumber(input) {
  const raw = String(input ?? '').trim()
  const number = raw.replace(/[\s\-().+]/g, '')
  if (!/^\d+$/.test(number)) return { error: 'Use digits only, for example 254712345678.' }
  if (number.startsWith('0')) return { error: 'Start with your country code instead of 0. Kenya example: 254712345678.' }
  if (number.length < 8 || number.length > 15) return { error: 'That number looks the wrong length. Include the country code, digits only.' }
  return { number }
}
