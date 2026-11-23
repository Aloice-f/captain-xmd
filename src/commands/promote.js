import { getTargets } from '../utils.js'

export default {
  name: 'promote',
  category: 'Group',
  description: 'Make a member admin (mention or reply)',
  usage: '@user',
  adminOnly: true,
  needsBotAdmin: true,
  async run({ sock, jid, msg, reply }) {
    const targets = getTargets(msg)
    if (!targets.length) return reply('Mention or reply to the user, e.g. .promote @user')
    await sock.groupParticipantsUpdate(jid, targets, 'promote')
    await reply('✅ Done.')
  }
}
