export default {
  name: 'groupinfo',
  aliases: ['ginfo'],
  category: 'Group',
  description: 'Show group details',
  groupOnly: true,
  async run({ reply, group }) {
    const { meta } = await group()
    const admins = meta.participants.filter((p) => p.admin).length
    await reply(
      `👥 *${meta.subject}*\nMembers: ${meta.participants.length}\nAdmins: ${admins}\nCreated: ${new Date((meta.creation ?? 0) * 1000).toDateString()}\n\n${meta.desc ?? ''}`.trim()
    )
  }
}
