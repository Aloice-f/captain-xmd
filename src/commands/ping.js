export default {
  name: 'ping',
  category: 'General',
  description: 'Check bot response time',
  async run({ reply, msg }) {
    const ms = Math.max(0, Date.now() - Number(msg.messageTimestamp) * 1000)
    await reply(`🏓 Pong! ${ms}ms`)
  }
}
