import { getJson, getText } from '../utils.js'

const enc = encodeURIComponent
const need = (c, u) => `Usage: .${c} ${u}`
const fail = (reply, what) => (e) => reply(`❌ Couldn't ${what}: ${e.message}`)

export default [
  { name: 'weather', category: 'Info', description: 'Weather for a city', usage: '<city>',
    async run({ reply, text }) {
      if (!text) return reply(need('weather', '<city>'))
      const t = await getText(`https://wttr.in/${enc(text)}?format=%l:+%c+%t+(feels+%f),+humidity+%h,+wind+%w`).catch(fail(reply, 'get weather'))
      if (t) await reply(`🌦 ${t.trim()}`)
    } },
  { name: 'define', aliases: ['dict'], category: 'Info', description: 'Dictionary definition', usage: '<word>',
    async run({ reply, text }) {
      if (!text) return reply(need('define', '<word>'))
      try {
        const [e] = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${enc(text.split(' ')[0])}`)
        const m = e.meanings[0]; const d = m.definitions[0]
        await reply(`📖 *${e.word}* (${m.partOfSpeech})\n${d.definition}${d.example ? `\n\n_e.g. ${d.example}_` : ''}`)
      } catch { await reply('❌ No definition found.') }
    } },
  { name: 'translate', aliases: ['tr'], category: 'Info', description: 'Translate text', usage: '<lang> <text>',
    async run({ reply, args }) {
      const [lang, ...rest] = args
      if (!lang || !rest.length) return reply('Usage: .translate sw Good morning\n(lang codes: en sw fr es de ar hi zh ...)')
      try {
        const j = await getJson(`https://api.mymemory.translated.net/get?q=${enc(rest.join(' '))}&langpair=Autodetect|${enc(lang)}`)
        await reply(`🌐 ${j.responseData.translatedText}`)
      } catch (e) { await fail(reply, 'translate')(e) }
    } },
  { name: 'wiki', aliases: ['wikipedia'], category: 'Info', description: 'Wikipedia summary', usage: '<topic>',
    async run({ reply, text }) {
      if (!text) return reply(need('wiki', '<topic>'))
      try {
        const j = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${enc(text.replace(/ /g, '_'))}`)
        await reply(`📚 *${j.title}*\n\n${j.extract}\n\n${j.content_urls?.desktop?.page ?? ''}`)
      } catch { await reply('❌ No article found. Try a more exact title.') }
    } },
  { name: 'ip', category: 'Info', description: 'Look up a public IP address', usage: '<ip>',
    async run({ reply, args }) {
      if (!args[0]) return reply(need('ip', '<ip>'))
      try {
        const j = await getJson(`https://ipwho.is/${enc(args[0])}`)
        if (!j.success) return reply('❌ Invalid IP.')
        await reply(`🌍 ${j.ip}\nCountry: ${j.country}\nRegion: ${j.region}\nCity: ${j.city}\nISP: ${j.connection?.isp ?? '—'}`)
      } catch (e) { await fail(reply, 'look up IP')(e) }
    } },
  { name: 'crypto', category: 'Info', description: 'Crypto price in USD', usage: '<coin id, e.g. bitcoin>',
    async run({ reply, args }) {
      const id = (args[0] || 'bitcoin').toLowerCase()
      try {
        const j = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${enc(id)}&vs_currencies=usd&include_24hr_change=true`)
        if (!j[id]) return reply('❌ Unknown coin id (use names like bitcoin, ethereum, solana).')
        await reply(`🪙 *${id}*: $${j[id].usd.toLocaleString()}\n24h: ${j[id].usd_24h_change?.toFixed(2)}%`)
      } catch (e) { await fail(reply, 'get price')(e) }
    } },
  { name: 'currency', aliases: ['cur'], category: 'Info', description: 'Convert currency', usage: '<amount> <from> <to>',
    async run({ reply, args }) {
      const amt = parseFloat(args[0]); const from = (args[1] || '').toUpperCase(); const to = (args[2] || '').toUpperCase()
      if (isNaN(amt) || !from || !to) return reply('Usage: .currency 100 usd kes')
      try {
        const j = await getJson(`https://open.er-api.com/v6/latest/${from}`)
        if (!j.rates?.[to]) return reply('❌ Unknown currency code.')
        await reply(`💱 ${amt} ${from} = *${(amt * j.rates[to]).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${to}*`)
      } catch (e) { await fail(reply, 'convert')(e) }
    } },
  { name: 'github', aliases: ['gh'], category: 'Info', description: 'GitHub user info', usage: '<username>',
    async run({ reply, args }) {
      if (!args[0]) return reply(need('github', '<username>'))
      try {
        const u = await getJson(`https://api.github.com/users/${enc(args[0])}`)
        await reply(`🐙 *${u.name ?? u.login}* (@${u.login})\n${u.bio ?? ''}\nRepos: ${u.public_repos} | Followers: ${u.followers}\n${u.html_url}`)
      } catch { await reply('❌ User not found.') }
    } },
  { name: 'npm', category: 'Info', description: 'npm package info', usage: '<package>',
    async run({ reply, args }) {
      if (!args[0]) return reply(need('npm', '<package>'))
      try {
        const p = await getJson(`https://registry.npmjs.org/${enc(args[0])}/latest`)
        await reply(`📦 *${p.name}* v${p.version}\n${p.description ?? ''}\nLicense: ${p.license ?? '—'}\nhttps://www.npmjs.com/package/${p.name}`)
      } catch { await reply('❌ Package not found.') }
    } },
  { name: 'country', category: 'Info', description: 'Country facts', usage: '<name>',
    async run({ reply, text }) {
      if (!text) return reply(need('country', '<name>'))
      try {
        const [c] = await getJson(`https://restcountries.com/v3.1/name/${enc(text)}?fields=name,capital,population,region,flag,currencies`)
        await reply(`${c.flag} *${c.name.common}*\nCapital: ${c.capital?.[0] ?? '—'}\nRegion: ${c.region}\nPopulation: ${c.population.toLocaleString()}\nCurrency: ${Object.keys(c.currencies ?? {}).join(', ')}`)
      } catch { await reply('❌ Country not found.') }
    } },
  { name: 'meme', category: 'Info', description: 'Random meme',
    async run({ sock, jid, msg, reply }) {
      try {
        const m = await getJson('https://meme-api.com/gimme')
        await sock.sendMessage(jid, { image: { url: m.url }, caption: m.title }, { quoted: msg })
      } catch (e) { await fail(reply, 'fetch a meme')(e) }
    } },
  { name: 'cat', category: 'Info', description: 'Random cat picture',
    async run({ sock, jid, msg, reply }) {
      try { await sock.sendMessage(jid, { image: { url: `https://cataas.com/cat?t=${Date.now()}` }, caption: '🐱' }, { quoted: msg }) }
      catch (e) { await fail(reply, 'fetch a cat')(e) }
    } },
  { name: 'dog', category: 'Info', description: 'Random dog picture',
    async run({ sock, jid, msg, reply }) {
      try {
        const j = await getJson('https://dog.ceo/api/breeds/image/random')
        await sock.sendMessage(jid, { image: { url: j.message }, caption: '🐶' }, { quoted: msg })
      } catch (e) { await fail(reply, 'fetch a dog')(e) }
    } },
  { name: 'advice', category: 'Info', description: 'Random advice',
    async run({ reply }) {
      try { await reply(`💡 ${(await getJson('https://api.adviceslip.com/advice')).slip.advice}`) }
      catch (e) { await fail(reply, 'get advice')(e) }
    } },
  { name: 'qr', category: 'Info', description: 'Make a QR code', usage: '<text or link>',
    async run({ sock, jid, msg, text, reply }) {
      if (!text) return reply(need('qr', '<text or link>'))
      await sock.sendMessage(jid, { image: { url: `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${enc(text)}` }, caption: '✅ QR code' }, { quoted: msg })
    } },
  { name: 'shorten', aliases: ['short'], category: 'Info', description: 'Shorten a link', usage: '<url>',
    async run({ reply, args }) {
      if (!args[0]) return reply(need('shorten', '<url>'))
      try { await reply(`🔗 ${(await getText(`https://is.gd/create.php?format=simple&url=${enc(args[0])}`)).trim()}`) }
      catch (e) { await fail(reply, 'shorten')(e) }
    } },
  { name: 'screenshot', aliases: ['ss'], category: 'Info', description: 'Screenshot of a website', usage: '<url>',
    async run({ sock, jid, msg, args, reply }) {
      if (!args[0]) return reply(need('screenshot', '<url>'))
      const u = /^https?:\/\//i.test(args[0]) ? args[0] : `https://${args[0]}`
      await sock.sendMessage(jid, { image: { url: `https://image.thum.io/get/width/1280/${u}` }, caption: u }, { quoted: msg })
    } }
]
