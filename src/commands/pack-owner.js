import os from 'node:os'
import { jidNormalizedUser } from '@whiskeysockets/baileys'
import { getMedia, getQuoted, getTargets, num, formatUptime } from '../utils.js'
import { mediaToContent, defaultReacts, getGuards, setGuard } from '../guards.js'
import { sessionCounts } from '../sessions.js'

const digits = (s) => String(s ?? '').replace(/\D/g, '')
const toJid = (s) => `${digits(s)}@s.whatsapp.net`
const parseOnOff = (v) => {
  const x = (v || '').toLowerCase()
  if (['on', 'true', 'yes', 'enable'].includes(x)) return true
  if (['off', 'false', 'no', 'disable'].includes(x)) return false
  return null
}
const ownCmd = (name, description, extra, run) => ({ name, category: 'Owner', description, ownerOnly: true, ...extra, run })

/** .name on|off for a bot-wide setting kept in session.cfg */
const cfgToggle = (name, key, label, onText, offText, extra = {}) =>
  ownCmd(name, `Turn ${label} on or off`, { usage: 'on|off', ...extra }, async ({ args, reply, session }) => {
    const value = parseOnOff(args[0])
    if (value === null) return reply(`${label} is currently *${session.cfg[key] ? 'ON' : 'OFF'}*.\nUsage: .${name} on | off`)
    await session.setCfg({ [key]: value })
    await reply(value ? onText : offText)
  })

const channelCode = (s = '') => s.match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/)?.[1]

async function resolveChannel(sock, input) {
  if (typeof sock.newsletterMetadata !== 'function') throw new Error('This Baileys version does not support channels.')
  if (/@newsletter$/.test(input)) return sock.newsletterMetadata('jid', input)
  const code = channelCode(input)
  if (!code) throw new Error('Send a channel link like https://whatsapp.com/channel/XXXX')
  return sock.newsletterMetadata('invite', code)
}

const COUNTRY_CODES = {
  1: 'USA / Canada', 7: 'Russia / Kazakhstan', 20: 'Egypt', 27: 'South Africa', 33: 'France', 34: 'Spain', 39: 'Italy',
  44: 'United Kingdom', 49: 'Germany', 55: 'Brazil', 60: 'Malaysia', 62: 'Indonesia', 63: 'Philippines', 81: 'Japan',
  86: 'China', 90: 'Turkey', 91: 'India', 92: 'Pakistan', 93: 'Afghanistan', 94: 'Sri Lanka', 212: 'Morocco',
  213: 'Algeria', 218: 'Libya', 220: 'Gambia', 221: 'Senegal', 225: 'Ivory Coast', 233: 'Ghana', 234: 'Nigeria',
  237: 'Cameroon', 243: 'DR Congo', 250: 'Rwanda', 251: 'Ethiopia', 252: 'Somalia', 253: 'Djibouti', 254: 'Kenya',
  255: 'Tanzania', 256: 'Uganda', 257: 'Burundi', 260: 'Zambia', 263: 'Zimbabwe', 265: 'Malawi', 966: 'Saudi Arabia',
  971: 'United Arab Emirates', 880: 'Bangladesh', 977: 'Nepal'
}
const countryOf = (n) => {
  for (const len of [3, 2, 1]) {
    const c = COUNTRY_CODES[Number(n.slice(0, len))]
    if (c) return c
  }
  return 'Unknown'
}

/** Download the (view once) media a command replied to. */
async function quotedMedia(sock, msg, jid) {
  const q = getQuoted(msg)
  if (!q?.message) return null
  return mediaToContent(sock, {
    key: { remoteJid: jid, id: q.id, participant: q.participant, fromMe: false },
    message: q.message
  })
}

