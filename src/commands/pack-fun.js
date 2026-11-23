import { getTargets, hashStr, num, pick, sleep, tag } from '../utils.js'

const TRUTHS = [
  "What's the most embarrassing thing you've done in public?", "What's a secret talent nobody knows you have?",
  "What was your worst haircut or outfit?", "What's the last lie you told?",
  "Who was your first crush?", "What's your biggest fear?", "What app do you waste the most time on?",
  "What's the weirdest thing you've ever eaten?", "What's one thing you'd change about yourself?"
]
const DARES = [
  "Send a voice note singing the chorus of any song.", "Change your WhatsApp status to 'I love bots' for 1 hour.",
  "Text the 5th person in your contacts 'I know your secret'.", "Do 15 push-ups and send proof.",
  "Speak in rhymes for the next 5 minutes.", "Send your most-used emoji 20 times.",
  "Write a poem about the last thing you ate.", "Let the group pick your profile picture for a day."
]
const WYR = [
  "Would you rather have unlimited data or unlimited airtime?", "Would you rather be able to fly or be invisible?",
  "Would you rather never use social media again or never watch a movie again?",
  "Would you rather have no phone for a month or no friends for a week?",
  "Would you rather speak every language or play every instrument?", "Would you rather always be 10 minutes late or 20 minutes early?"
]
const ROASTS = [
  "you're the reason shampoo bottles have instructions.", "you have the energy of a phone at 1% with no charger.",
  "your WiFi password is probably 'password123'.", "you type 'k' and call it a conversation.",
  "you're like a cloud: when you disappear, it's a beautiful day. (jokes! 😄)", "even your autocorrect gave up on you."
]
const COMPLIMENTS = [
  "you light up every chat you join. ✨", "you're smarter than you give yourself credit for.",
  "your vibe is unmatched. 🔥", "you make hard things look easy.", "you're a legend and everyone knows it. 👑",
  "the world is better with you in it. 💛"
]
const PICKUPS = [
  "Are you WiFi? Because I'm feeling a connection.", "Are you a keyboard? Because you're just my type.",
  "Do you have a map? I keep getting lost in your messages.", "Are you a bank loan? You have my interest.",
  "Is your name Google? Because you have everything I've been searching for."
]
const FACTS = [
  "Honey never spoils — edible honey was found in ancient Egyptian tombs.", "Octopuses have three hearts.",
  "Bananas are berries, but strawberries aren't.", "A day on Venus is longer than its year.",
  "Kenya's Rift Valley is part of the Great Rift that is slowly splitting Africa.",
  "Sharks have existed longer than trees.", "The first computer bug was an actual moth found in a relay in 1947."
]
const RIDDLES = [
  { q: "What has keys but can't open locks?", a: "A keyboard (or a piano)." },
  { q: "What gets wetter the more it dries?", a: "A towel." },
  { q: "What has hands but can't clap?", a: "A clock." },
  { q: "I speak without a mouth and hear without ears. What am I?", a: "An echo." },
  { q: "The more you take, the more you leave behind. What am I?", a: "Footsteps." }
]

const simple = (name, desc, list, extra = {}) => ({
  name, category: 'Fun', description: desc, ...extra,
  async run({ reply }) { await reply(typeof list === 'function' ? list() : pick(list)) }
})

const social = (name, verb, emoji) => ({
  name, category: 'Fun', description: `${name[0].toUpperCase() + name.slice(1)} someone`, usage: '@user',
  async run({ sock, jid, msg, sender, reply }) {
    const t = getTargets(msg)[0]
    if (!t) return reply(`Mention someone, e.g. .${name} @user`)
    await sock.sendMessage(jid, { text: `${emoji} ${tag(sender)} ${verb} ${tag(t)}`, mentions: [sender, t] }, { quoted: msg })
  }
})

const aimed = (name, desc, list) => ({
  name, category: 'Fun', description: desc, usage: '[@user]',
  async run({ sock, jid, msg, sender }) {
    const t = getTargets(msg)[0] || sender
    await sock.sendMessage(jid, { text: `${tag(t)}, ${pick(list)}`, mentions: [t] }, { quoted: msg })
  }
})

