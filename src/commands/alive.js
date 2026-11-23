import { formatUptime } from '../utils.js'

export default {
  name: 'alive',
  aliases: ['uptime', 'runtime'],
  category: 'General',
  description: 'Show bot status and uptime',
  async run({ reply, botName }) {
    await reply(`⚓ *${botName}* is online.\n⏱ Uptime: ${formatUptime(process.uptime())}`)
  }
}
