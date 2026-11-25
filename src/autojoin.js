import { jidNormalizedUser } from '@whiskeysockets/baileys'
import { config } from './config.js'
import { sendBanner } from './utils.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Already a member / already following are fine; anything else is worth a log line. */
const benign = (e) => /already|conflict|409|participant/i.test(e?.message ?? '')

async function joinGroup(sock, code) {
  await sock.groupAcceptInvite(code)
  return true
}

async function followChannel(sock, code) {
  if (typeof sock.newsletterMetadata !== 'function') throw new Error('This Baileys version has no channel support.')
  const meta = await sock.newsletterMetadata('invite', code)
  await sock.newsletterFollow(meta.id)
  return meta?.name || meta?.thread_metadata?.name?.text || 'our channel'
}

/**
 * Runs once per link (the "done" flag lives in the bot's settings, which are wiped on logout,
 * so linking again later joins again). Reconnects and restarts never repeat it.
 * Returns true when it ran.
 */
export async function autoJoin(sock, session) {
  const groups = config.autoJoinGroups
  const channels = config.autoJoinChannels
  if (!groups.length && !channels.length) return false
  if (await session.store.get('global', 'autojoined', false)) return false
  await session.store.set('global', 'autojoined', true) // set first: a crash must not cause a join loop

  await sleep(8000) // let the fresh connection settle before touching groups
  const joined = []
  for (const code of groups) {
    try {
      await joinGroup(sock, code)
      joined.push('👥 our group')
    } catch (e) {
      if (benign(e)) joined.push('👥 our group')
      else console.error(`[${session.id}] auto-join group failed:`, e.message)
    }
    await sleep(3000)
  }
  for (const code of channels) {
    try {
      joined.push(`📢 ${await followChannel(sock, code)}`)
    } catch (e) {
      if (benign(e)) joined.push('📢 our channel')
      else console.error(`[${session.id}] auto-follow channel failed:`, e.message)
    }
    await sleep(3000)
  }
  if (!joined.length) return true

  const text =
    `🎉 *Welcome!* To keep you updated, this number was added to:\n${[...new Set(joined)].join('\n')}\n\n` +
    `You can leave either one any time from WhatsApp; the bot will not add you again unless you link again.`
  const targets = new Set(session.owners.map((n) => `${n}@s.whatsapp.net`))
  if (sock.user?.id) targets.add(jidNormalizedUser(sock.user.id))
  for (const jid of targets) {
    await sock.sendMessage(jid, { text }).catch(() => {})
  }
  return true
}
