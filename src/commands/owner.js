export default {
  name: 'owner',
  category: 'General',
  description: 'Show the bot owner contact',
  async run({ reply, owners }) {
    if (!owners.length) return reply('No owner number has been set.')
    await reply(`👑 *Owner*\n${owners.map((n) => `wa.me/${n}`).join('\n')}`)
  }
}
