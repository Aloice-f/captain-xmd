import yts from 'yt-search';

export const downloaderCommands = [
  { name: 'play', aliases: ['song', 'ytmusic'], run: async ({ sock, msg, jid, args }) => {
    const q = args.join(' ').trim(); if (!q) throw new Error('Usage: .play song name');
    const result = await yts(q);
    const videos = result.videos.slice(0, 5);
    if (!videos.length) throw new Error('No results found.');
    const out = videos.map((v,i) => `${i+1}. *${v.title}*\n⏱ ${v.timestamp || 'Unknown'} | ${v.author.name}\n${v.url}`).join('\n\n');
    await sock.sendMessage(jid, { text: `🎵 YouTube search results for: ${q}\n\n${out}\n\nOpen the links to listen. Only download content you have permission to use.` }, { quoted: msg });
  }},
  { name: 'video', run: async ({ sock, msg, jid, args }) => {
    const q = args.join(' ').trim(); if (!q) throw new Error('Usage: .video search words');
    const result = await yts(q);
    const videos = result.videos.slice(0, 5);
    if (!videos.length) throw new Error('No videos found.');
    await sock.sendMessage(jid, { text: `🎬 Video results:\n\n${videos.map((v,i)=>`${i+1}. ${v.title}\n${v.url}`).join('\n\n')}` }, { quoted: msg });
  }},
  { name: 'tiktok', run: async ({ sock, msg, jid, args }) => {
    const value = args.join(' ').trim();
    if (!value) throw new Error('Usage: .tiktok paste a public TikTok URL. This command returns the link, it does not download it.');
    if (!/^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com)\//i.test(value)) throw new Error('Please provide a valid public TikTok URL.');
    await sock.sendMessage(jid, { text: `TikTok link:\n${value}\n\nOpen the link in TikTok. Download availability depends on the creator’s settings.` }, { quoted: msg });
  }}
];
