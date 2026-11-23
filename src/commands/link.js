export default {
  name: 'link',
  aliases: ['invite'],
  category: 'Group',
  description: 'Get the group invite link',
  adminOnly: true,
  needsBotAdmin: true,
  async run({ sock, jid, reply }) {
    await reply(`🔗 https://chat.whatsapp.com/${await sock.groupInviteCode(jid)}`)
  }
}
