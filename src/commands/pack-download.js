import { assertPublicUrl, getBuffer, getJson, sendBanner } from '../utils.js'

const YT_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i
const MAX_AUDIO_MB = 40
const MAX_VIDEO_MB = 60

const fmtDur = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function safeFilename(name) {
  return String(name || 'audio')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .trim()
    .slice(0, 100) || 'audio'
}

async function resolveVideo(query) {
  const yts = (await import('yt-search')).default
  const m = query.match(YT_RE)
  const res = m ? await yts({ videoId: m[1] }) : (await yts(query)).videos[0]

  if (!res) throw new Error('No results found.')

  return {
    title: res.title,
    url: res.url ?? `https://youtu.be/${m[1]}`,
    seconds: res.seconds ?? res.duration?.seconds ?? 0,
    author: res.author?.name ?? '',
    thumb: res.thumbnail ?? res.image
  }
}

async function streamToBuffer(stream, maxMB) {
  const chunks = []
  let size = 0

  for await (const c of stream) {
    size += c.length

    if (size > maxMB * 1e6) {
      stream.destroy()
      throw new Error(`File is bigger than ${maxMB}MB.`)
    }

    chunks.push(c)
  }

  return Buffer.concat(chunks)
}

async function ytBuffer(url, kind) {
  const ytdl = (await import('@distube/ytdl-core')).default
  const info = await ytdl.getInfo(url)

  const format =
    kind === 'audio'
      ? ytdl.chooseFormat(info.formats, {
          quality: 'highestaudio',
          filter: (f) => f.container === 'mp4' && f.hasAudio && !f.hasVideo
        })
      : ytdl.chooseFormat(info.formats, {
          quality: 'highest',
          filter: (f) => f.container === 'mp4' && f.hasAudio && f.hasVideo
        })

  return streamToBuffer(
    ytdl.downloadFromInfo(info, { format }),
    kind === 'audio' ? MAX_AUDIO_MB : MAX_VIDEO_MB
  )
}

const YT_HINT =
  '\n\nYouTube often blocks downloads from cloud servers (like Render). If this keeps failing it is YouTube, not the bot.'

// ==========================================
// TUBIDY SEARCH
// ==========================================

function tubidySearchCmd(name, aliases = []) {
  return {
    name,
    aliases,
    category: 'Download',
    description: 'Search music on Tubidy',
    usage: '<song name>',

    async run({ reply, text }) {
      if (!text) {
        return reply(`Usage: .${name} artist song title`)
      }

      const query = text.trim()

      const searchUrl =
        `https://www.google.com/search?q=${encodeURIComponent('Tubidy ' + query)}`

      await reply(
        `🎵 *CAPTAIN XMD MUSIC SEARCH*\n\n` +
        `🔎 *Song:* ${query}\n\n` +
        `🌐 *Search Tubidy:*\n${searchUrl}\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `_Music search generated successfully._`
      )
    }
  }
}

// ==========================================
// VIDEO COMMANDS
// ==========================================

function videoCmd(name, aliases = [], desc) {
  return {
    name,
    aliases,
    category: 'Download',
    description: desc,
    usage: '<video name or YouTube link>',

    async run({ sock, jid, msg, text, reply }) {
      if (!text) return reply(`Usage: .${name} funny cats`)

      try {
        const v = await resolveVideo(text)

        if (v.seconds > 10 * 60) {
          return reply('❌ That is longer than 10 minutes.')
        }

        await reply(`🎬 *${v.title}*\n_Downloading..._)

        const video = await ytBuffer(v.url, 'video')

        if (video.length > 16e6) {
          await sock.sendMessage(
            jid,
            {
              document: video,
              mimetype: 'video/mp4',
              fileName: `${safeFilename(v.title)}.mp4`
            },
            { quoted: msg }
          )
        } else {
          await sock.sendMessage(
            jid,
            {
              video,
              caption: v.title,
              mimetype: 'video/mp4'
            },
            { quoted: msg }
          )
        }
      } catch (e) {
        await reply(`❌ ${e.message}${YT_HINT}`)
      }
    }
  }
}

