import sharp from 'sharp';
import QRCode from 'qrcode';
import { getMediaBuffer } from '../lib/utils.js';

function contextMessage(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  return ctx?.quotedMessage ? { key: { remoteJid: msg.key.remoteJid, id: ctx.stanzaId, participant: ctx.participant }, message: ctx.quotedMessage } : msg;
}

export const stickerCommands = [
  { name: 'sticker', aliases: ['s', 'stiker'], run: async ({ sock, msg, jid }) => {
    const target = contextMessage(msg);
    const type = Object.keys(target.message || {}).find(k => ['imageMessage','videoMessage'].includes(k));
    if (!type) throw new Error('Send or reply to an image (or short video) with .sticker.');
    const buffer = await getMediaBuffer(sock, target);
    const webp = await sharp(buffer, { animated: type === 'videoMessage' }).resize(512, 512, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } }).webp({ quality: 80 }).toBuffer();
    await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
  }},
  { name: 'toimg', run: async ({ sock, msg, jid }) => {
    const target = contextMessage(msg);
    if (!target.message?.stickerMessage) throw new Error('Reply to a sticker with .toimg.');
    const buffer = await getMediaBuffer(sock, target);
    const png = await sharp(buffer).png().toBuffer();
    await sock.sendMessage(jid, { image: png, caption: 'Converted sticker' }, { quoted: msg });
  }},
  { name: 'take', run: async ({ sock, msg, jid, args }) => {
    const target = contextMessage(msg);
    if (!target.message?.stickerMessage) throw new Error('Reply to a sticker. Usage: .take pack name|author');
    const [pack='Captain Bot', author='Captain'] = args.join(' ').split('|');
    const buffer = await getMediaBuffer(sock, target);
    const webp = await sharp(buffer).webp({ quality: 85 }).toBuffer();
    await sock.sendMessage(jid, { sticker: webp, packname: pack.trim(), author: author.trim() }, { quoted: msg });
  }}
];
