import { getMedia, getQuoted, getTargets, sleep, tag } from '../utils.js'

const toJid = (s) => `${String(s).replace(/\D/g, '')}@s.whatsapp.net`
const onOff = (v) => ['on', 'true', 'yes', 'enable'].includes((v || '').toLowerCase())

const adminCmd = (name, desc, extra, run) => ({
  name, category: 'Group', description: desc, adminOnly: true, needsBotAdmin: true, ...extra, run
})

export default [
  // ------------------------------------------------------------------ group management
  adminCmd('add', 'Add a number to the group', { usage: '<number>' }, async ({ sock, jid, args, reply }) => {
    if (!args[0]) return reply('Usage: .add 254712345678')
    const res = await sock.groupParticipantsUpdate(jid, [toJid(args[0])], 'add')
    await reply(res?.[0]?.status === '200' ? '✅ Added.' : `⚠️ Could not add (status ${res?.[0]?.status ?? 'unknown'}). They may have privacy settings on.`)
  }),
  adminCmd('revoke', 'Reset the group invite link', { aliases: ['resetlink'] }, async ({ sock, jid, reply }) => {
    await sock.groupRevokeInvite(jid)
    await reply('✅ Old link is now invalid. Use .link for the new one.')
  }),
  adminCmd('setname', 'Change group name', { aliases: ['gname'], usage: '<name>' }, async ({ sock, jid, text, reply }) => {
    if (!text) return reply('Usage: .setname New Name')
    await sock.groupUpdateSubject(jid, text.slice(0, 100))
    await reply('✅ Name updated.')
  }),
  adminCmd('setdesc', 'Change group description', { aliases: ['gdesc'], usage: '<text>' }, async ({ sock, jid, text, reply }) => {
    if (!text) return reply('Usage: .setdesc Welcome to our group')
    await sock.groupUpdateDescription(jid, text)
    await reply('✅ Description updated.')
  }),
  adminCmd('mute', 'Only admins can send messages', { aliases: ['close'] }, async ({ sock, jid, reply }) => {
    await sock.groupSettingUpdate(jid, 'announcement'); await reply('🔇 Group closed: only admins can send messages.')
  }),
  adminCmd('unmute', 'Everyone can send messages', { aliases: ['open'] }, async ({ sock, jid, reply }) => {
    await sock.groupSettingUpdate(jid, 'not_announcement'); await reply('🔊 Group opened: everyone can send messages.')
  }),
  adminCmd('lock', 'Only admins can edit group info', {}, async ({ sock, jid, reply }) => {
    await sock.groupSettingUpdate(jid, 'locked'); await reply('🔒 Only admins can edit group info now.')
  }),
  adminCmd('unlock', 'Everyone can edit group info', {}, async ({ sock, jid, reply }) => {
    await sock.groupSettingUpdate(jid, 'unlocked'); await reply('🔓 Everyone can edit group info now.')
  }),
  adminCmd('setpp', 'Set group picture (reply to an image)', { aliases: ['gdp'] }, async ({ sock, jid, msg, reply }) => {
    const media = await getMedia(sock, msg, ['imageMessage'])
    if (!media) return reply('Reply to an image with .setpp')
    await sock.updateProfilePicture(jid, media.buffer)
    await reply('✅ Group picture updated.')
  }),
  adminCmd('disappear', 'Disappearing messages', { aliases: ['ephemeral', 'disappearing'], usage: 'off|24h|7d|90d', needsBotAdmin: false }, async ({ sock, jid, args, reply }) => {
    const map = { off: 0, '24h': 86400, '7d': 604800, '90d': 7776000 }
    const v = map[(args[0] || '').toLowerCase()]
    if (v === undefined) return reply('Usage: .disappear off | 24h | 7d | 90d')
    await sock.sendMessage(jid, { disappearingMessagesInChat: v || false })
    await reply(v ? `⏳ Messages will disappear after ${args[0]}.` : '✅ Disappearing messages off.')
  }),
  {
    name: 'admins', category: 'Group', description: 'List group admins', groupOnly: true,
    async run({ sock, jid, msg, group }) {
      const { meta } = await group()
      const admins = meta.participants.filter((p) => p.admin).map((p) => p.id)
      await sock.sendMessage(jid, { text: `👑 *Admins (${admins.length})*\n${admins.map(tag).join('\n')}`, mentions: admins }, { quoted: msg })
    }
  },
  {
    name: 'tagadmins', category: 'Group', description: 'Mention all admins', usage: '[message]', groupOnly: true,
    async run({ sock, jid, msg, group, text }) {
      const { meta } = await group()
      const admins = meta.participants.filter((p) => p.admin).map((p) => p.id)
      await sock.sendMessage(jid, { text: `📣 ${text || 'Admins, you are needed!'}\n${admins.map(tag).join(' ')}`, mentions: admins }, { quoted: msg })
    }
  },
  adminCmd('antilink', 'Block group invite links', { usage: 'delete|kick|off' }, async ({ jid, args, reply, session }) => {
    const m = (args[0] || '').toLowerCase()
    if (!['delete', 'kick', 'off'].includes(m)) return reply('Usage: .antilink delete | kick | off\n(I must be admin. Admins can still post links.)')
    await session.store.set(jid, 'antilink', m === 'off' ? null : m)
    await reply(m === 'off' ? '✅ Antilink off.' : `✅ Antilink on: I will ${m} anyone who posts a group invite link.`)
  }),
  adminCmd('welcome', 'Welcome/goodbye messages', { usage: 'on|off', needsBotAdmin: false }, async ({ jid, args, reply, session }) => {
    if (!args[0]) return reply('Usage: .welcome on | off')
    await session.store.set(jid, 'welcome', onOff(args[0]))
    await reply(onOff(args[0]) ? '✅ Welcome messages on.' : '✅ Welcome messages off.')
  }),
  {
    name: 'delete', aliases: ['del'], category: 'Group', description: 'Delete a replied message', adminOnly: true, needsBotAdmin: true,
    async run({ sock, jid, msg, reply }) {
      const q = getQuoted(msg)
      if (!q) return reply('Reply to the message you want deleted with .delete')
      await sock.sendMessage(jid, { delete: { remoteJid: jid, fromMe: false, id: q.id, participant: q.participant } })
    }
  },

  // ------------------------------------------------------------------ owner / account
  {
    name: 'leave', category: 'Owner', description: 'Bot leaves this group', ownerOnly: true, groupOnly: true,
    async run({ sock, jid, reply }) { await reply('👋 Goodbye!'); await sleep(800); await sock.groupLeave(jid) }
  },
  {
    name: 'join', category: 'Owner', description: 'Join a group by invite link', ownerOnly: true, usage: '<link>',
    async run({ sock, args, reply }) {
      const code = (args[0] || '').match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/)?.[1]
      if (!code) return reply('Usage: .join https://chat.whatsapp.com/XXXX')
      await sock.groupAcceptInvite(code)
      await reply('✅ Joined.')
    }
  },
  {
    name: 'block', category: 'Owner', description: 'Block a user (mention/reply/number)', ownerOnly: true, usage: '@user',
    async run({ sock, msg, args, reply }) {
      const t = getTargets(msg)[0] || (args[0] && toJid(args[0]))
      if (!t) return reply('Mention, reply to, or give a number: .block 2547...')
      await sock.updateBlockStatus(t, 'block'); await reply('🚫 Blocked.')
    }
  },
  {
    name: 'unblock', category: 'Owner', description: 'Unblock a user', ownerOnly: true, usage: '@user',
    async run({ sock, msg, args, reply }) {
      const t = getTargets(msg)[0] || (args[0] && toJid(args[0]))
      if (!t) return reply('Mention, reply to, or give a number: .unblock 2547...')
      await sock.updateBlockStatus(t, 'unblock'); await reply('✅ Unblocked.')
    }
  },
  {
    name: 'setbio', category: 'Owner', description: "Change the bot's About text", ownerOnly: true, usage: '<text>',
    async run({ sock, text, reply }) {
      if (!text) return reply('Usage: .setbio Powered by Captain-XMD')
      await sock.updateProfileStatus(text.slice(0, 139)); await reply('✅ About updated.')
    }
  },
  {
    name: 'setmyname', category: 'Owner', description: "Change the bot's profile name", ownerOnly: true, usage: '<name>',
    async run({ sock, text, reply }) {
      if (!text) return reply('Usage: .setmyname Captain-XMD')
      await sock.updateProfileName(text.slice(0, 25)); await reply('✅ Name updated.')
    }
  },
  {
    name: 'setbotpp', category: 'Owner', description: "Change the bot's profile picture (reply to image)", ownerOnly: true,
    async run({ sock, msg, reply }) {
      const media = await getMedia(sock, msg, ['imageMessage'])
      if (!media) return reply('Reply to an image with .setbotpp')
      await sock.updateProfilePicture(sock.user.id, media.buffer); await reply('✅ Profile picture updated.')
    }
  },
  {
    name: 'listgroups', aliases: ['groups', 'gclist'], category: 'Owner', description: 'List groups the bot is in', ownerOnly: true,
    async run({ sock, reply }) {
      const g = Object.values(await sock.groupFetchAllParticipating())
      await reply(g.length ? g.map((x, i) => `${i + 1}. ${x.subject} (${x.participants.length})`).join('\n').slice(0, 3500) : 'Not in any groups.')
    }
  }
]
