
export const adminCommands = [
  {
    name: 'broadcast',
    ownerOnly: true,

    run: async ({ sock, msg, args }) => {
      const text = args.join(' ').trim();

      if (!text) {
        throw new Error('Usage: .broadcast message');
      }

      const chats = await sock.groupFetchAllParticipating();
      const ids = Object.keys(chats);

      if (!ids.length) {
        throw new Error('No participating groups were found.');
      }

      let sent = 0;

      for (const id of ids.slice(0, 10)) {
        try {
          await sock.sendMessage(id, {
            text: `📢 ${text}`
          });

          sent++;

          await new Promise(resolve => setTimeout(resolve, 1200));
        } catch (error) {
          console.error(
            'Broadcast failed for a group:',
            error.message
          );
        }
      }

      await sock.sendMessage(
        msg.key.remoteJid,
        {
          text: `Broadcast sent to ${sent} groups. Maximum: 10.`
        }
      );
    }
  },

  {
    name: 'shutdown',
    ownerOnly: true,

    run: async ({ sock, jid, disconnect }) => {
      if (typeof disconnect !== 'function') {
        throw new Error(
          'Personal disconnect is not configured yet. Contact the administrator.'
        );
      }

      await sock.sendMessage(
        jid,
        {
          text: 'Captain XMD is disconnecting your WhatsApp account.'
        }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      await disconnect();
    }
  }
];
