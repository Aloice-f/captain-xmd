export default {
  name: 'tagall',
  category: 'Group',
  description: 'Mention every member',
  usage: '[message]',
  adminOnly: true,
  async run({ sock, jid, msg, group, text }) {
    const { meta } = await group()
    const ids = meta.participants.map((p) => p.id)
    const body = `📢 *${text || 'Attention everyone!'}*\n\n` + ids.map((i) => `@${i.split('@')[0]}`).join(' ')
    await sock.sendMessage(jid, { text: body, mentions: ids }, { quoted: msg })
  }
}
