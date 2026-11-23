export default {
  name: 'say',
  aliases: ['echo'],
  category: 'Tools',
  description: 'Repeat your text',
  usage: '<text>',
  async run({ reply, text }) {
    await reply(text || 'Usage: .say hello')
  }
}
