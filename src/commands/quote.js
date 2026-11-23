const QUOTES = [
  "A smooth sea never made a skilled sailor. — Proverb",
  "The best way to predict the future is to invent it. — Alan Kay",
  "It always seems impossible until it's done. — Nelson Mandela",
  "Well done is better than well said. — Benjamin Franklin",
  "Fortune favors the bold. — Latin proverb",
  "Discipline is choosing between what you want now and what you want most. — Abraham Lincoln"
]
export default {
  name: 'quote',
  category: 'Fun',
  description: 'Random quote',
  async run({ reply }) {
    await reply(`💬 ${QUOTES[Math.floor(Math.random() * QUOTES.length)]}`)
  }
}
