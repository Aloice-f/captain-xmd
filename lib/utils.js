
import { downloadMediaMessage } from '@whiskeysockets/baileys';

export function getText(message) {
  let content = message?.message || {};

  // Unwrap common WhatsApp message wrappers before reading the text.
  for (let depth = 0; depth < 5; depth += 1) {
    const wrapped =
      content.ephemeralMessage?.message ||
      content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message ||
      content.viewOnceMessageV2Extension?.message;
    if (!wrapped) break;
    content = wrapped;
  }

  return content.conversation
    || content.extendedTextMessage?.text
    || content.imageMessage?.caption
    || content.videoMessage?.caption
    || content.documentMessage?.caption
    || content.buttonsResponseMessage?.selectedButtonId
    || content.listResponseMessage?.singleSelectReply?.selectedRowId
    || content.templateButtonReplyMessage?.selectedId
    || content.interactiveResponseMessage?.buttonId
    || content.interactiveResponseMessage?.body?.text
    || '';
}

export function senderJid(message) {
  return message.key.participant || message.key.remoteJid || '';
}

export function jidNumber(jid = '') {
  return jid.split('@')[0].split(':')[0].replace(/\D/g, '');
}

export async function getMediaBuffer(sock, message) {
  return downloadMediaMessage(message, 'buffer', {}, {
    logger: undefined,
    reuploadRequest: sock.updateMediaMessage
  });
}

export function isGroup(jid = '') {
  return jid.endsWith('@g.us');
}

export function safeError(error) {
  return String(error?.message || error || 'Unknown error').slice(0, 180);
}
