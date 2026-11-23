import { config } from '../config.js'

export default {
  name: 'owner',
  category: 'General',
  description: 'Show the bot owner contact',
  async run({ reply }) {
    if (!config.owners.length) return reply('No owner number has been set.')
    await reply(`👑 *Owner*\n${config.owners.map((n) => `wa.me/${n}`).join('\n')}`)
  }
}
