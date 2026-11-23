import { getStatusSettings, setStatusSetting } from '../lib/status-control.js';
const enabled = v => v ? 'ON ✅' : 'OFF ❌';
export const statusCommands = [
  { name: 'status', aliases: ['statusmenu','statussettings'], ownerOnly: true, run: async ({sock,msg,jid,args}) => {
      const s = await getStatusSettings();
      if (!args[0]) return sock.sendMessage(jid,{text:`╭─〔 STATUS SETTINGS 〕─╮\n│ Auto-view: ${enabled(s.autoView)}\n│ Auto-react: ${enabled(s.autoReact)}\n│ Reaction: ${s.reaction}\n╰─────────────────────╯\n\nCommands:\n.statusview on/off\n.statusreact on/off\n.statusreaction ❤️ (emoji)\n.status on/off (toggles auto-view)`},{quoted:msg});
      const v=args[0].toLowerCase(); if(!['on','off'].includes(v)) return sock.sendMessage(jid,{text:'Use .status on or .status off'},{quoted:msg});
      await setStatusSetting('autoView',v==='on'); return sock.sendMessage(jid,{text:`Auto-view status: ${enabled(v==='on')}`},{quoted:msg});
    }},
  { name: 'statusview', aliases:['autostatus','viewstatus'], ownerOnly:true, run:async({sock,msg,jid,args})=>{
      const v=(args[0]||'').toLowerCase(); if(!['on','off'].includes(v)) return sock.sendMessage(jid,{text:'Usage: .statusview on/off'},{quoted:msg});
      await setStatusSetting('autoView',v==='on'); return sock.sendMessage(jid,{text:`Auto-view status ${enabled(v==='on')}`},{quoted:msg});
    }},
  { name: 'statusreact', aliases:['autoreactstatus'], ownerOnly:true, run:async({sock,msg,jid,args})=>{
      const v=(args[0]||'').toLowerCase(); if(!['on','off'].includes(v)) return sock.sendMessage(jid,{text:'Usage: .statusreact on/off'},{quoted:msg});
      await setStatusSetting('autoReact',v==='on'); return sock.sendMessage(jid,{text:`Auto-react to statuses ${enabled(v==='on')}`},{quoted:msg});
    }},
  { name: 'statusreaction', aliases:['setstatusreaction'], ownerOnly:true, run:async({sock,msg,jid,args})=>{
      const emoji=args.join(' ').trim(); if(!emoji) return sock.sendMessage(jid,{text:'Usage: .statusreaction ❤️'},{quoted:msg});
      await setStatusSetting('reaction',emoji); return sock.sendMessage(jid,{text:`Status reaction set to ${emoji}`},{quoted:msg});
    }}
];
