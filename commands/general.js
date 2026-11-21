
import os from 'node:os';

export const generalCommands = [
  {
    name: 'menu',
    aliases: ['help', 'commands'],
    run: async ({ sock, msg, jid, config = {} }) => {
      const prefix = config.prefix || '!';
      const botName = config.botName || 'Captain XMD';

      const owner = String(sock.user?.id || '')
        .split('@')[0]
        .split(':')[0]
        .replace(/\D/g, '');

      const seconds = Math.floor(process.uptime());
      const uptime =
        `${Math.floor(seconds / 3600)}h ` +
        `${Math.floor((seconds % 3600) / 60)}m ` +
        `${seconds % 60}s`;

      const message =
`╭━━━「 *${botName}* 」
┃ Prefix: ${prefix}
┃ Version: 1.0.0
┃ Mode: Personal
┃ Platform: WhatsApp
┃ Uptime: ${uptime}
┃ Owner: ${owner || 'Unknown'}
╰━━━━━━━━━━━━

*GENERAL*
├⊷ ${prefix}menu
├⊷ ${prefix}help
├⊷ ${prefix}ping
├⊷ ${prefix}owner
├⊷ ${prefix}about
╰⊷ ${prefix}runtime

*GROUP*
├⊷ ${prefix}kick
├⊷ ${prefix}add
├⊷ ${prefix}promote
├⊷ ${prefix}demote
├⊷ ${prefix}tagall
├⊷ ${prefix}antilink
├⊷ ${prefix}antispam
╰⊷ ${prefix}welcome

*AI*
╰⊷ ${prefix}ai <question>

*DOWNLOADER*
├⊷ ${prefix}play <song>
├⊷ ${prefix}video <search>
╰⊷ ${prefix}tiktok <link>

*STICKER*
├⊷ ${prefix}sticker
├⊷ ${prefix}toimg
╰⊷ ${prefix}take <pack>|<author>

*ADMIN*
├⊷ ${prefix}broadcast <message>
╰⊷ ${prefix}shutdown

*FUN*
├⊷ ${prefix}joke
├⊷ ${prefix}fact
├⊷ ${prefix}quote
╰⊷ ${prefix}ship @user

*TOOLS*
├⊷ ${prefix}qr <text>
├⊷ ${prefix}google <query>
├⊷ ${prefix}wiki <topic>
├⊷ ${prefix}weather <city>
├⊷ ${prefix}translate <lang> <text>
├⊷ ${prefix}calc <expression>
├⊷ ${prefix}time
├⊷ ${prefix}date
╰⊷ ${prefix}shortlink <url>

_Use commands responsibly._
> ✦ Captain XMD`;

      await sock.sendMessage(
        jid,
        { text: message },
        { quoted: msg }
      );
    }
  },

  {
    name: 'ping',
    run: async ({ sock, msg, jid }) => {
      await sock.sendMessage(
        jid,
        { text: '🏓 Pong! Captain XMD is online.' },
        { quoted: msg }
      );
    }
  },

  {
    name: 'about',
    run: async ({ sock, msg, jid, config = {} }) => {
      await sock.sendMessage(
        jid,
        {
          text:
            `🤖 ${config.botName || 'Captain XMD'}\n` +
            `Node.js + Baileys\n` +
            `Modular personal WhatsApp assistant.`
        },
        { quoted: msg }
      );
    }
  },

  {
    name: 'owner',
    run: async ({ sock, msg, jid }) => {
      const number = String(sock.user?.id || '')
        .split('@')[0]
        .split(':')[0]
        .replace(/\D/g, '');

      await sock.sendMessage(
        jid,
        {
          text: number
            ? `👑 Connected account: ${number}`
            : 'Connected account number is unavailable.'
        },
        { quoted: msg }
      );
    }
  },

  {
    name: 'runtime',
    run: async ({ sock, msg, jid }) => {
      const seconds = Math.floor(process.uptime());

      const uptime =
        `${Math.floor(seconds / 3600)}h ` +
        `${Math.floor((seconds % 3600) / 60)}m ` +
        `${seconds % 60}s`;

      await sock.sendMessage(
        jid,
        {
          text:
            `⏱️ Server uptime: ${uptime}\n` +
            `Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB\n` +
            `Platform: ${os.platform()}`
        },
        { quoted: msg }
      );
    }
  }
];
