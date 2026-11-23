# Captain-XMD

WhatsApp bot built on Baileys. Sessions are stored in Supabase, so redeploys and restarts on Render don't log you out.

## 1. Supabase
1. Create a project at supabase.com.
2. SQL Editor → paste `supabase/schema.sql` → Run.
3. Project Settings → API: copy the **Project URL** and the **service_role** key (keep it secret).

## 2. GitHub
Push this folder to a GitHub repo. `.env` and `node_modules` are git-ignored.

## 3. Render
1. New → **Blueprint** → select the repo (it reads `render.yaml`), or New → Web Service with
   build `npm install`, start `npm start`, health check `/health`.
2. Set environment variables:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
   - `PAIR_NUMBER` – the bot's WhatsApp number, e.g. `254712345678`
   - `OWNER_NUMBER` – your number(s)
3. Deploy, then open **Logs**. A line `PAIRING CODE: XXXX-XXXX` appears.
4. On the phone: WhatsApp → Linked devices → Link a device → *Link with phone number instead* → enter the code.

After linking, credentials live in Supabase. Later deploys reconnect automatically.

## Pairing website
Open your bot's URL (e.g. `https://YOUR-APP.onrender.com`), type your WhatsApp number with country code
(`254712345678`), and the page shows the pairing code. Enter it in WhatsApp > Linked devices > Link a device >
*Link with phone number instead*. `PAIR_NUMBER` is now optional. Set `PAIR_PASSWORD` so only you can use the page.
The page refuses new codes once the bot is linked. To re-link, log the bot out from your phone's Linked devices.

## Free-plan note
Render free web services sleep after ~15 minutes without traffic, which disconnects the bot.
Add a free monitor (UptimeRobot or cron-job.org) hitting `https://YOUR-APP.onrender.com/health` every 5 minutes,
or use a paid instance.

## Commands (114)
Send `.menu` for categories, `.menu <category>` for one list, or `.allmenu` for everything.

| Category | Commands |
|---|---|
| General | menu allmenu ping alive owner time |
| Fun | 8ball dice flip joke quote truth dare wyr pickup fact roast compliment hug slap pat riddle ship rate choose iq luck slot rps |
| Pranks (fake, just jokes) | hack kill nuke virus trace |
| Text | reverse upper lower mock fancy upside binary debinary b64 unb64 morse wordcount password bmi age convert |
| Info | weather define translate wiki ip crypto currency github npm country meme cat dog advice qr shorten screenshot |
| Download | play ytmp3 video ytmp4 yts tiktok tiktokaudio fetch |
| Group (admins) | add kick promote demote revoke link setname setdesc mute unmute lock unlock setpp disappear admins tagadmins tagall hidetag groupinfo antilink welcome delete |
| Auto (owner) | autotyping autorecording autoviewstatus alwaysonline |
| Tools | calc say id |
| Owner | broadcast restart leave join block unblock setbio setmyname setbotpp listgroups |

Notes:
- `hack`, `kill`, `nuke`, `virus` and `trace` are harmless prank animations. They only edit a chat message.
- **Run the new SQL**: `supabase/schema.sql` now also creates `chat_settings` (used by `.antilink` and `.welcome`). Run it again in the Supabase SQL Editor (it is safe to re-run).
- **Downloads**: YouTube often blocks cloud servers such as Render, so `.play`/`.video` may fail from time to time. TikTok uses the public tikwm.com service. Info commands use free public APIs that can change or rate-limit. Please respect copyright and each site's terms.
- Group commands that change the group need the bot to be a group admin.
- **Auto settings** (owner only, use `on` or `off`; they are saved in Supabase and survive restarts):
  `.autotyping` shows "typing..." and `.autorecording` shows "recording audio..." in a chat when someone messages the bot (only one can be on at a time).
  `.autoviewstatus` marks contacts' statuses as seen. `.alwaysonline` keeps the bot showing as online; while it is on, your phone may stop getting message notifications.

## Menu picture
`.menu` and the connected message use `assets/menu.jpg`. Replace that file, or set `MENU_IMAGE_URL` to a direct image link.

## Connected message
Each time the bot starts and connects, it sends a "connected" message (with the picture) to the bot's own chat and to every `OWNER_NUMBER`.

## Add a command
Create `src/commands/yourcmd.js`:
```js
export default {
  name: 'hello',
  aliases: ['hi'],
  category: 'Fun',            // groups it in .menu
  description: 'Say hello',
  // usage: '<text>',         // shown in .menu
  // groupOnly: true, adminOnly: true, needsBotAdmin: true, ownerOnly: true
  async run({ reply }) { await reply('Hello from Captain-XMD!') }
}
```
Set `ownerOnly: true` to restrict it to `OWNER_NUMBER`.

## Run locally
```
cp .env.example .env   # fill in values
npm install
npm start
```
Run only **one** instance per `SESSION_ID`, otherwise WhatsApp will kick one of them off.
