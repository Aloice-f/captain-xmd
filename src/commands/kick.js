import { getTargets } from '../utils.js'

export default {
  name: 'kick',
  category: 'Group',
  description: 'Remove a member (mention or reply)',
  usage: '@user',
  adminOnly: true,
  needsBotAdmin: true,
  async run({ sock, jid, msg, reply }) {
    const targets = getTargets(msg)
    if (!targets.length) return reply('Mention or reply to the user, e.g. .kick @user')
    await sock.groupParticipantsUpdate(jid, targets, 'remove')
    await reply('✅ Done.')
  }
}