export default [
  simple('truth', 'Random truth question', TRUTHS, { aliases: ['tod'] }),
  simple('dare', 'Random dare', DARES),
  simple('wyr', 'Would you rather', WYR),
  simple('pickup', 'Cheesy pickup line', PICKUPS),
  simple('fact', 'Random fun fact', FACTS),
  aimed('roast', 'Light-hearted roast', ROASTS),
  aimed('compliment', 'Give a compliment', COMPLIMENTS),
  social('hug', 'hugs', '🤗'),
  social('slap', 'slaps', '👋'),
  social('pat', 'pats', '🫶'),
  {
    name: 'riddle', category: 'Fun', description: 'Riddle (answer after 15s)',
    async run({ reply }) {
      const r = pick(RIDDLES)
      await reply(`🧩 ${r.q}\n\n_Answer in 15 seconds..._`)
      await sleep(15000)
      await reply(`💡 ${r.a}`)
    }
  },
  {
    name: 'ship', aliases: ['love'], category: 'Fun', description: 'Compatibility of two people', usage: '@a @b',
    async run({ msg, text, reply, sock, jid }) {
      const m = getTargets(msg)
      let a, b, mentions = []
      if (m.length >= 2) { [a, b] = [tag(m[0]), tag(m[1])]; mentions = m.slice(0, 2) }
      else {
        const parts = text.split(/[|&,]| and /i).map((x) => x.trim()).filter(Boolean)
        if (parts.length < 2) return reply('Usage: .ship @a @b   or   .ship Anna | Brian')
        ;[a, b] = parts
      }
      const pct = hashStr([a, b].sort().join('+')) % 101
      const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10))
      await sock.sendMessage(jid, { text: `💘 ${a} + ${b}\n[${bar}] *${pct}%*`, mentions }, { quoted: msg })
    }
  },
  {
    name: 'rate', category: 'Fun', description: 'Rate anything out of 10', usage: '<thing>',
    async run({ reply, text }) {
      if (!text) return reply('Usage: .rate my cooking')
      await reply(`⭐ *${text}*: ${hashStr(text) % 11}/10`)
    }
  },
  {
    name: 'choose', aliases: ['pickone'], category: 'Fun', description: 'Pick one option', usage: 'a | b | c',
    async run({ reply, text }) {
      const opts = text.split('|').map((x) => x.trim()).filter(Boolean)
      if (opts.length < 2) return reply('Usage: .choose pizza | burger | rice')
      await reply(`🤔 I choose: *${pick(opts)}*`)
    }
  },
  {
    name: 'iq', category: 'Fun', description: 'Fake IQ test (for fun)', usage: '[@user]',
    async run({ sock, jid, msg, sender }) {
      const t = getTargets(msg)[0] || sender
      await sock.sendMessage(jid, { text: `🧠 ${tag(t)}'s IQ today: *${60 + (hashStr(num(t) + new Date().toDateString()) % 101)}*`, mentions: [t] }, { quoted: msg })
    }
  },
  {
    name: 'luck', category: 'Fun', description: "Today's luck", usage: '[@user]',
    async run({ sock, jid, msg, sender }) {
      const t = getTargets(msg)[0] || sender
      await sock.sendMessage(jid, { text: `🍀 ${tag(t)}'s luck today: *${hashStr('luck' + num(t) + new Date().toDateString()) % 101}%*`, mentions: [t] }, { quoted: msg })
    }
  },
  {
    name: 'slot', aliases: ['slots'], category: 'Fun', description: 'Slot machine',
    async run({ reply }) {
      const s = ['🍒', '🍋', '🔔', '💎', '7️⃣']
      const r = [pick(s), pick(s), pick(s)]
      const win = r[0] === r[1] && r[1] === r[2]
      await reply(`🎰 | ${r.join(' | ')} |\n${win ? '🎉 JACKPOT!' : r[0] === r[1] || r[1] === r[2] ? '😮 So close!' : '😅 Try again'}`)
    }
  },
  {
    name: 'rps', category: 'Fun', description: 'Rock paper scissors', usage: 'rock|paper|scissors',
    async run({ reply, args }) {
      const opts = ['rock', 'paper', 'scissors']
      const me = (args[0] || '').toLowerCase()
      if (!opts.includes(me)) return reply('Usage: .rps rock')
      const bot = pick(opts)
      const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' }
      const res = me === bot ? "It's a tie!" : beats[me] === bot ? 'You win! 🎉' : 'I win! 😎'
      await reply(`You: ${me}\nMe: ${bot}\n\n${res}`)
    }
  }
]
