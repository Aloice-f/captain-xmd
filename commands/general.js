import { readFile } from 'node:fs/promises';

const menuCategories = {
  'GENERAL': `menu help commands ping about botinfo owner runtime uptime alive`,
  'GROUP ADMIN': `kick add promote demote tagall antilink antispam welcome`,
  'MEDIA': `play song ytmusic video tiktok sticker s stiker toimg take`,
  'FUN': `joke fact quote ship`,
  'TOOLS': `qr google wiki weather translate calc calculator time date shortlink`,
  'OWNER': `broadcast shutdown`,
  'STATUS CONTROL': `status statusview statusreact statusreaction`
};
const requestedCommands = [...new Set(Object.values(menuCategories).flatMap(value => value.split(/\s+/)))];
const catalogText = (prefix, categoryFilter = null) => Object.entries(menuCategories)
  .filter(([category]) => !categoryFilter || category === categoryFilter)
  .map(([category, list]) => `╭━━⟦ *${category}* ⟧\n${list.split(/\s+/).map((cmd, i, all) => `┃ ${i === all.length - 1 ? '╰' : '├'}⊷ ${prefix}${cmd}`).join('\n')}\n╰━━`)
  .join('\n\n');
const categoryMenuCommands = {
  generalmenu: 'GENERAL', adminmenu: 'GROUP ADMIN', mediamenu: 'MEDIA', funmenu: 'FUN',
  toolsmenu: 'TOOLS', ownermenu: 'OWNER', statusmenu: 'STATUS CONTROL'
};

export const generalCommands = [
  {
    name: 'menu', aliases: ['help', 'commands'],
    run: async ({ sock, msg, jid, config = {} }) => {
      const prefix = config.prefix || '.';
      const botName = config.botName || 'Captain XMD';
      const owner = String(sock.user?.id || '').split('@')[0].split(':')[0].replace(/\D/g, '') || 'Not set';
      const seconds = Math.floor(process.uptime());
      const uptime = `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`;
      const header = `╭━━━━❲〘 *${botName}* 〙❳━━━\n┃ *Prefix:* [ ${prefix} ]\n┃ *Mode:* 🔒 Personal\n┃ *Platform:* WhatsApp / Baileys\n┃ *Uptime:* ${uptime}\n┃ *Commands listed:* ${requestedCommands.length}\n┃ *Owner:* ${owner}\n╰━━━━━━━❮ ◈ ❯━━━━━━`;
      try {
        const menuImage = await readFile(new URL('../assets/captain-menu.jpg', import.meta.url));
        await sock.sendMessage(jid, { image: menuImage, caption: header }, { quoted: msg });
      } catch (err) {
        console.error('Menu image send failed:', err.message);
        await sock.sendMessage(jid, { text: header }, { quoted: msg });
      }
      const catalog = catalogText(prefix) + `\n\n*This menu lists the selected command set only.*`; 
      await sock.sendMessage(jid, { text: catalog }, { quoted: msg });
    }
  },
  { name: 'ping', run: async ({ sock, msg, jid }) => {
    const started = Date.now();
    await sock.sendMessage(jid, { text: `🏓 Pong! ${Date.now() - started} ms` }, { quoted: msg });
  } },
  { name: 'about', aliases: ['botinfo'], run: async ({ sock, msg, jid, config = {} }) => {
    await sock.sendMessage(jid, { text: `🤖 ${config.botName || 'Captain XMD'}\nNode.js + Baileys\nPrefix: ${config.prefix || '.'}\nPersonal WhatsApp assistant.` }, { quoted: msg });
  } },
  { name: 'owner', run: async ({ sock, msg, jid }) => {
    const number = String(sock.user?.id || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    await sock.sendMessage(jid, { text: number ? `👑 Bot owner/connected number: ${number}` : 'Connected number is unavailable.' }, { quoted: msg });
  } },
  { name: 'runtime', aliases: ['uptime','alive'], run: async ({ sock, msg, jid }) => {
    const sec = Math.floor(process.uptime());
    const uptime = `${Math.floor(sec/3600)}h ${Math.floor(sec%3600/60)}m ${sec%60}s`;
    const mem = Math.round(process.memoryUsage().rss/1024/1024);
    await sock.sendMessage(jid, { text: `🟢 Captain XMD is online\n⏱ Uptime: ${uptime}\n🧠 Memory: ${mem} MB` }, { quoted: msg });
  } },
  ...Object.entries(categoryMenuCommands).map(([name, category]) => ({
    name, run: async ({ sock, msg, jid, config = {} }) => {
      await sock.sendMessage(jid, { text: catalogText(config.prefix || '.', category) }, { quoted: msg });
    }
  })),
  { name: 'mode', aliases: ['botmode','privacy'], ownerOnly: true, run: async ({ sock, msg, jid, args }) => {
    const { getBotMode, setBotMode } = await import('../lib/bot-mode.js');
    const requested = (args[0] || '').toLowerCase();
    if (!['private','public'].includes(requested)) {
      const current = await getBotMode();
      return sock.sendMessage(jid,{text:`Bot mode: ${current.toUpperCase()}\nUse .mode private or .mode public`},{quoted:msg});
    }
    await setBotMode(requested);
    return sock.sendMessage(jid,{text:`🔐 Bot mode changed to ${requested.toUpperCase()}. ${requested==='private'?'Only the owner can use commands.':'Commands are available to everyone; owner-only commands remain restricted.'}`},{quoted:msg});
  }}

];

