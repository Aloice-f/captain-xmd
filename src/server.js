import http from 'node:http'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { config } from './config.js'
import { cleanNumber, format, needsPassword } from './pairing.js'
import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  pairSession,
  sessionCounts,
  unlinkSession
} from './sessions.js'

const PAGE = new URL('../public/index.html', import.meta.url)
const SONGS = [['song.mp3', 'audio/mpeg'], ['song.wav', 'audio/wav']].map(([f, t]) => [new URL(`../public/${f}`, import.meta.url), t])

/** Serve public/song.mp3 (or song.wav) with Range support, which Safari needs for audio. */
function sendSong(req, res) {
  const found = SONGS.find(([url]) => fs.existsSync(url))
  if (!found) return res.writeHead(404).end()
  const [url, type] = found
  const size = fs.statSync(url).size
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
  let start = 0
  let end = size - 1
  let code = 200
  if (m) {
    start = m[1] ? Number(m[1]) : 0
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
    if (start > end) return res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end()
    code = 206
  }
  res.writeHead(code, {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    ...(code === 206 && { 'Content-Range': `bytes ${start}-${end}/${size}` })
  })
  fs.createReadStream(url, { start, end }).pipe(res)
}

const hits = new Map() // ip -> timestamps, for rate limiting
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest()

function limited(ip, max = 8) {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > max
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (c) => {
      body += c
      if (body.length > 4096) {
        reject(new Error('Request too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'))
      } catch {
        reject(new Error('Invalid request'))
      }
    })
  })
}

/** The dashboard password. When none is configured the dashboard is open. */
function authed(req) {
  if (!needsPassword()) return true
  const given = String(req.headers['x-dashboard-key'] ?? '')
  return crypto.timingSafeEqual(sha(given), sha(config.dashboardPassword))
}

const SESSION_ROUTE = /^\/api\/sessions\/([a-z0-9]{6,32})\/(pair|unlink|delete)$/

/** HTTP server: health check for Render + the multi-bot dashboard. */
export function startServer() {
  const send = (res, code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(data))
  }

  const server = http.createServer(async (req, res) => {
    const path = req.url.split('?')[0]
    const ip = (req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim()

    if (path === '/health') return send(res, 200, { ok: true, bot: config.botName, ...sessionCounts() })

    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      try {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy':
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; media-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
        })
        return res.end(fs.readFileSync(PAGE))
      } catch {
        return send(res, 200, { bot: config.botName, ...sessionCounts() })
      }
    }

    if (req.method === 'GET' && path === '/song') return sendSong(req, res)
    if (path === '/favicon.ico') return res.writeHead(204).end()

    // Public: only totals, no phone numbers.
    if (req.method === 'GET' && path === '/api/status') {
      return send(res, 200, {
        botName: config.botName,
        needsPassword: needsPassword(),
        maxSessions: config.maxSessions,
        ...sessionCounts()
      })
    }

    if (path.startsWith('/api/') && !authed(req)) {
      return send(res, 401, { error: 'Wrong access key.' })
    }

    if (req.method === 'GET' && path === '/api/sessions') {
      return send(res, 200, {
        maxSessions: config.maxSessions,
        sessions: listSessions().map((s) => s.getStatus())
      })
    }

    if (req.method === 'POST' && path === '/api/sessions') {
      try {
        if (limited(ip)) return send(res, 429, { error: 'Too many attempts. Wait a few minutes and try again.' })
        const body = await readJson(req)
        const { number, error } = cleanNumber(body.number)
        if (error) return send(res, 400, { error })
        const session = await createSession({ number, label: body.label })
        let code = null
        let warning = null
        try {
          code = await pairSession(session.id, number)
        } catch (e) {
          warning = `Bot added, but WhatsApp did not give a code: ${e.message}`
        }
        return send(res, 200, {
          session: session.getStatus(),
          ...(code ? { code: format(code.code), issuedAt: code.at, gen: code.gen } : {}),
          ...(warning ? { warning } : {})
        })
      } catch (e) {
        console.error('Create bot failed:', e.message)
        return send(res, 400, { error: e.message })
      }
    }

    const route = path.match(SESSION_ROUTE)
    if (req.method === 'POST' && route) {
      const [, id, action] = route
      try {
        if (limited(ip)) return send(res, 429, { error: 'Too many attempts. Wait a few minutes and try again.' })

        if (action === 'pair') {
          if (!getSession(id)) return send(res, 404, { error: 'Unknown bot. Refresh the page.' })
          const body = await readJson(req)
          const { number, error } = cleanNumber(body.number)
          if (error) return send(res, 400, { error })
          const code = await pairSession(id, number)
          return send(res, 200, { session: getSession(id).getStatus(), code: format(code.code), issuedAt: code.at, gen: code.gen })
        }

        if (action === 'unlink') {
          const session = await unlinkSession(id)
          return send(res, 200, { ok: true, session })
        }

        if (action === 'delete') {
          await deleteSession(id)
          return send(res, 200, { ok: true })
        }
      } catch (e) {
        console.error(`Session ${action} failed:`, e.message)
        return send(res, 400, { error: e.message })
      }
    }

    res.writeHead(404).end()
  })

  console.log(SONGS.some(([u]) => fs.existsSync(u)) ? 'Theme song found in public/' : 'No theme song: add public/song.wav (or song.mp3)')
  server.listen(config.port, () => console.log(`HTTP server listening on :${config.port}`))
  if (!needsPassword()) console.log('⚠️  No DASHBOARD_PASSWORD set: anyone with the URL can add or remove bots.')

  // Render free web services sleep after ~15 min without inbound traffic.
  // Self-pinging helps; an external pinger (UptimeRobot / cron-job.org) is more reliable.
  if (config.publicUrl) {
    setInterval(() => {
      fetch(`${config.publicUrl}/health`).catch(() => {})
    }, 10 * 60 * 1000)
  }
}
