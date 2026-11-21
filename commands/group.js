
function targets(msg) {
  const mentioned =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  const quoted =
    msg.message?.extendedTextMessage?.contextInfo?.participant;

  return [
    ...new Set([
      ...mentioned,
      ...(quoted ? [quoted] : [])
    ])
  ];
}

async function updateGroupSetting({
  sock,
  msg,
  jid,
  args,
  groupSettings,
  userId,
  supabase,
  setting,
  set
}) {
  const value = (args[0] || '').toLowerCase();

  if (!['on', 'off'].includes(value)) {
    throw new Error(`Usage: .${setting} on|off`);
  }

  if (!userId || !supabase) {
    throw new Error(
      'User settings are not connected yet. Please try again later.'
    );
  }

  const enabled = value === 'on';

  await set(supabase, userId, jid, setting, enabled);

  const groupMap = {
    antilink: groupSettings.antiLinkGroups,
    antispam: groupSettings.antiSpamGroups,
    welcome: groupSettings.welcomeGroups
  };

  const selected = groupMap[setting];

  if (enabled) {
    selected.add(jid);
  } else {
    selected.delete(jid);
  }

  await sock.sendMessage(
    jid,
    {
      text: `${setting} ${enabled ? 'enabled' : 'disabled'} and saved.`
    },
    { quoted: msg }
  );
}

export const groupCommands = [
  {
    name: 'kick',
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, msg, jid }) => {
      const list = targets(msg);

      if (!list.length) {
        throw new Error('Tag or reply to a member.');
      }

      await sock.groupParticipantsUpdate(jid, list, 'remove');

      await sock.sendMessage(
        jid,
        { text: `Removed ${list.length} member(s).` },
        { quoted: msg }
      );
    }
  },
  {
    name: 'add',
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, msg, jid, args }) => {
      const number = (args[0] || '').replace(/\D/g, '');

      if (number.length < 8) {
        throw new Error('Usage: .add 2547XXXXXXXX');
      }

      const result = await sock.groupParticipantsUpdate(
        jid,
        [`${number}@s.whatsapp.net`],
        'add'
      );

      await sock.sendMessage(
        jid,
        {
          text: `Add request result: ${JSON.stringify(result).slice(0, 500)}`
        },
        { quoted: msg }
      );
    }
  },
  {
    name: 'promote',
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, msg, jid }) => {
      const list = targets(msg);

      if (!list.length) {
        throw new Error('Tag or reply to a member.');
      }

      await sock.groupParticipantsUpdate(jid, list, 'promote');

      await sock.sendMessage(
        jid,
        { text: 'Promoted selected member(s).' },
        { quoted: msg }
      );
    }
  },
  {
    name: 'demote',
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, msg, jid }) => {
      const list = targets(msg);

      if (!list.length) {
        throw new Error('Tag or reply to a member.');
      }

      await sock.groupParticipantsUpdate(jid, list, 'demote');

      await sock.sendMessage(
        jid,
        { text: 'Demoted selected member(s).' },
        { quoted: msg }
      );
    }
  },
  {
    name: 'tagall',
    groupOnly: true,
    adminOnly: true,
    run: async ({ sock, msg, jid, args }) => {
      const meta = await sock.groupMetadata(jid);
      const members = meta.participants.map(p => p.id);

      await sock.sendMessage(
        jid,
        {
          text: `📢 ${args.join(' ') || 'Attention everyone!'}\n\n${members.map(x => `@${x.split('@')[0]}`).join(' ')}`,
          mentions: members
        },
        { quoted: msg }
      );
    }
  },
  {
    name: 'antilink',
    groupOnly: true,
    adminOnly: true,
    run: async context => {
      await updateGroupSetting({
        ...context,
        setting: 'antilink',
        set: context.saveGroupSetting
      });
    }
  },
  {
    name: 'antispam',
    groupOnly: true,
    adminOnly: true,
    run: async context => {
      await updateGroupSetting({
        ...context,
        setting: 'antispam',
        set: context.saveGroupSetting
      });
    }
  },
  {
    name: 'welcome',
    groupOnly: true,
    adminOnly: true,
    run: async context => {
      await updateGroupSetting({
        ...context,
        setting: 'welcome',
        set: context.saveGroupSetting
      });
    }
  }
];
