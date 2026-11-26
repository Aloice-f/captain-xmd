
import os from 'node:os'
import { sendBanner } from '../utils.js'

// ---------------------------------------------------------------- small-caps text
const SMALL = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ғ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ',
  n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 's', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
}

const sc = (str) =>
  [...String(str).toLowerCase()]
    .map((ch) => SMALL[ch] ?? ch)
    .join('')

// ---------------------------------------------------------------- menu sections
const MAIN = [
  {
    title: 'owner',
    cats: ['Owner'],
    names: [
      'report', 'alive', 'antidelete', 'antionce', 'vv', 'vv2',
      'autolike', 'creact', 'setreact', 'reactlist', 'autoread',
      'autoview', 'block', 'unblock', 'checkban', 'channelban',
      'follow', 'unfollow', 'gstatus2', 'gcban', 'gclist',
      'gcstatus', 'leave', 'mode', 'release', 'send', 'setbotname',
      'setownername', 'setbotimage', 'setownernumber',
      'botidentity', 'setprefix', 'sim', 'stats', 'addsudo',
      'removesudo', 'listsudo', 'count', 'welcome', 'goodbye'
    ]
  },
  {
    title: 'group',
    cats: ['Group'],
    names: [
      'requestlist', 'acceptall', 'rejectall', 'autosreact',
      'delete', 'dismissall', 'gname', 'gdesc', 'gdp', 'ginfo',
      'glink', 'resetlink', 'admins', 'poll', 'joinapproval',
      'disappearing', 'hidetag', 'kickall', 'mute', 'unmute',
      'tagall'
    ]
  },
  {
    title: 'ai',
    cats: ['AI'],
    names: [
      'gpt', 'deepseek', 'gemini', 'claude', 'copilot',
      'blackbox', 'texttoimage', 'islamai'
    ]
  },
  {
    title: 'admin',
    cats: ['Admin', 'Auto'],
    names: [
      'alwaysonline', 'anticall', 'checkbotadmin', 'antilink',
      'antistatus', 'antisticker', 'antitag', 'autorecord',
      'autotype', 'kick', 'promote', 'demote', 'jail', 'unjail'
    ]
  }
]

const EXTRA_ORDER = [
  'General', 'Status', 'Fun', 'Pranks', 'Text', 'Info',
  'Download', 'Tools'
]

const PLATFORMS = {
  linux: '𝙇𝙄𝙉𝙐𝙓',
  win32: '𝙒𝙄𝙉𝘿𝙊𝙒𝙎',
  darwin: '𝙈𝘼𝘾',
  android: '𝘼𝙉𝘿𝙍𝙊𝙄𝘿'
}

// ---------------------------------------------------------------- sections builder
function buildSections(commands) {
  const unique = [...new Set(commands.values())]
  const shown = new Set()

  const sections = MAIN.map((s) => {
    const names = s.names.filter((n) => commands.has(n))
    names.forEach((n) => shown.add(commands.get(n)))

    return {
      title: s.title,
      cats: s.cats,
      names
    }
  })

  const leftovers = unique
    .filter((c) => !shown.has(c))
    .sort((a, b) => a.name.localeCompare(b.name))

  const extras = new Map()

  for (const c of leftovers) {
    const cat = c.category ?? 'General'
    const home = sections.find((s) => s.cats.includes(cat))

    if (home) {
      home.names.push(c.name)
    } else {
      if (!extras.has(cat)) extras.set(cat, [])
      extras.get(cat).push(c.name)
    }
  }

  const rest = [...extras.keys()].sort((a, b) => {
    const ia = EXTRA_ORDER.indexOf(a)
    const ib = EXTRA_ORDER.indexOf(b)

    return (
      (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) ||
      a.localeCompare(b)
    )
  })

  for (const cat of rest) {
    sections.push({
      title: cat.toLowerCase(),
      names: extras.get(cat)
    })
  }

  return sections.filter((s) => s.names.length)
}

// ---------------------------------------------------------------- section text
const sectionText = ({ title, names }) =>
  `╭─⧼ \`${sc(title)}\` ⧽─┈≽\n` +
  names
    .map((n, i) =>
      `*│✾${i === names.length - 1 ? '└' : '├'}─⋄* *${sc(n)}*`
    )
    .join('\n') +
  `\n╰──────────┈⊷`

