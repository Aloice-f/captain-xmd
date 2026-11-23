export default {
  name: 'id',
  category: 'Tools',
  description: 'Show chat and sender IDs',
  async run({ reply, jid, sender }) {
    await reply(`🆔 Chat: ${jid}\n👤 You: ${sender}`)
  }
}
