const jokes = [
  'Why do programmers prefer dark mode? Because light attracts bugs. 🐛',
  'A SQL query walks into a bar, walks up to two tables and asks: can I join you?',
  'There are 10 kinds of people: those who understand binary and those who do not.'
];
const facts = [
  'Octopuses have three hearts.',
  'Honey can remain edible for thousands of years when stored properly.',
  'A day on Venus is longer than its year.'
];
const quotes = [
  'Great things are done by a series of small things brought together. — Vincent van Gogh',
  'It always seems impossible until it is done. — Nelson Mandela',
  'The secret of getting ahead is getting started. — Mark Twain'
];

export const funCommands = [
  { name: 'joke', run: async ({ sock, msg, jid }) => sock.sendMessage(jid, { text: jokes[Math.floor(Math.random()*jokes.length)] }, { quoted: msg }) },
  { name: 'fact', run: async ({ sock, msg, jid }) => sock.sendMessage(jid, { text: `🧠 ${facts[Math.floor(Math.random()*facts.length)]}` }, { quoted: msg }) },
  { name: 'quote', run: async ({ sock, msg, jid }) => sock.sendMessage(jid, { text: `💡 ${quotes[Math.floor(Math.random()*quotes.length)]}` }, { quoted: msg }) },
  { name: 'ship', run: async ({ sock, msg, jid }) => {
    const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentions.length) throw new Error('Tag someone: .ship @person');
    const score = Math.floor(Math.random()*101);
    await sock.sendMessage(jid, { text: `💞 Compatibility score: ${score}%`, mentions }, { quoted: msg });
  }}
];
