export default {
  name: 'restart',
  category: 'Owner',
  description: 'Restart the bot (Render brings it back up)',
  ownerOnly: true,
  async run({ reply }) {
    await reply('♻️ Restarting...')
    setTimeout(() => process.exit(0), 1000)
  }
}
