export default {
  name: 'hidetag',
  category: 'Group',
  description: 'Notify everyone without listing names',
  usage: '<message>',
  adminOnly: true,
  async run({ sock, jid, group, text }) {
    const { meta } = await group()
    await sock.sendMessage(jid, { text: text || '📢', mentions: meta.participants.map((p) => p.id) })
  }
}