// ---------------------------------------------------------------- menu builder
function fullMenu({ commands, session, only }) {
  const total = new Set(commands.values()).size

  const botName = /^captain-xmd$/i.test(session?.botName ?? '')
    ? 'Captain-xᴍᴅ'
    : (session?.botName || 'Captain XMD')

  const owner = session?.ownerName || 'Captain'
  const mode = session?.cfg?.mode === 'private'
    ? '𝙋𝙍𝙄𝙑𝘼𝙏𝙀'
    : '𝙋𝙐𝘽𝙇𝙄𝘾'

  const platform = PLATFORMS[os.platform()] ?? os.platform().toUpperCase()

  const header =
    `*╭─═══════════════⊷❍*\n` +
    `*┋ ${sc('bot name')}: ${botName}*\n` +
    `*┋ ${sc('commands')}: ${total}*\n` +
    `*┋ ${sc('platform')}: ${platform}*\n` +
    `*┋ ${sc('owner')}: ${owner}*\n` +
    `*┋ ${sc('mode')}: ${mode}*\n` +
    `*╰══════════════════⍟*`

  const sections = buildSections(commands)
    .filter((s) => !only || s.title === only)

  const footer =
    `> 𝐏ᴏᴡᴇʀᴇᴅ 𝐁ʏ ${owner.charAt(0).toUpperCase()}${owner.slice(1)}`

  return (
    `${header}\n` +
    `${sections.map(sectionText).join('\n')}\n` +
    `${footer}`
  )
}

// ---------------------------------------------------------------- command
export default {
  name: 'menu',
  aliases: ['help', 'commands', 'allmenu', 'all', 'list'],
  category: 'General',
  description: 'Show the command menu',

  async run({ sock, jid, msg, commands, text, session }) {
    try {
      const only = String(text ?? '').trim().toLowerCase() || null

      const menu = fullMenu({
        commands,
        session: session ?? {},
        only
      })

      // Send the menu
      try {
        await sendBanner(
          sock,
          jid,
          menu,
          { quoted: msg },
          session
        )
      } catch (bannerError) {
        console.error('[MENU-BANNER-ERROR]', bannerError)

        // Fallback if the banner sender fails
        await sock.sendMessage(jid, {
          text: menu
        }, { quoted: msg })
      }

      // Community buttons
      try {
        await sock.sendMessage(jid, {
          text: '╭─〔 ☠ CAPTAIN CYBER ACCESS ☠ 〕─╮\n\n' +
            '⌁ CONNECTION ESTABLISHED\n' +
            '⌁ SELECT YOUR ACCESS POINT\n\n' +
            '╰───────────────⊷',
          footer: 'CAPTAIN-XMD // CYBER LAB',
          templateButtons: [
            {
              index: 1,
              urlButton: {
                displayText: '⛓ GROUP ACCESS',
                url: 'https://chat.whatsapp.com/LpHONqMdieVAqj42x2mIKi'
              }
            },
            {
              index: 2,
              urlButton: {
                displayText: '⌬ CHANNEL ACCESS',
                url: 'https://whatsapp.com/channel/0029VbBwDHQG8l5I2Tjvv51G'
              }
            }
          ]
        }, { quoted: msg })
      } catch (buttonError) {
        console.error('[MENU-BUTTON-ERROR]', buttonError)

        // Text fallback if WhatsApp rejects the buttons
        await sock.sendMessage(jid, {
          text:
            '☠ CAPTAIN CYBER ACCESS ☠\n\n' +
            '⛓ GROUP: https://chat.whatsapp.com/LpHONqMdieVAqj42x2mIKi\n\n' +
            '⌬ CHANNEL: https://whatsapp.com/channel/0029VbBwDHQG8l5I2Tjvv51G'
        }, { quoted: msg })
      }

    } catch (error) {
      console.error('[MENU-COMMAND-ERROR]', error)

      await sock.sendMessage(jid, {
        text: '❌ Menu failed to load. Check the bot terminal for [MENU-COMMAND-ERROR].'
      }, { quoted: msg })
    }
  }
}
