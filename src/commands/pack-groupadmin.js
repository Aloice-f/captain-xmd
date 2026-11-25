import { getTargets, sleep, num } from '../utils.js'
import { getGuards, setGuard } from '../guards.js'

const onOff = (v) => {
  const x = (v || '').toLowerCase()
  if (['on', 'true', 'yes', 'enable'].includes(x)) return true
  if (['off', 'false', 'no', 'disable'].includes(x)) return false
  return null
}
const adminCmd = (name, description, extra, run) => ({
  name, category: 'Group', description, adminOnly: true, needsBotAdmin: true, ...extra, run
})

/** Per-group on/off switch stored in the group's guards row. */
const guardToggle = (name, key, label, onText, offText, extra = {}) =>
  adminCmd(name, `Turn ${label} on or off in this group`, { usage: 'on|off', ...extra }, async ({ jid, args, reply, session }) => {
    const v = onOff(args[0])
    if (v === null) return reply(`${label} is *${(await getGuards(session, jid))[key] ? 'ON' : 'OFF'}* in this group.\nUsage: .${name} on | off`)
    await setGuard(session, jid, { [key]: v })
    await reply(v ? onText : offText)
  })

/** Dangerous bulk actions: only bot owners/sudo or the person who created the group. */
const canBulk = ({ isOwner, sender }, meta) => isOwner || (meta.owner && num(meta.owner) === num(sender))

