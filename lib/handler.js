
import { commands } from '../commands/index.js';

import {
  getText,
  senderJid,
  jidNumber,
  isGroup
} from './utils.js';

import {
  isCommandEnabled,
  saveGroupSetting
} from './user-settings.js';

// Each WhatsApp account has its own anti-spam tracking.
const recentMessages = new Map();

const SPAM_WINDOW_MS = 8000;
const SPAM_MESSAGE_LIMIT = 6;

export function createGroupSettings() {
  return {
    antiLinkGroups: new Set(),
    antiSpamGroups: new Set(),
    welcomeGroups: new Set()
  };
}

function containsLink(text) {
  return /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/)/i.test(text);
}

function trackMessage(userId, jid, sender) {
  const key = `${userId}:${jid}:${sender}`;
  const now = Date.now();

  const previous = recentMessages.get(key) || [];

  const next = previous.filter(
    timestamp => now - timestamp < SPAM_WINDOW_MS
  );

  next.push(now);
  recentMessages.set(key, next);

  return next.length;
}

export async function handleMessage(
  sock,
  msg,
  context = {}
) {
  if (!msg?.message) return;

  const {
    config = {},
    userId = null,
    supabase = null,
    settings = null,
    groupSettings = createGroupSettings(),
    disconnect = null
  } = context;

  if (!userId) {
    console.error('Message rejected: missing authenticated user context.');
    return;
  }

  const jid = msg.key?.remoteJid;

  if (!jid || jid === 'status@broadcast') return;

  const text = getText(msg).trim();
  if (!text) return;

   const sender = senderJid(msg);
  const senderNumber = jidNumber(sender);

  const botJid = sock.user?.id || '';
  const ownerNumber = String(botJid)
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');

  // WhatsApp self-sent messages can arrive with @lid identifiers.
  // Trust Baileys' fromMe flag for messages sent by the connected account.
  const isOwner = Boolean(
    msg.key?.fromMe ||
    (ownerNumber && senderNumber === ownerNumber)
  );

  const { getBotMode } = await import('./bot-mode.js');
  const botMode = await getBotMode();
  if (botMode === 'private' && !isOwner) return;

  const group = isGroup(jid);

  let isAdmin = false;
  let botIsAdmin = false;

  if (group) {
    try {
      const metadata = await sock.groupMetadata(jid);

      const participant = metadata.participants.find(
        participant => participant.id === sender
      );

      const bot = metadata.participants.find(
        participant =>
          participant.id === botJid ||
          participant.id.split(':')[0] === botJid.split(':')[0]
      );

      isAdmin = ['admin', 'superadmin'].includes(
        participant?.admin
      );

      botIsAdmin = ['admin', 'superadmin'].includes(
        bot?.admin
      );
    } catch (error) {
      console.error('Group metadata lookup failed:', error.message);
    }
  }

  // Anti-spam is isolated by authenticated WhatsApp account.
  if (
    group &&
    groupSettings.antiSpamGroups.has(jid)
  ) {
    const messageCount = trackMessage(
      userId,
      jid,
      sender
    );

    if (
      messageCount > SPAM_MESSAGE_LIMIT &&
      botIsAdmin &&
      !isAdmin
    ) {
      await sock.sendMessage(
        jid,
        {
          text: '⚠️ Anti-spam: please slow down.'
        },
        { quoted: msg }
      );

      try {
        await sock.groupParticipantsUpdate(
          jid,
          [sender],
          'remove'
        );
      } catch (error) {
        console.error('Anti-spam moderation failed:', error.message);
      }

      return;
    }
  }

  // Anti-link protection.
  if (
    group &&
    groupSettings.antiLinkGroups.has(jid) &&
    containsLink(text) &&
    !isAdmin &&
    !isOwner
  ) {
    if (botIsAdmin) {
      try {
        await sock.sendMessage(
          jid,
          { delete: msg.key }
        );
      } catch (error) {
        console.error('Link deletion failed:', error.message);
      }

      await sock.sendMessage(jid, {
        text: `⚠️ @${senderNumber} links are disabled in this group.`,
        mentions: [sender]
      });
    }

    return;
  }

  const prefix = config.prefix || '.';

  if (!text.startsWith(prefix)) return;

  const body = text.slice(prefix.length).trim();
  if (!body) return;

  const [rawName, ...args] = body.split(/\s+/);
  const name = rawName.toLowerCase();

  const command = commands.get(name);

  if (!command) {
    await sock.sendMessage(
      jid,
      {
        text: `Unknown command: ${prefix}${name}\nType ${prefix}menu to see available commands.`
      },
      { quoted: msg }
    );

    return;
  }

  const category = command.category || null;

  if (
    settings &&
    category &&
    !isCommandEnabled(settings, category)
  ) {
    return sock.sendMessage(
      jid,
      {
        text: `The ${category} command category is disabled.`
      },
      { quoted: msg }
    );
  }

  if (command.ownerOnly && !isOwner) {
    return sock.sendMessage(
      jid,
      {
        text: '⛔ This command is restricted to the bot owner.'
      },
      { quoted: msg }
    );
  }

  if (command.adminOnly && !(isAdmin || isOwner)) {
    return sock.sendMessage(
      jid,
      { text: '⛔ Group admins only.' },
      { quoted: msg }
    );
  }

  if (command.groupOnly && !group) {
    return sock.sendMessage(
      jid,
      {
        text: 'This command can only be used in a group.'
      },
      { quoted: msg }
    );
  }

  if (command.botAdmin && !botIsAdmin) {
    return sock.sendMessage(
      jid,
      {
        text: 'Make Captain Bot a group admin first.'
      },
      { quoted: msg }
    );
  }

  try {
    await command.run({
      sock,
      msg,
      jid,
      sender,
      senderNumber,
      args,
      text,
      isOwner,
      isAdmin,
      botIsAdmin,
      group,
      groupSettings,
      config,
      userId,
      supabase,
      disconnect,
      saveGroupSetting
    });
    } catch (error) {
    console.error(
      `Command ${name} failed:`,
      error
    );

    await sock.sendMessage(
      jid,
      {
        text: '❌ An error occurred while executing this command.'
      },
      { quoted: msg }
    );
  }
}


