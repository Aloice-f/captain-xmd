import crypto from 'node:crypto'
import { config } from './config.js'
import { supabase } from './supabase.js'
import { BotSession } from './session.js'

/** Every bot ever added (linked or not). Sockets only exist for started bots. */
const sessions = new Map()
let allCommands = null

export const getSession = (id) => sessions.get(id)

/** Forget a bot completely: socket, credentials, per-bot settings and its dashboard entry. */
export async function removeSession(id) {
  const session = sessions.get(id)
  session?.stop()
  sessions.delete(id)
  const results = await Promise.all([
    supabase.from('wa_sessions').delete().eq('session_id', id),
    supabase.from('chat_settings').delete().like('chat_id', `session:${id}:%`),
    supabase.from('bot_sessions').delete().eq('id', id)
  ])
  for (const { error } of results) if (error) console.error(`[${id}] cleanup:`, error.message)
}
export const listSessions = () => [...sessions.values()]
export const sessionCounts = () => {
  const all = listSessions()
  return { total: all.length, connected: all.filter((s) => s.status === 'open').length }
}

const missingTable = (e) =>
  e?.code === 'PGRST205' || /bot_sessions.*(schema cache|does not exist)/i.test(e?.message ?? '')

/** Load bots from Supabase and reconnect the linked ones. */
export async function loadSessions(commands) {
  allCommands = commands

  const { data, error } = await supabase
    .from('bot_sessions')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    if (missingTable(error)) {
      console.error(
        '\nThe bot_sessions table is missing.\n' +
          'Open Supabase -> SQL Editor, run the updated supabase/schema.sql, then start the bot again.\n'
      )
    } else {
      console.error('Could not load bots:', error.message)
    }
    process.exit(1)
  }

  let rows = data ?? []

  // Upgrade path: an older deployment only has SESSION_ID + credentials in wa_sessions.
  if (!rows.length && config.legacySessionId) {
    const row = {
      id: config.legacySessionId,
      label: 'Main',
      owner_number: config.pairNumber || null
    }
    const { error: insertError } = await supabase.from('bot_sessions').insert(row)
    if (insertError && !/duplicate key/i.test(insertError.message)) {
      console.error('Could not import the old session:', insertError.message)
    } else {
      console.log(`Imported the existing "${config.legacySessionId}" session as a multi-bot entry.`)
    }
    rows = [{ ...row, created_at: new Date().toISOString() }]
  }

  const toStart = []
  for (const row of rows) {
    const session = new BotSession(row)
    session.commands = allCommands
    session.onPurge = removeSession
    sessions.set(session.id, session)

    if (await session.hasCreds()) {
      toStart.push(() => session.start())
    } else if (session.id === config.legacySessionId && config.pairNumber) {
      // Preserve the old "pair from PAIR_NUMBER at boot" behaviour for the migrated bot.
      toStart.push(() => session.start().then(() => session.requestCode(config.pairNumber)))
    } else {
      continue
    }
    const last = toStart.length - 1
    const run = toStart[last]
    toStart[last] = () =>
      run().catch((e) => console.error(`[${session.id}] start failed:`, e.message))
  }

  // Reconnect in the background, a few at a time, so the server (and the dashboard)
  // is up immediately and 100 bots don't all connect in the same second.
  ;(async () => {
    for (let i = 0; i < toStart.length; i += config.startBatchSize) {
      await Promise.all(toStart.slice(i, i + config.startBatchSize).map((fn) => fn()))
      if (i + config.startBatchSize < toStart.length) {
        await new Promise((r) => setTimeout(r, config.startBatchDelayMs))
      }
    }
    if (toStart.length) console.log(`All ${toStart.length} linked bot(s) started, ${sessionCounts().connected} connected`)
  })()

  console.log(`${rows.length} bot(s) loaded, ${sessionCounts().connected} connected`)
}

/** Add a bot and start its (unpaired) socket so a pairing code can be requested. */
export async function createSession({ number, label }) {
  if (sessions.size >= config.maxSessions) {
    throw new Error(
      `This deployment is limited to ${config.maxSessions} bots. Increase MAX_SESSIONS (watch your RAM) or remove one.`
    )
  }

  const id = crypto.randomBytes(6).toString('hex')
  const row = {
    id,
    label: String(label ?? '').trim().slice(0, 40) || `Bot ${number.slice(-4)}`,
    owner_number: number
  }

  const { error } = await supabase.from('bot_sessions').insert(row)
  if (error) throw new Error(`Could not save the new bot: ${error.message}`)

  const session = new BotSession({ ...row, created_at: new Date().toISOString() })
  session.commands = allCommands
  session.onPurge = removeSession
  sessions.set(id, session)
  await session.start()
  return session
}

export async function pairSession(id, number) {
  const session = sessions.get(id)
  if (!session) throw new Error('Unknown bot. Refresh the page.')
  session.setOwnerNumber(number)
  return session.requestCode(number)
}

export async function unlinkSession(id) {
  const session = sessions.get(id)
  if (!session) throw new Error('Unknown bot. Refresh the page.')
  await session.unlink()
  const status = session.getStatus()
  await removeSession(id) // a logged-out number is not kept on the website
  return status
}

export async function deleteSession(id) {
  const session = sessions.get(id)
  if (!session) throw new Error('Unknown bot. Refresh the page.')
  await session.destroy()
  await removeSession(id)
}