export default [
  // ------------------------------------------------------------------ everyone
  {
    name: 'report', category: 'Owner', description: 'Send a report to the bot owner', usage: '<text>',
    async run({ sock, text, reply, sender, jid, session }) {
      if (!text) return reply('Usage: .report describe the problem')
      if (!session.owners.length) return reply('No owner number has been set for this bot.')
      for (const n of session.owners) {
        await sock.sendMessage(`${n}@s.whatsapp.net`, {
          text: `📩 *Report*\nFrom: wa.me/${num(sender)}\nChat: ${jid.endsWith('@g.us') ? 'group' : 'private'}\n\n${text}`
        }).catch(() => {})
      }
      await reply('✅ Your report was sent to the owner.')
    }
  },

  // ------------------------------------------------------------------ switches
  cfgToggle('antidelete', 'antidelete', 'Anti-delete',
    '🗑 Anti-delete is *ON*. Deleted messages will be sent to the bot\'s own chat.', '🗑 Anti-delete is *OFF*.'),
  cfgToggle('antionce', 'antionce', 'Anti view-once',
    '👁 Anti view-once is *ON*. View-once media will be saved to the bot\'s own chat.', '👁 Anti view-once is *OFF*.'),
  cfgToggle('autolike', 'autolike', 'Auto like status',
    '❤️ Auto like status is *ON*. (Works together with .autoview.)', '❤️ Auto like status is *OFF*.'),
  cfgToggle('autoread', 'autoread', 'Auto read',
    '✔️ Auto read is *ON*. Incoming messages will be marked as read.', '✔️ Auto read is *OFF*.'),
  cfgToggle('creact', 'creact', 'Custom auto reaction',
    '😀 Custom reactions are *ON*. I will react to messages with your .setreact emojis.', '😀 Custom reactions are *OFF*.'),
  cfgToggle('anticall', 'anticall', 'Anti call',
    '📵 Anti call is *ON*. Incoming calls will be rejected.', '📵 Anti call is *OFF*.'),

  ownCmd('setreact', 'Set the emojis used for auto reactions', { usage: '❤️ 🔥 😂' }, async ({ args, reply, session }) => {
    const list = args.filter((a) => a.length <= 12).slice(0, 10)
    if (!list.length) return reply('Usage: .setreact ❤️ 🔥 😂 (up to 10 emojis, separated by spaces)\nUse .setreact reset to go back to the defaults.')
    if (list[0].toLowerCase() === 'reset') {
      await session.setCfg({ reacts: [] })
      return reply('✅ Reaction list reset to the defaults.')
    }
    await session.setCfg({ reacts: list })
    await reply(`✅ Reactions saved: ${list.join(' ')}`)
  }),
  ownCmd('reactlist', 'Show the auto reaction emojis', {}, async ({ reply, session }) => {
    const list = session.cfg.reacts?.length ? session.cfg.reacts : defaultReacts()
    await reply(`😀 *Reaction list*\n${list.join(' ')}\n\n.creact: ${session.cfg.creact ? 'ON' : 'OFF'} · .autolike: ${session.cfg.autolike ? 'ON' : 'OFF'}`)
  }),

  // ------------------------------------------------------------------ view once
  ownCmd('vv', 'Reveal a view-once message here (reply to it)', {}, async ({ sock, msg, jid, reply }) => {
    const content = await quotedMedia(sock, msg, jid)
    if (!content) return reply('Reply to a view-once photo, video or voice note with .vv')
    await sock.sendMessage(jid, content, { quoted: msg })
  }),
  ownCmd('vv2', "Send a view-once message to the bot's own chat", {}, async ({ sock, msg, jid, reply }) => {
    const content = await quotedMedia(sock, msg, jid)
    if (!content) return reply('Reply to a view-once photo, video or voice note with .vv2')
    await sock.sendMessage(jidNormalizedUser(sock.user.id), content)
    await reply('✅ Sent to my own chat.')
  }),

  // ------------------------------------------------------------------ channels & numbers
  ownCmd('follow', 'Follow a WhatsApp channel', { usage: '<channel link>' }, async ({ sock, args, reply }) => {
    const meta = await resolveChannel(sock, args[0] || '').catch((e) => reply(`⚠️ ${e.message}`) && null)
    if (!meta) return
    await sock.newsletterFollow(meta.id)
    await reply(`✅ Now following *${meta.name || meta.thread_metadata?.name?.text || 'the channel'}*.`)
  }),
  ownCmd('unfollow', 'Unfollow a WhatsApp channel', { usage: '<channel link>' }, async ({ sock, args, reply }) => {
    const meta = await resolveChannel(sock, args[0] || '').catch((e) => reply(`⚠️ ${e.message}`) && null)
    if (!meta) return
    await sock.newsletterUnfollow(meta.id)
    await reply('✅ Unfollowed.')
  }),
  ownCmd('channelban', 'Check whether a channel is active or suspended', { usage: '<channel link>' }, async ({ sock, args, reply }) => {
    const meta = await resolveChannel(sock, args[0] || '').catch((e) => reply(`⚠️ ${e.message}`) && null)
    if (!meta) return
    const name = meta.name || meta.thread_metadata?.name?.text || 'Unknown'
    const state = meta.state?.type || meta.state || 'unknown'
    const subs = meta.subscribers ?? meta.thread_metadata?.subscribers_count ?? '?'
    const bad = /suspend|ban|terminat|geo/i.test(String(state))
    await reply(`📢 *${name}*\nState: ${state} ${bad ? '🚫 (restricted)' : '✅'}\nFollowers: ${subs}`)
  }),
  ownCmd('checkban', 'Check if a number is registered on WhatsApp', { usage: '<number>' }, async ({ sock, args, reply }) => {
    const n = digits(args[0])
    if (n.length < 7) return reply('Usage: .checkban 254712345678')
    const [res] = (await sock.onWhatsApp(toJid(n))) || []
    await reply(
      res?.exists
        ? `✅ +${n} is registered on WhatsApp, so it is not banned.`
        : `❌ +${n} is not registered on WhatsApp. It was never registered or the account is banned (WhatsApp does not tell these apart).`
    )
  }),
  ownCmd('sim', 'Show the country of a number and whether it is on WhatsApp', { usage: '<number>' }, async ({ sock, args, reply }) => {
    const n = digits(args[0])
    if (n.length < 7) return reply('Usage: .sim 254712345678 (with country code)')
    const [res] = (await sock.onWhatsApp(toJid(n)).catch(() => [])) || []
    await reply(`📱 *+${n}*\nCountry: ${countryOf(n)}\nOn WhatsApp: ${res?.exists ? 'yes' : 'no'}`)
  }),

  // ------------------------------------------------------------------ group-chat tools
  ownCmd('gcban', 'Make the bot ignore commands in this group', { usage: 'on|off|list' }, async ({ jid, args, reply, session, isGroup }) => {
    const banned = session.cfg.bannedGroups
    const a = (args[0] || '').toLowerCase()
    if (a === 'list') return reply(banned.length ? `🚫 *Banned groups*\n${banned.join('\n')}` : 'No banned groups.')
    if (!isGroup) return reply('Use this inside the group you want to ban or unban.')
    const unban = a === 'off' || a === 'unban'
    await session.setCfg({ bannedGroups: unban ? banned.filter((g) => g !== jid) : [...new Set([...banned, jid])] })
    await reply(unban ? '✅ Group unbanned. Commands work here again.' : '🚫 Group banned. I will ignore commands here (owners excepted).\nUse .gcban off to undo it.')
  }),
  ownCmd('gcstatus', 'Overview of all groups the bot is in', {}, async ({ sock, reply, session }) => {
    const groups = Object.values(await sock.groupFetchAllParticipating())
    const members = groups.reduce((n, g) => n + g.participants.length, 0)
    const botIds = [sock.user?.id, sock.user?.lid].filter(Boolean).map(num)
    const admin = groups.filter((g) => g.participants.some((p) => p.admin && [p.id, p.jid, p.lid].filter(Boolean).some((x) => botIds.includes(num(x))))).length
    await reply(`👥 *Group status*\nGroups: ${groups.length}\nMembers in total: ${members}\nI am admin in: ${admin}\nBanned (.gcban): ${session.cfg.bannedGroups.length}`)
  }),
  {
    name: 'gstatus2', category: 'Owner', description: 'Detailed settings of this group', groupOnly: true,
    async run({ reply, group }) {
      const { meta, isBotAdmin } = await group()
      const admins = meta.participants.filter((p) => p.admin).length
      const eph = meta.ephemeralDuration ? `${Math.round(meta.ephemeralDuration / 86400)} day(s)` : 'off'
      await reply(
        `📊 *${meta.subject}*\nMembers: ${meta.participants.length} (${admins} admins)\n` +
          `Who can send: ${meta.announce ? 'admins only' : 'everyone'}\n` +
          `Who can edit info: ${meta.restrict ? 'admins only' : 'everyone'}\n` +
          `Join approval: ${meta.joinApprovalMode ? 'on' : 'off'}\nDisappearing messages: ${eph}\n` +
          `Bot is admin: ${isBotAdmin ? 'yes' : 'no'}`
      )
    }
  },
  ownCmd('count', 'Count the groups and members the bot is in', {}, async ({ sock, reply }) => {
    const groups = Object.values(await sock.groupFetchAllParticipating())
    const members = new Set(groups.flatMap((g) => g.participants.map((p) => num(p.id))))
    await reply(`🔢 Groups: *${groups.length}*\nUnique members across them: *${members.size}*`)
  }),
  ownCmd('release', 'Lift the group ban and free all jailed members here', {}, async ({ jid, reply, session, isGroup }) => {
    if (!isGroup) return reply('Use .release inside a group.')
    await session.setCfg({ bannedGroups: session.cfg.bannedGroups.filter((g) => g !== jid) })
    const g = await getGuards(session, jid)
    const freed = g.jailed?.length ?? 0
    if (freed) await setGuard(session, jid, { jailed: [] })
    await reply(`🕊 Released. Group ban lifted and ${freed} jailed member(s) freed.`)
  }),

  // ------------------------------------------------------------------ bot settings
  ownCmd('mode', 'Public (everyone) or private (owners only)', { usage: 'public|private' }, async ({ args, reply, session }) => {
    const m = (args[0] || '').toLowerCase()
    if (!['public', 'private'].includes(m)) return reply(`Mode is *${session.cfg.mode}*.\nUsage: .mode public | private`)
    await session.setCfg({ mode: m })
    await reply(m === 'public' ? '🌍 Public mode: everyone can use commands.' : '🔒 Private mode: only the owner and sudo users can use commands.')
  }),
  ownCmd('setbotname', 'Change the bot name shown in the menu', { usage: '<name>' }, async ({ text, reply, session }) => {
    if (!text) return reply('Usage: .setbotname Captain-XMD')
    await session.setCfg({ botName: text.slice(0, 30) })
    await reply(`✅ Bot name is now *${session.botName}*.`)
  }),
  ownCmd('setownername', 'Change the owner name shown in the menu', { usage: '<name>' }, async ({ text, reply, session }) => {
    if (!text) return reply('Usage: .setownername Captain')
    await session.setCfg({ ownerName: text.slice(0, 30) })
    await reply(`✅ Owner name is now *${session.ownerName}*.`)
  }),
  ownCmd('setownernumber', 'Change the owner number', { usage: '<number>' }, async ({ args, reply, session }) => {
    const n = digits(args[0])
    if (n.length < 7) return reply('Usage: .setownernumber 254712345678')
    session.setOwnerNumber(n)
    await reply(`✅ Owner number is now *${n}*.`)
  }),
  ownCmd('setprefix', 'Change the command prefix', { usage: '<prefix>' }, async ({ args, reply, session }) => {
    const p = args[0]
    if (!p) return reply(`Prefix is *${session.prefix}*.\nUsage: .setprefix ! (1-3 characters) or .setprefix reset`)
    if (p.toLowerCase() === 'reset') {
      await session.setCfg({ prefix: '' })
      return reply(`✅ Prefix reset to *${session.prefix}*.`)
    }
    if (p.length > 3) return reply('⚠️ Use at most 3 characters.')
    await session.setCfg({ prefix: p })
    await reply(`✅ Prefix is now *${p}*. Use ${p}menu from now on.`)
  }),
  ownCmd('setbotimage', 'Set the menu picture (reply to an image or give a link)', { usage: '<image link>' }, async ({ sock, msg, args, reply, session }) => {
    if (/^https?:\/\//i.test(args[0] || '')) {
      await session.store.set('global', 'botimage', { url: args[0] })
      return reply('✅ Menu image set.')
    }
    const media = await getMedia(sock, msg, ['imageMessage'])
    if (!media) return reply('Reply to an image with .setbotimage, or use .setbotimage https://...jpg')
    if (media.buffer.length > 700_000) return reply('⚠️ That image is too big to save (max about 700 KB). Use a smaller one or give a link.')
    await session.store.set('global', 'botimage', { b64: media.buffer.toString('base64') })
    await reply('✅ Menu image set.')
  }),
  {
    name: 'botidentity', aliases: ['botinfo'], category: 'Owner', description: 'Show this bot\'s identity and settings',
    async run({ sock, reply, session, commands }) {
      await reply(
        `🤖 *${session.botName}*\nOwner: ${session.ownerName}\nOwner number: ${session.ownerNumber || '-'}\n` +
          `Linked number: ${session.linkedNumber || num(sock.user?.id)}\nPrefix: ${session.prefix}\nMode: ${session.cfg.mode}\n` +
          `Sudo users: ${session.cfg.sudo.length}\nCommands: ${new Set(commands.values()).size}`
      )
    }
  },
  {
    name: 'stats', category: 'Owner', description: 'Server and bot statistics', ownerOnly: true,
    async run({ reply, commands }) {
      const mb = (b) => `${Math.round(b / 1048576)} MB`
      const { total, connected } = sessionCounts()
      await reply(
        `📈 *Stats*\nUptime: ${formatUptime(process.uptime())}\nBots online: ${connected}/${total}\n` +
          `Bot memory: ${mb(process.memoryUsage().rss)}\nServer RAM: ${mb(os.totalmem() - os.freemem())} / ${mb(os.totalmem())}\n` +
          `CPU cores: ${os.cpus().length}\nNode: ${process.version}\nCommands: ${new Set(commands.values()).size}`
      )
    }
  },

  // ------------------------------------------------------------------ sudo
  {
    name: 'addsudo', category: 'Owner', description: 'Give a user owner-level access', usage: '@user',
    async run({ msg, args, reply, session, isRealOwner }) {
      if (!isRealOwner) return reply('⛔ Only the real owner can manage sudo users.')
      const n = num(getTargets(msg)[0] || '') || digits(args[0])
      if (n.length < 7) return reply('Mention, reply to, or give a number: .addsudo 254712345678')
      if (session.cfg.sudo.includes(n)) return reply('That number is already a sudo user.')
      await session.setCfg({ sudo: [...session.cfg.sudo, n] })
      await reply(`✅ ${n} is now a sudo user (can use owner commands).`)
    }
  },
  {
    name: 'removesudo', aliases: ['delsudo'], category: 'Owner', description: 'Remove a sudo user', usage: '@user',
    async run({ msg, args, reply, session, isRealOwner }) {
      if (!isRealOwner) return reply('⛔ Only the real owner can manage sudo users.')
      const n = num(getTargets(msg)[0] || '') || digits(args[0])
      if (!session.cfg.sudo.includes(n)) return reply('That number is not a sudo user.')
      await session.setCfg({ sudo: session.cfg.sudo.filter((x) => x !== n) })
      await reply(`✅ ${n} removed from sudo.`)
    }
  },
  ownCmd('listsudo', 'List sudo users', {}, async ({ reply, session }) => {
    const l = session.cfg.sudo
    await reply(l.length ? `👑 *Sudo users*\n${l.map((n, i) => `${i + 1}. ${n}`).join('\n')}` : 'No sudo users yet. Add one with .addsudo')
  }),

  // ------------------------------------------------------------------ messaging
  ownCmd('send', 'Send a message to a number', { usage: '<number> <text>' }, async ({ sock, args, reply }) => {
    const n = digits(args[0])
    const body = args.slice(1).join(' ')
    if (n.length < 7 || !body) return reply('Usage: .send 254712345678 Hello there')
    await sock.sendMessage(toJid(n), { text: body })
    await reply(`✅ Sent to +${n}.`)
  }),
  ownCmd('goodbye', 'Goodbye messages when members leave', { usage: 'on|off', groupOnly: true, adminOnly: true, ownerOnly: false },
    async ({ jid, args, reply, session }) => {
      const v = parseOnOff(args[0])
      if (v === null) return reply('Usage: .goodbye on | off')
      await session.store.set(jid, 'goodbye', v)
      await reply(v ? '✅ Goodbye messages on.' : '✅ Goodbye messages off.')
    })
]