export default [
  // ------------------------------------------------------------------ join requests
  adminCmd('requestlist', 'Show pending join requests', {}, async ({ sock, jid, reply }) => {
    const list = await sock.groupRequestParticipantsList(jid)
    if (!list?.length) return reply('✅ No pending join requests.')
    await reply(`📋 *Pending requests (${list.length})*\n${list.slice(0, 50).map((p, i) => `${i + 1}. ${num(p.jid || p.phone_number || p)}`).join('\n')}\n\nUse .acceptall or .rejectall`)
  }),
  adminCmd('acceptall', 'Approve all pending join requests', {}, async ({ sock, jid, reply }) => {
    const list = await sock.groupRequestParticipantsList(jid)
    if (!list?.length) return reply('No pending join requests.')
    await sock.groupRequestParticipantsUpdate(jid, list.map((p) => p.jid || p), 'approve')
    await reply(`✅ Approved ${list.length} request(s).`)
  }),
  adminCmd('rejectall', 'Reject all pending join requests', {}, async ({ sock, jid, reply }) => {
    const list = await sock.groupRequestParticipantsList(jid)
    if (!list?.length) return reply('No pending join requests.')
    await sock.groupRequestParticipantsUpdate(jid, list.map((p) => p.jid || p), 'reject')
    await reply(`✅ Rejected ${list.length} request(s).`)
  }),
  adminCmd('joinapproval', 'Require admin approval to join', { usage: 'on|off' }, async ({ sock, jid, args, reply }) => {
    const v = onOff(args[0])
    if (v === null) return reply('Usage: .joinapproval on | off')
    await sock.groupJoinApprovalMode(jid, v ? 'on' : 'off')
    await reply(v ? '✅ New members now need admin approval.' : '✅ Anyone with the link can join.')
  }),

  // ------------------------------------------------------------------ bulk actions
  {
    name: 'kickall', category: 'Group', description: 'Remove every non-admin member', groupOnly: true, adminOnly: true, needsBotAdmin: true,
    async run(ctx) {
      const { sock, jid, reply, sender } = ctx
      const { meta } = await ctx.group()
      if (!canBulk(ctx, meta)) return reply('⛔ Only the group creator or the bot owner can use .kickall.')
      const botIds = [sock.user?.id, sock.user?.lid].filter(Boolean).map(num)
      const targets = meta.participants.filter((p) => !p.admin && !botIds.includes(num(p.id)) && num(p.id) !== num(sender)).map((p) => p.id)
      if (!targets.length) return reply('There are no non-admin members to remove.')
      await reply(`⚠️ Removing ${targets.length} member(s)...`)
      for (let i = 0; i < targets.length; i += 5) {
        await sock.groupParticipantsUpdate(jid, targets.slice(i, i + 5), 'remove').catch(() => {})
        await sleep(1500)
      }
      await reply('✅ Done.')
    }
  },
  {
    name: 'dismissall', category: 'Group', description: 'Demote every admin except the creator, you and the bot', groupOnly: true, adminOnly: true, needsBotAdmin: true,
    async run(ctx) {
      const { sock, jid, reply, sender } = ctx
      const { meta } = await ctx.group()
      if (!canBulk(ctx, meta)) return reply('⛔ Only the group creator or the bot owner can use .dismissall.')
      const botIds = [sock.user?.id, sock.user?.lid].filter(Boolean).map(num)
      const targets = meta.participants
        .filter((p) => p.admin && p.admin !== 'superadmin' && !botIds.includes(num(p.id)) && num(p.id) !== num(sender) && num(p.id) !== num(meta.owner || ''))
        .map((p) => p.id)
      if (!targets.length) return reply('There are no other admins to dismiss.')
      for (let i = 0; i < targets.length; i += 5) {
        await sock.groupParticipantsUpdate(jid, targets.slice(i, i + 5), 'demote').catch(() => {})
        await sleep(1500)
      }
      await reply(`✅ Dismissed ${targets.length} admin(s).`)
    }
  },

  // ------------------------------------------------------------------ polls
  {
    name: 'poll', category: 'Group', description: 'Create a poll', usage: 'Question | option 1 | option 2', groupOnly: true,
    async run({ sock, jid, msg, text, reply }) {
      const [name, ...values] = text.split('|').map((s) => s.trim()).filter(Boolean)
      if (!name || values.length < 2) return reply('Usage: .poll Favourite colour? | Red | Blue | Green')
      if (values.length > 12) return reply('⚠️ A poll can have at most 12 options.')
      await sock.sendMessage(jid, { poll: { name: name.slice(0, 200), values: values.map((v) => v.slice(0, 100)), selectableCount: 1 } }, { quoted: msg })
    }
  },

  // ------------------------------------------------------------------ per-group protections
  guardToggle('antisticker', 'antisticker', 'Anti sticker', '🚫 Anti sticker is *ON*: stickers from non-admins will be deleted.', '✅ Anti sticker is *OFF*.'),
  guardToggle('antitag', 'antitag', 'Anti tag', '🚫 Anti tag is *ON*: messages from non-admins that mention 5+ people will be deleted.', '✅ Anti tag is *OFF*.'),
  guardToggle('antistatus', 'antistatus', 'Anti status mention', '🚫 Anti status is *ON*: group status mentions from non-admins will be deleted.', '✅ Anti status is *OFF*.'),
  guardToggle('autosreact', 'autoreact', 'Auto react', '😀 Auto react is *ON* in this group (uses the .setreact emojis).', '✅ Auto react is *OFF* in this group.', { needsBotAdmin: false }),

  adminCmd('jail', 'Silence a member: everything they send is deleted', { usage: '@user', needsBotAdmin: true }, async (ctx) => {
    const { jid, msg, reply, session, sock } = ctx
    const t = getTargets(msg)[0]
    if (!t) return reply('Mention or reply to the member: .jail @user')
    const { meta } = await ctx.group()
    const botIds = [sock.user?.id, sock.user?.lid].filter(Boolean).map(num)
    if (meta.participants.some((p) => p.admin && num(p.id) === num(t)) || botIds.includes(num(t))) return reply('⚠️ I cannot jail an admin or myself. Demote them first.')
    const g = await getGuards(session, jid)
    await setGuard(session, jid, { jailed: [...new Set([...(g.jailed ?? []), num(t)])] })
    await sock.sendMessage(jid, { text: `⛓ @${num(t)} is in jail. Their messages will be deleted.`, mentions: [t] }, { quoted: msg })
  }),
  adminCmd('unjail', 'Free a jailed member', { usage: '@user', needsBotAdmin: false }, async ({ jid, msg, reply, session, sock }) => {
    const t = getTargets(msg)[0]
    if (!t) return reply('Mention or reply to the member: .unjail @user')
    const g = await getGuards(session, jid)
    await setGuard(session, jid, { jailed: (g.jailed ?? []).filter((n) => n !== num(t)) })
    await sock.sendMessage(jid, { text: `🕊 @${num(t)} is free.`, mentions: [t] }, { quoted: msg })
  }),

  {
    name: 'checkbotadmin', aliases: ['botadmin'], category: 'Admin', description: 'Check if the bot is an admin here', groupOnly: true,
    async run({ reply, group }) {
      const { isBotAdmin } = await group()
      await reply(isBotAdmin ? '✅ I am an admin in this group.' : '⚠️ I am not an admin here. Make me admin so I can manage the group.')
    }
  }
]
