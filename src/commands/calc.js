export default {
  name: 'calc',
  aliases: ['calculate'],
  category: 'Tools',
  description: 'Calculator',
  usage: '<expression>',
  async run({ reply, text }) {
    const expr = text.replace(/\^/g, '**').replace(/x/gi, '*')
    if (!expr || !/^[\d\s+\-*/%.()]+$/.test(expr)) return reply('🧮 Usage: .calc 12*(3+4)')
    try {
      const result = Function(`"use strict"; return (${expr})`)()
      if (!Number.isFinite(result)) return reply('❌ Math error.')
      await reply(`🧮 ${text} = *${result}*`)
    } catch {
      await reply('❌ Invalid expression.')
    }
  }
}
