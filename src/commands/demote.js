import { getTargets } from '../utils.js'

export default {
  name: 'demote',
  category: 'Group',
  description: 'Remove admin rights (mention or reply)',
  usage: '@user',
  adminOnly: true,
  needsBotAdmin: true,
  async run({ sock, jid, msg, reply }) {
    const targets = getTargets(msg)
    if (!targets.length) return reply('Mention or reply to the user, e.g. .demote @user')
    await sock.groupParticipantsUpdate(jid, targets, 'demote')
    await reply('✅ Done.')
  }
}
