import { config } from '../config.js'
import { formatUptime } from '../utils.js'

export default {
  name: 'alive',
  aliases: ['uptime', 'runtime'],
  category: 'General',
  description: 'Show bot status and uptime',
  async run({ reply }) {
    await reply(`⚓ *${config.botName}* is online.\n⏱ Uptime: ${formatUptime(process.uptime())}`)
  }
}
