import { assertPublicUrl, getBuffer, getJson, sendBanner } from '../utils.js'

const YT_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i
const MAX_AUDIO_MB = 40
const MAX_VIDEO_MB = 60

const fmtDur = (s) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// Reusable downloader instance
let ytInstance

async function getYtdl() {
  if (!ytInstance) {
    const { Ytdl } = await import('@distube/ytdl-core')
    ytInstance = new Ytdl()
  }

  return ytInstance
}

async function resolveVideo(query) {
  const yts = (await import('yt-search')).default
  const match = query.match(YT_RE)

  const result = match
    ? await yts({ videoId: match[1] })
    : (await yts(query)).videos?.[0]

  if (!result) {
    throw new Error('No search results found.')
  }

  return {
    title: result.title,
    url: result.url ?? `https://youtu.be/${match?.[1]}`,
    seconds: result.seconds ?? result.duration?.seconds ?? 0,
    author: result.author?.name ?? '',
    thumb: result.thumbnail ?? result.image
  }
}

async function streamToBuffer(stream, maxMB) {
  const chunks = []
  let size = 0

  for await (const chunk of stream) {
    size += chunk.length

    if (size > maxMB * 1_000_000) {
      stream.destroy?.()
      throw new Error(`Download exceeded ${maxMB} MB size limit.`)
    }

    chunks.push(chunk)
  }

  if (!size) {
    throw new Error('The download returned an empty file.')
  }

  return Buffer.concat(chunks)
}

async function ytBuffer(url, kind) {
  const { Ytdl, Quality } = await import('@distube/ytdl-core')
  const yt = await getYtdl()

  const info = await yt.getInfo(url)

  const options = kind === 'audio'
    ? {
        quality: Quality.HighestAudio,
        filter: {
          hasAudio: true,
          hasVideo: false
        }
      }
    : {
        quality: Quality.Highest,
        filter: {
          hasAudio: true,
          hasVideo: true
        }
      }

  const stream = yt.download(info, options)

  return streamToBuffer(
    stream,
    kind === 'audio' ? MAX_AUDIO_MB : MAX_VIDEO_MB
  )
}

function friendlyYtError(error) {
  const raw = String(
    error?.message || error || 'Unknown download error'
  )

  if (
    /confirm.*not.*bot|bot.?check|sign in to confirm|not a bot/i.test(raw)
  ) {
    return 'YouTube is asking for verification and is blocking this server. Try again later, or use a source that permits audio downloads.'
  }

  if (/429|too many requests|rate.?limit/i.test(raw)) {
    return 'YouTube rate-limited the server. Please wait before trying again.'
  }

  if (/403|forbidden/i.test(raw)) {
    return 'YouTube denied this download request (403). This can be a server/IP restriction.'
  }

  if (/timed out|timeout|etimedout/i.test(raw)) {
    return 'The download timed out. Please try again later.'
  }

  return raw.slice(0, 400)
}

function audioCmd(name, aliases = [], desc) {
  return {
    name,
    aliases,
    category: 'Download',
    description: desc,
    usage: '<song name or YouTube link>',

    async run({ sock, jid, msg, text, reply }) {
      if (!text) {
        return reply(`Usage: .${name} Burna Boy Last Last`)
      }

      try {
        const video = await resolveVideo(text)

        if (video.seconds > 20 * 60) {
          return reply('❌ That is longer than 20 minutes.')
        }

        await sendBanner(
          sock,
          jid,
          `🎵 *${video.title}*\n${video.author} • ${fmtDur(video.seconds)}\n\n_Downloading..._`,
          { quoted: msg }
        ).catch(() => {})

        const audio = await ytBuffer(video.url, 'audio')

        await sock.sendMessage(
          jid,
          {
            audio,
            mimetype: 'audio/webm',
            fileName: `${video.title}.webm`
          },
          { quoted: msg }
        )
      } catch (error) {
        await reply(
          `❌ ${friendlyYtError(error)}\n\nYouTube downloads may be unavailable from cloud hosting when YouTube blocks the server.`
        )
      }
    }
  }
}

function videoCmd(name, aliases = [], desc) {
  return {
    name,
    aliases,
    category: 'Download',
    description: desc,
    usage: '<video name or YouTube link>',

    async run({ sock, jid, msg, text, reply }) {
      if (!text) {
        return reply(`Usage: .${name} funny cats`)
      }

      try {
        const videoInfo = await resolveVideo(text)

        if (videoInfo.seconds > 10 * 60) {
          return reply('❌ That is longer than 10 minutes.')
        }

        await reply(`🎬 *${videoInfo.title}*\n_Downloading..._`)

        const video = await ytBuffer(videoInfo.url, 'video')

        if (video.length > 16_000_000) {
          await sock.sendMessage(
            jid,
            {
              document: video,
              mimetype: 'video/mp4',
              fileName: `${videoInfo.title}.mp4`
            },
            { quoted: msg }
          )
        } else {
          await sock.sendMessage(
            jid,
            {
              video,
              caption: videoInfo.title,
              mimetype: 'video/mp4'
            },
            { quoted: msg }
          )
        }
      } catch (error) {
        await reply(
          `❌ ${friendlyYtError(error)}\n\nYouTube downloads may be unavailable from cloud hosting when YouTube blocks the server.`
        )
      }
    }
  }
}

async function tikwm(url) {
  const json = await getJson(
    `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`
  )

  if (json.code !== 0 || !json.data) {
    throw new Error(json.msg || 'Could not read that TikTok link.')
  }

  return json.data
}

export default [
  audioCmd('play', ['song'], 'Download a song as audio'),
  audioCmd('ytmp3', [], 'YouTube link/name to audio'),
  videoCmd('video', [], 'Download a YouTube video'),
  videoCmd('ytmp4', [], 'YouTube link/name to video'),

  {
    name: 'yts',
    aliases: ['ytsearch'],
    category: 'Download',
    description: 'Search YouTube',
    usage: '<query>',

    async run({ reply, text }) {
      if (!text) {
        return reply('Usage: .yts lofi beats')
      }

      try {
        const yts = (await import('yt-search')).default
        const list = (await yts(text)).videos.slice(0, 6)

        if (!list.length) {
          return reply('❌ No results.')
        }

        await reply(
          list
            .map(
              (v, i) =>
                `${i + 1}. *${v.title}*\n   ${v.author.name} • ${v.timestamp}\n   ${v.url}`
            )
            .join('\n\n')
        )
      } catch (error) {
        await reply(`❌ ${friendlyYtError(error)}`)
      }
    }
  },

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
        const data = await tikwm(args[0])

        await sock.sendMessage(
          jid,
          {
            video: { url: data.play },
            caption: data.title || 'TikTok'
          },
          { quoted: msg }
        )
      } catch (error) {
        await reply(`❌ ${error.message}`)
      }
    }
  },

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
        const data = await tikwm(args[0])

        await sock.sendMessage(
          jid,
          {
            audio: { url: data.music },
            mimetype: 'audio/mpeg'
          },
          { quoted: msg }
        )
      } catch (error) {
        await reply(`❌ ${error.message}`)
      }
    }
  },

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

        const fileName =
          decodeURIComponent(url.pathname.split('/').pop() || 'file') || 'file'

        if (type.startsWith('image/')) {
          await sock.sendMessage(
            jid,
            { image: buffer },
            { quoted: msg }
          )
        } else if (
          type.startsWith('video/') &&
          buffer.length < 16_000_000
        ) {
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
              fileName
            },
            { quoted: msg }
          )
        }
      } catch (error) {
        await reply(`❌ ${error.message}`)
      }
    }
  }
]