// ==========================================
// TIKTOK
// ==========================================

async function tikwm(url) {
  const j = await getJson(
    `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`
  )

  if (j.code !== 0 || !j.data) {
    throw new Error(j.msg || 'Could not read that TikTok link.')
  }

  return j.data
}

// ==========================================
// COMMAND LIST
// ==========================================

export default [
  // Tubidy search commands
  tubidySearchCmd('tubidy', ['tub']),
  tubidySearchCmd('tubidymusic', ['tubmusic']),

  // Existing YouTube video commands
  videoCmd('video', [], 'Download a YouTube video'),
  videoCmd('ytmp4', [], 'YouTube link/name to video'),

  // YouTube search
  {
    name: 'yts',
    aliases: ['ytsearch'],
    category: 'Download',
    description: 'Search YouTube',
    usage: '<query>',

    async run({ reply, text }) {
      if (!text) return reply('Usage: .yts lofi beats')

      try {
        const yts = (await import('yt-search')).default
        const list = (await yts(text)).videos.slice(0, 6)

        if (!list.length) return reply('❌ No results.')

        await reply(
          list
            .map(
              (v, i) =>
                `${i + 1}. *${v.title}*\n` +
                `   ${v.author.name} • ${v.timestamp}\n` +
                `   ${v.url}`
            )
            .join('\n\n')
        )
      } catch (e) {
        await reply(`❌ ${e.message}`)
      }
    }
  },

  // TikTok video
  {
    name: 'tiktok',
    aliases: ['tt'],
    category: 'Download',
    description: 'TikTok video, no watermark',
    usage: '<link>',

    async run({ sock, jid, msg, args, reply }) {
      if (!/tiktok\.com/i.test(args[0] || '')) {
        return reply('Usage: .tiktok https://vm.tiktok.com/xxxx')
      }

      try {
        const d = await tikwm(args[0])

        await sock.sendMessage(
          jid,
          {
            video: { url: d.play },
            caption: d.title || 'TikTok'
          },
          { quoted: msg }
        )
      } catch (e) {
        await reply(`❌ ${e.message}`)
      }
    }
  },

  // TikTok audio
  {
    name: 'tiktokaudio',
    aliases: ['tta'],
    category: 'Download',
    description: 'TikTok sound as audio',
    usage: '<link>',

    async run({ sock, jid, msg, args, reply }) {
      if (!/tiktok\.com/i.test(args[0] || '')) {
        return reply('Usage: .tta https://vm.tiktok.com/xxxx')
      }

      try {
        const d = await tikwm(args[0])

        await sock.sendMessage(
          jid,
          {
            audio: { url: d.music },
            mimetype: 'audio/mpeg'
          },
          { quoted: msg }
        )
      } catch (e) {
        await reply(`❌ ${e.message}`)
      }
    }
  },

  // Direct file downloader
  {
    name: 'fetch',
    aliases: ['dl', 'download'],
    category: 'Download',
    description: 'Download a file from a direct link',
    usage: '<url>',

    async run({ sock, jid, msg, args, reply }) {
      if (!args[0]) {
        return reply('Usage: .fetch https://example.com/file.pdf')
      }

      try {
        await assertPublicUrl(args[0])

        const { buffer, type, url } = await getBuffer(args[0], 50)

        const name =
          decodeURIComponent(url.pathname.split('/').pop() || 'file') || 'file'

        if (type.startsWith('image/')) {
          await sock.sendMessage(
            jid,
            { image: buffer },
            { quoted: msg }
          )
        } else if (type.startsWith('video/') && buffer.length < 16e6) {
          await sock.sendMessage(
            jid,
            { video: buffer },
            { quoted: msg }
          )
        } else if (type.startsWith('audio/')) {
          await sock.sendMessage(
            jid,
            { audio: buffer, mimetype: type },
            { quoted: msg }
          )
        } else {
          await sock.sendMessage(
            jid,
            {
              document: buffer,
              mimetype: type || 'application/octet-stream',
              fileName: name
            },
            { quoted: msg }
          )
        }
      } catch (e) {
        await reply(`❌ ${e.message}`)
      }
    }
  }
]
