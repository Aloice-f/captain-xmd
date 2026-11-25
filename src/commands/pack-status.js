import { getMedia, getTargets, num } from '../utils.js'
import { audience, contentOf, statusesOf, summary, STATUS_COLORS } from '../statuses.js'

const digits = (s) => String(s ?? '').replace(/\D/g, '')
const parseOnOff = (v) => {
  const x = (v || '').toLowerCase()
  if (['on', 'true', 'yes', 'enable'].includes(x)) return true
  if (['off', 'false', 'no', 'disable'].includes(x)) return false
  return null
}
const ownCmd = (name, description, extra, run) => ({ name, category: 'Status', description, ownerOnly: true, ...extra, run })
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)]
const ago = (t) => {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000))
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`
}

/** Number from a mention, a replied-to message, or the first argument. */
const targetNumber = (msg, args) => {
  const t = getTargets(msg)[0]
  if (t) return num(t)
  const d = digits(args[0])
  return d.length >= 7 ? d : ''
}

/** If the owner replied to a status, return what the quoted message is. */
const quotedInfo = (msg) => {
  const m = msg.message ?? {}
  const inner = m.ephemeralMessage?.message ?? m
  return (inner.extendedTextMessage || inner.imageMessage || inner.videoMessage || {}).contextInfo
}

export default [
  // ------------------------------------------------------------------ auto view / like
  ownCmd('autolikestatus', 'Turn automatic status reactions on or off', { aliases: ['autostatuslike'], usage: 'on|off' },
    async ({ args, reply, session, prefix }) => {
      const v = parseOnOff(args[0])
      if (v === null) return reply(`Auto like status is currently *${session.cfg.autolike ? 'ON' : 'OFF'}*.\nUsage: ${prefix}autolikestatus on | off\n(It reacts with ${session.cfg.statusEmoji || 'random emojis from .reactlist'}. Works best together with ${prefix}autoviewstatus on.)`)
      await session.setCfg({ autolike: v })
      await reply(v ? `❤️ Auto like status is *ON*. I will react with ${session.cfg.statusEmoji || 'your reaction emojis'}.` : '❤️ Auto like status is *OFF*.')
    }),

  ownCmd('setstatusemoji', 'Set the emoji used to react to statuses', { usage: '💚' },
    async ({ args, reply, session, prefix }) => {
      const e = args[0]
      if (!e) return reply(`Current status emoji: ${session.cfg.statusEmoji || '(random from .reactlist)'}\nUsage: ${prefix}setstatusemoji 💚\nUse ${prefix}setstatusemoji reset to go back to random emojis.`)
      if (e.toLowerCase() === 'reset') {
        await session.setCfg({ statusEmoji: '' })
        return reply('✅ Status emoji reset. I will pick random emojis again.')
      }
      if (e.length > 12 || /[a-z0-9]/i.test(e)) return reply('⚠️ Send a single emoji, for example: .setstatusemoji 💚')
      await session.setCfg({ statusEmoji: e })
      await reply(`✅ I will react to statuses with ${e}.\nTurn it on with ${prefix}autolikestatus on.`)
    }),

  // ------------------------------------------------------------------ download / fetch
  ownCmd('statusdl', 'Download a status (reply to it)', { aliases: ['save'] },
    async ({ sock, msg, jid, reply, prefix }) => {
      const info = quotedInfo(msg)
      if (!info?.quotedMessage) return reply(`Reply to a status with ${prefix}statusdl (or ${prefix}save).`)
      const q = info.quotedMessage
      const text = q.conversation || q.extendedTextMessage?.text
      const media = await getMedia(sock, msg, ['imageMessage', 'videoMessage', 'audioMessage']).catch(() => null)
      if (media) {
        const caption = (q.imageMessage?.caption || q.videoMessage?.caption || '').trim()
        const content =
          media.kind === 'imageMessage' ? { image: media.buffer, caption }
          : media.kind === 'videoMessage' ? { video: media.buffer, caption }
          : { audio: media.buffer, mimetype: media.mimetype || 'audio/mp4' }
        return sock.sendMessage(jid, content, { quoted: msg })
      }
      if (text) return reply(`📝 *Status text*\n\n${text}`)
      await reply('⚠️ I could not download that status. It may have expired (statuses last 24 hours).')
    }),

  ownCmd('getstatus', "Fetch someone's current status", { usage: '@user | number' },
    async ({ sock, msg, jid, args, reply, session, prefix }) => {
      const who = targetNumber(msg, args)
      if (!who) return reply(`Usage: ${prefix}getstatus @user (or ${prefix}getstatus 254712345678)`)
      const list = statusesOf(session, who).slice(-5)
      let about = ''
      try {
        const res = await sock.fetchStatus(`${who}@s.whatsapp.net`)
        const row = Array.isArray(res) ? res[0] : res
        about = row?.status?.status ?? row?.status ?? ''
        if (typeof about !== 'string') about = ''
      } catch {
        /* privacy settings can hide the About text */
      }
      if (!list.length) {
        return reply(
          `ℹ️ I have not seen a status from @${who} in the last 24 hours.\n` +
            `_WhatsApp only lets a bot see statuses that arrive while it is connected._` +
            (about ? `\n\n💬 *About:* ${about}` : '')
        )
      }
      await reply(`📥 Sending ${list.length} status${list.length > 1 ? 'es' : ''} from @${who}${about ? `\n💬 *About:* ${about}` : ''}`)
      for (const entry of list) {
        const content = await contentOf(sock, entry).catch(() => null)
        if (content) await sock.sendMessage(jid, content, { quoted: msg })
        else await reply(`⚠️ A ${entry.type} status from ${ago(entry.at)} could not be downloaded any more.`)
      }
    }),

  ownCmd('statuslist', 'List recent statuses from your contacts', { aliases: ['statuses'] },
    async ({ reply, session, prefix }) => {
      const rows = summary(session)
      if (!rows.length) return reply('📭 No statuses seen yet. Statuses appear here after contacts post them while I am connected (kept for 24 hours).')
      const lines = rows.slice(0, 40).map(
        (r, i) => `${i + 1}. ${r.name ? `${r.name} · ` : ''}+${r.number} · ${r.count} (${[...r.types].join(', ')}) · ${ago(r.last)}`
      )
      await reply(`📋 *Recent statuses (${rows.length} contacts)*\n\n${lines.join('\n')}\n\nGet one with ${prefix}getstatus <number>`)
    }),

  // ------------------------------------------------------------------ posting
  ownCmd('setstatus', 'Post a text status', { usage: '<text>' },
    async ({ sock, text, reply, session, prefix }) => {
      if (!text) return reply(`Usage: ${prefix}setstatus Hello everyone`)
      const jids = audience(sock, session)
      await sock.sendMessage(
        'status@broadcast',
        { text: text.slice(0, 700), backgroundColor: pickOne(STATUS_COLORS), font: Math.floor(Math.random() * 5) },
        { statusJidList: jids }
      )
      await reply(postedNote(jids, prefix))
    }),

  ownCmd('poststatus', 'Post an image/video/voice note as your status (reply to it)', { usage: '[caption]', aliases: ['uploadstatus'] },
    async ({ sock, msg, text, reply, session, prefix }) => {
      const media = await getMedia(sock, msg, ['imageMessage', 'videoMessage', 'audioMessage'])
      if (!media) return reply(`Reply to an image, video or voice note with ${prefix}poststatus [caption]`)
      const jids = audience(sock, session)
      const caption = text || ''
      const content =
        media.kind === 'imageMessage' ? { image: media.buffer, caption }
        : media.kind === 'videoMessage' ? { video: media.buffer, caption }
        : { audio: media.buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true }
      await sock.sendMessage('status@broadcast', content, { statusJidList: jids })
      await reply(postedNote(jids, prefix))
    }),

  // ------------------------------------------------------------------ privacy / management
  ownCmd('statusreply', 'Auto-reply to contacts\' statuses', { usage: '<message> | on | off' },
    async ({ args, text, reply, session, prefix }) => {
      const { statusReply, statusReplyOn } = session.cfg
      if (!args.length) {
        return reply(
          `💬 Status auto-reply is *${statusReplyOn && statusReply ? 'ON' : 'OFF'}*.\nMessage: ${statusReply || '(not set)'}\n\n` +
            `Usage: ${prefix}statusreply Nice one! 🔥\n${prefix}statusreply off`
        )
      }
      const v = args.length === 1 ? parseOnOff(args[0]) : null
      if (v === false) {
        await session.setCfg({ statusReplyOn: false })
        return reply('💬 Status auto-reply is *OFF*.')
      }
      if (v === true) {
        if (!statusReply) return reply(`Set a message first: ${prefix}statusreply Nice one! 🔥`)
        await session.setCfg({ statusReplyOn: true })
        return reply('💬 Status auto-reply is *ON*.')
      }
      await session.setCfg({ statusReply: text.slice(0, 300), statusReplyOn: true })
      await reply(`✅ Status auto-reply is *ON*:\n"${text.slice(0, 300)}"\n\n_Each contact gets it at most once every 6 hours, to avoid spamming and keep your number safe._`)
    }),

  ownCmd('blockstatus', 'Hide the statuses you post with this bot from a contact', { usage: '@user | number | list' },
    async ({ msg, args, reply, session, prefix }) => {
      const blocked = session.cfg.statusBlocked ?? []
      if ((args[0] || '').toLowerCase() === 'list') {
        return reply(blocked.length ? `🚫 *Hidden from your bot statuses*\n${blocked.map((n) => `+${n}`).join('\n')}` : 'Nobody is blocked from your bot statuses.')
      }
      const who = targetNumber(msg, args)
      if (!who) return reply(`Usage: ${prefix}blockstatus @user | 254712345678 | list`)
      if (!blocked.includes(who)) await session.setCfg({ statusBlocked: [...blocked, who] })
      await reply(`🚫 +${who} will no longer see statuses posted with ${prefix}setstatus / ${prefix}poststatus.\n_This does not change your WhatsApp privacy settings for statuses posted from your phone._`)
    }),

  ownCmd('allowstatus', 'Let a contact see your bot statuses again', { usage: '@user | number | all' },
    async ({ msg, args, reply, session, prefix }) => {
      const blocked = session.cfg.statusBlocked ?? []
      if ((args[0] || '').toLowerCase() === 'all') {
        await session.setCfg({ statusBlocked: [] })
        return reply('✅ Everyone can see your bot statuses again.')
      }
      const who = targetNumber(msg, args)
      if (!who) return reply(`Usage: ${prefix}allowstatus @user | 254712345678 | all`)
      await session.setCfg({ statusBlocked: blocked.filter((n) => n !== who) })
      await reply(`✅ +${who} can see your bot statuses again.`)
    }),

  // ------------------------------------------------------------------ settings & logout
  {
    name: 'settings', aliases: ['config', 'botsettings'], category: 'Owner', description: 'Show all current bot settings', ownerOnly: true,
    async run({ reply, session, flags, prefix }) {
      const c = session.cfg
      const on = (v) => (v ? '✅ ON' : '❌ OFF')
      await reply(
        `⚙️ *${session.botName} settings*\n\n` +
          `Prefix: ${prefix}\nMode: ${c.mode}\nOwner: ${session.ownerName}\nSudo users: ${c.sudo.length}\n\n` +
          `*Status*\n` +
          `• autoviewstatus: ${on(flags.autoviewstatus)}\n` +
          `• autolikestatus: ${on(c.autolike)} (${c.statusEmoji || 'random'})\n` +
          `• statusreply: ${on(c.statusReplyOn && c.statusReply)}\n` +
          `• blocked from bot statuses: ${(c.statusBlocked ?? []).length}\n\n` +
          `*Protection*\n` +
          `• antidelete: ${on(c.antidelete)}\n• antionce: ${on(c.antionce)}\n• anticall: ${on(c.anticall)}\n\n` +
          `*Auto*\n` +
          `• autoread: ${on(c.autoread)}\n• creact: ${on(c.creact)}\n• autotyping: ${on(flags.autotyping)}\n` +
          `• autorecording: ${on(flags.autorecording)}\n• alwaysonline: ${on(flags.alwaysonline)}\n\n` +
          `Change any of them with ${prefix}<name> on|off. Full list: ${prefix}menu`
      )
    }
  },

  {
    name: 'logout', aliases: ['unlinkme'], category: 'Owner', description: 'Log this bot out and remove your data from the server',
    usage: 'confirm',
    async run({ args, reply, session, isRealOwner, prefix }) {
      if (!isRealOwner) return reply('⛔ Only the number that owns this bot can log it out.')
      if ((args[0] || '').toLowerCase() !== 'confirm') {
        return reply(
          `⚠️ This will log the bot out of WhatsApp and delete your session and settings from the server. ` +
            `You will need to link again on the website if you want it back.\n\nType *${prefix}logout confirm* to continue.`
        )
      }
      await session.logoutAndForget()
    }
  }
]

function postedNote(jids, prefix) {
  const others = jids.length - 1
  return others > 0
    ? `✅ Status posted to ${others} contact${others > 1 ? 's' : ''}.`
    : `⚠️ Status posted, but I do not know any of your contacts yet, so only you can see it.\n` +
        `_I learn contacts when they message you or post a status while I am connected._`
}
