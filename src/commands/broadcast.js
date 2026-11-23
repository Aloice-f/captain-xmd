export default {
  name: 'broadcast',
  aliases: ['bc'],
  category: 'Owner',
  description: 'Send a message to all your groups',
  usage: '<message>',
  ownerOnly: true,
  async run({ sock, reply, text }) {
    if (!text) return reply('Usage: .broadcast your message')
    const groups = Object.keys(await sock.groupFetchAllParticipating())
    let sent = 0
    for (const g of groups) {
      try {
        await sock.sendMessage(g, { text: `📢 *Broadcast*\n\n${text}` })
        sent++
      } catch {}
      await new Promise((r) => setTimeout(r, 1500)) // go slow to avoid WhatsApp rate limits
    }
    await reply(`✅ Sent to ${sent}/${groups.length} groups.`)
  }
}
