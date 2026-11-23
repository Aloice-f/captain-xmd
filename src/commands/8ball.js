const ANSWERS = ['Yes.', 'No.', 'Definitely!', 'Not a chance.', 'Ask again later.', 'Very likely.', 'Doubtful.', 'Signs point to yes.']
export default {
  name: '8ball',
  category: 'Fun',
  description: 'Ask the magic 8-ball',
  usage: '<question>',
  async run({ reply, text }) {
    if (!text) return reply('🎱 Ask me a question, e.g. .8ball will I win?')
    await reply(`🎱 ${ANSWERS[Math.floor(Math.random() * ANSWERS.length)]}`)
  }
}
