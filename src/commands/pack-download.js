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

async function jamendoSearch(query) {
  const clientId = process.env.JAMENDO_CLIENT_ID

  if (!clientId) {
    throw new Error(
      'Jamendo is not configured. Set JAMENDO_CLIENT_ID in Render environment variables.'
    )
  }

  const api = new URL('https://api.jamendo.com/v3.0/tracks/')
  api.searchParams.set('client_id', clientId)
  api.searchParams.set('format', 'json')
  api.searchParams.set('limit', '20')
  api.searchParams.set('search', query)
  api.searchParams.set('audioformat', 'mp31')
  api.searchParams.set('audiodlformat', 'mp32')
  api.searchParams.set('include', 'musicinfo')

  const response = await fetch(api)

  if (!response.ok) {
    throw new Error(`Jamendo search failed (${response.status}).`)
  }

  const json = await response.json()

  if (json?.headers?.status !== 'success') {
    throw new Error(json?.headers?.error_message || 'Jamendo search failed.')
  }

  return json.results || []
}

async function jamendoDownload(track) {
  if (!track.audiodownload_allowed) {
    throw new Error('This track is not permitted for download. Try another result.')
  }

  const clientId = process.env.JAMENDO_CLIENT_ID

  if (!clientId || !track.id) {
    throw new Error('Jamendo download is missing its client ID or track ID.')
  }

  // Prefer the download URL returned directly by Jamendo.
  // Use the official file endpoint only if the search did not return one.
  let downloadUrl = track.audiodownload

  if (!downloadUrl) {
    const fileUrl = new URL('https://api.jamendo.com/v3.0/tracks/file/')
    fileUrl.searchParams.set('client_id', clientId)
    fileUrl.searchParams.set('id', String(track.id))
    fileUrl.searchParams.set('audioformat', 'mp32')
    fileUrl.searchParams.set('action', 'download')
    downloadUrl = fileUrl.toString()
  }

  if (!downloadUrl.startsWith('https://')) {
    throw new Error('Jamendo returned an invalid download URL.')
  }

  const response = await fetch(downloadUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Captain-XMD Music Downloader'
    }
  })

  if (!response.ok) {
    throw new Error(`Audio download failed (${response.status}).`)
  }

  if (!response.body) {
    throw new Error('Jamendo returned an empty audio response.')
  }

  const maxBytes = MAX_AUDIO_MB * 1_000_000
  const chunks = []
  let total = 0

  for await (const chunk of response.body) {
    total += chunk.length

    if (total > maxBytes) {
      throw new Error(`Audio exceeds ${MAX_AUDIO_MB} MB limit.`)
    }

    chunks.push(chunk)
  }

  if (!total) {
    throw new Error('Downloaded audio is empty.')
  }

  const buffer = Buffer.concat(chunks)
  const contentType = (response.headers.get('content-type') || '').toLowerCase()

  const isMp3 =
    buffer.length > 3 &&
    (buffer.subarray(0, 3).toString() === 'ID3' ||
      (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0))

  if (!contentType.includes('audio') && !isMp3) {
    throw new Error(
      `Jamendo returned non-audio data (${contentType || 'unknown type'}).`
    )
  }

  if (!isMp3) {
    throw new Error('The returned file is not a valid MP3 file.')
  }

  return buffer
}

function audioCmd(name, aliases = [], desc) {
  return {
    name,
    aliases,
    category: 'Download',
    description: desc,
    usage: '<song name>',

    async run({ sock, jid, msg, text, reply }) {
      if (!text) return reply(`Usage: .${name} artist song title`)

      try {
        const results = await jamendoSearch(text)

        // Only select a track whose artist permits downloading.
        const track = results.find(
          (item) => item.audiodownload_allowed && item.audiodownload
        )

        if (!track) {
          return reply(
            '❌ No permitted downloadable track was found for that search. Try another song or artist.'
          )
        }

        const seconds = Number(track.duration || 0)

        if (seconds > 20 * 60) {
          return reply('❌ That track is longer than 20 minutes.')
        }

        const title = `${track.name} — ${track.artist_name}`

        await sendBanner(
          sock,
          jid,
          `🎵 *${title}*\n${fmtDur(seconds)} • Jamendo\n\n⬇️ _Downloading MP3..._`,
          { quoted: msg }
        ).catch(() => {})

        const audio = await jamendoDownload(track)

        await sock.sendMessage(
          jid,
          {
            audio,
            mimetype: 'audio/mpeg',
            fileName: `${safeFilename(track.name)}.mp3`,
            ptt: false
          },
          { quoted: msg }
        )
      } catch (e) {
        await reply(`❌ ${e.message}`)
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
      if (!text) return reply(`Usage: .${name} funny cats`)

      try {
        const v = await resolveVideo(text)

        if (v.seconds > 10 * 60) {
          return reply('❌ That is longer than 10 minutes.')
        }

        await reply(`🎬 *${v.title}*\n_Downloading..._`)
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
            { video, caption: v.title, mimetype: 'video/mp4' },
            { quoted: msg }
          )
        }
      } catch (e) {
        await reply(`❌ ${e.message}${YT_HINT}`)
      }
    }
  }
}

async function tikwm(url) {
  const j = await getJson(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`)

  if (j.code !== 0 || !j.data) {
    throw new Error(j.msg || 'Could not read that TikTok link.')
  }

  return j.data
}

export default [
  audioCmd('play', ['song'], 'Download a permitted song as MP3'),
  audioCmd('ytmp3', [], 'Search and download permitted audio'),
  videoCmd('video', [], 'Download a YouTube video'),
  videoCmd('ytmp4', [], 'YouTube link/name to video'),

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
                `${i + 1}. *${v.title}*\n   ${v.author.name} • ${v.timestamp}\n   ${v.url}`
            )
            .join('\n\n')
        )
      } catch (e) {
        await reply(`❌ ${e.message}`)
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
        const d = await tikwm(args[0])

        await sock.sendMessage(
          jid,
          { video: { url: d.play }, caption: d.title || 'TikTok' },
          { quoted: msg }
        )
      } catch (e) {
        await reply(`❌ ${e.message}`)
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
        const d = await tikwm(args[0])

        await sock.sendMessage(
          jid,
          { audio: { url: d.music }, mimetype: 'audio/mpeg' },
          { quoted: msg }
        )
      } catch (e) {
        await reply(`❌ ${e.message}`)
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
      if (!args[0]) return reply('Usage: .fetch https://example.com/file.pdf')

      try {
        await assertPublicUrl(args[0])

        const { buffer, type, url } = await getBuffer(args[0], 50)
        const name = decodeURIComponent(url.pathname.split('/').pop() || 'file') || 'file'

        if (type.startsWith('image/')) {
          await sock.sendMessage(jid, { image: buffer }, { quoted: msg })
        } else if (type.startsWith('video/') && buffer.length < 16e6) {
          await sock.sendMessage(jid, { video: buffer }, { quoted: msg })
        } else if (type.startsWith('audio/')) {
          await sock.sendMessage(jid, { audio: buffer, mimetype: type }, { quoted: msg })
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
