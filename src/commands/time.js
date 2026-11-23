import { config } from '../config.js'

export default {
  name: 'time',
  aliases: ['date'],
  category: 'General',
  description: 'Current date and time',
  async run({ reply }) {
    const now = new Date().toLocaleString('en-GB', { timeZone: config.timezone, dateStyle: 'full', timeStyle: 'medium' })
    await reply(`🕒 ${now}\n(${config.timezone})`)
  }
}
