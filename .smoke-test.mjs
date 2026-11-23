process.env.SUPABASE_URL = 'http://127.0.0.1:9'
process.env.SUPABASE_SERVICE_KEY = 'dummy'
process.env.PORT = '3999'
process.env.DASHBOARD_PASSWORD = 'test'
process.env.MAX_SESSIONS = '2'

const { startServer } = await import('./src/server.js')
const { cleanNumber } = await import('./src/pairing.js')
startServer()
await new Promise((r) => setTimeout(r, 400))

const base = 'http://127.0.0.1:3999'
const html = await (await fetch(base + '/')).text()
const st = await (await fetch(base + '/api/status')).json()
const noKey = await fetch(base + '/api/sessions')
const badKey = await fetch(base + '/api/sessions', { headers: { 'x-dashboard-key': 'nope' } })
const withKey = await fetch(base + '/api/sessions', { headers: { 'x-dashboard-key': 'test' } })
const health = await (await fetch(base + '/health')).json()

console.log(
  JSON.stringify(
    {
      pageHasDashboard: html.includes('MULTI-BOT CONTROL ROOM'),
      pageHasAddButton: html.includes('Add bot'),
      status: st,
      noKey: noKey.status,
      badKey: badKey.status,
      withKey: withKey.status,
      withKeyBody: await withKey.json(),
      health,
      acceptNumber: cleanNumber('+254 712-345-678'),
      rejectZero: cleanNumber('0712345678'),
      rejectShort: cleanNumber('123')
    },
    null,
    2
  )
)
process.exit(0)
