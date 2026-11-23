import './quiet.js'
import { assertConfig } from './config.js'
import { loadCommands } from './commandLoader.js'
import { loadSessions, listSessions } from './sessions.js'
import { startServer } from './server.js'

assertConfig()

const shutdown = () => {
  for (const session of listSessions()) session.stop()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
process.on('unhandledRejection', (e) => console.error('Unhandled rejection:', e))

try {
  const commands = await loadCommands()
  console.log(`Loaded ${new Set(commands.values()).size} commands`)

  await loadSessions(commands)
  startServer()
} catch (e) {
  console.error('Fatal start error:', e)
  process.exit(1)
}
