export default {
  name: 'dice',
  aliases: ['roll'],
  category: 'Fun',
  description: 'Roll a dice (default 6 sides)',
  usage: '[sides]',
  async run({ reply, args }) {
    const sides = Math.min(Math.max(parseInt(args[0]) || 6, 2), 1000)
    await reply(`🎲 d${sides}: *${1 + Math.floor(Math.random() * sides)}*`)
  }
}
