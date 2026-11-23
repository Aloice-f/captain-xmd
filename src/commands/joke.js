const JOKES = [
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "I told my computer I needed a break. Now it won't stop sending me Kit-Kat ads.",
  "Why did the developer go broke? He used up all his cache.",
  "There are 10 kinds of people: those who understand binary and those who don't.",
  "A SQL query walks into a bar, walks up to two tables and asks: 'Can I join you?'",
  "Why was the JavaScript developer sad? He didn't know how to null his feelings."
]
export default {
  name: 'joke',
  category: 'Fun',
  description: 'Random joke',
  async run({ reply }) {
    await reply(`😂 ${JOKES[Math.floor(Math.random() * JOKES.length)]}`)
  }
}
