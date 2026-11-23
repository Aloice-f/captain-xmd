export default {
  name: 'flip',
  aliases: ['coin'],
  category: 'Fun',
  description: 'Flip a coin',
  async run({ reply }) {
    await reply(Math.random() < 0.5 ? '🪙 Heads!' : '🪙 Tails!')
  }
}
