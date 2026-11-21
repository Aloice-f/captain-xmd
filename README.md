# Captain XMD

Captain XMD is a personal WhatsApp bot with a web dashboard. The existing dashboard design is kept in `public/`; the server serves those files and exposes the authenticated API under `/api`. WhatsApp connectivity uses Baileys 6.7.24 and encrypted per-user session storage in a private Supabase Storage bucket.

## Requirements

- Node.js 22.x
- A Supabase project
- A Render web service (or another Node.js host)

## 1. Configure Supabase

1. Open the Supabase SQL Editor.
2. Run the complete contents of `supabase-schema.sql`.
3. In Supabase Project Settings / API, copy the project URL, publishable key, and server secret key.
4. Confirm the private Storage bucket named `whatsapp-sessions` exists. The SQL file creates it.

The secret key is server-only. Never put it in `public/`, browser JavaScript, GitHub, or a screenshot.

## 2. Configure environment variables

Copy `.env.example` to `.env` for local development and fill in the real values. Generate the encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set these variables on the hosting platform too:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `WHATSAPP_SESSION_ENCRYPTION_KEY` (exactly 32 random bytes, Base64 encoded)
- `WHATSAPP_PAIRING_ENABLED=true`
- `REGISTRATION_ENABLED=true` while creating the first account
- `BOT_NAME=Captain XMD`
- `PREFIX=.`

Keep the encryption key stable. Changing or losing it makes previously stored encrypted WhatsApp sessions unreadable. Do not upload `.env`, `user-sessions`, session files, access tokens, or pairing codes.

After creating your account, you may set `REGISTRATION_ENABLED=false` to prevent new public registrations.

## 3. Run locally

```bash
npm install
npm run check
npm start
```

Open `http://localhost:3000`. The health endpoint is `http://localhost:3000/api/health` and should return `{"ok":true,"service":"Captain XMD API"}`.

## 4. Deploy to Render

1. Push the project to a private GitHub repository.
2. Create a Render Web Service from that repository.
3. Use build command `npm install` and start command `npm start`.
4. Add the environment variables listed above in Render.
5. Wait for the deploy and verify `/api/health` returns `{"ok":true,"service":"Captain Bot API"}`.

`render.yaml` includes the required environment variable names; add the secret values in the Render dashboard.

## 5. Connect WhatsApp

1. Sign in to the Captain XMD website.
2. For a new link, enter your WhatsApp number in international format (country code, digits only is best) and request a pairing code.
3. On your phone, open WhatsApp → Linked Devices → Link a device → Link with phone number instead.
4. Enter the pairing code shown on the website.
5. Keep the server running while the account connects.

If this user already has an encrypted, registered session saved in Supabase, leave the phone-number field blank and press Connect to start that saved session again.

Never share pairing codes, WhatsApp verification codes, access tokens, or session credentials. Do not repeatedly request pairing codes: WhatsApp and the API apply rate limits.

## Commands

The default prefix is `.`. Use `.menu` in WhatsApp for the full command list. The project includes general, group moderation, AI, downloader, sticker, admin, fun, and tools command groups. Some commands require optional API keys or bot-admin privileges in a group.

## Important notes

- The visual website files are in `public/`; avoid replacing them when updating the bot backend.
- WhatsApp Web/Baileys compatibility is controlled by WhatsApp and can change. A successful build and API health check do not guarantee WhatsApp will accept a login handshake.
- The backend waits for the socket startup event before requesting a pairing code, fetches the current WhatsApp Web version at connection time, and uses a standard Windows Chrome browser descriptor.
- A server restart does not erase the encrypted session. Sign in to the dashboard and press Connect to restart a previously linked account.
- Do not run the obsolete standalone bot with a second socket alongside the dashboard server. `npm start` is the supported entry point.


## Feature and demo checklist

The current command registry includes:

- `.menu`, `.ping`, `.about`, `.owner`, `.runtime`
- Group: `.kick`, `.add`, `.promote`, `.demote`, `.tagall`, `.antilink on|off`, `.antispam on|off`, `.welcome on|off`
- AI: `.ai`, `.ask` (requires `GROQ_API_KEY`)
- Downloader/search: `.play`, `.song`, `.ytmusic`, `.video`, `.tiktok` (external services may change and not all commands directly download files)
- Stickers: `.sticker`, `.s`, `.stiker`, `.toimg`, `.take`
- Owner: `.broadcast`, `.shutdown`
- Fun: `.joke`, `.fact`, `.quote`, `.ship`
- Tools: `.qr`, `.google`, `.wiki`, `.weather`, `.translate`, `.calc`, `.calculator`, `.time`, `.date`, `.shortlink`

### Suggested demo sequence

1. Start the server and open the dashboard.
2. Create an account (if registration is enabled), then sign in.
3. Change the prefix and command-category switches; save, and verify the active session receives settings changes.
4. Connect a new WhatsApp account using the pairing flow, or leave the phone number empty to reconnect a previously saved registered session.
5. In WhatsApp, test `.menu`, `.ping`, `.about`, `.runtime`, `.calc 2+2`, `.qr hello`, and `.weather Nairobi`.
6. In a group where the bot is an admin, test `.welcome on`, `.antilink on`, `.antispam on`, then turn the settings off when finished.
7. Restart the server and verify session persistence and reconnect behavior.

External integrations (AI, translation, short links, media lookup/download) may need API credentials, working external endpoints, and/or additional system packages. A successful syntax check or `/api/health` does not prove the WhatsApp handshake or every external command works.


## Full setup checklist (local Windows)

1. Install Node.js 22 LTS. Open PowerShell in the extracted project folder.
2. Run `npm install` and then `npm run check`.
3. In Supabase, run `supabase-schema.sql` in SQL Editor.
4. In Supabase Authentication settings, set the allowed site/redirect URLs for the deployed website and decide whether email confirmation is required.
5. Copy `.env.example` to `.env` and fill in Supabase URL, publishable key, secret key, and a generated encryption key. Do not commit `.env`.
6. For local first-account creation set `REGISTRATION_ENABLED=true`. Set `WHATSAPP_PAIRING_ENABLED=true` only when Supabase and the encryption key are ready.
7. Run `npm start` and open `http://localhost:3000`.
8. Create your account, sign in, and test the dashboard. After creating the intended account, set registration to false and restart.

## Render environment checklist

Use Node 22, build `npm install`, start `npm start`, health check `/api/health`. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `WHATSAPP_SESSION_ENCRYPTION_KEY` as secret environment values. Set `WHATSAPP_PAIRING_ENABLED=true` only while intentionally allowing linking, and close registration after account creation. Never set secret values in `render.yaml`, public JS, or Git.

## Login-free WhatsApp pairing portal

The public pairing page uses Supabase Anonymous Sign-Ins to issue a separate, scoped user ID and access token to each visitor. No email/password account is required. WhatsApp auth state continues to use the existing encrypted `whatsapp-sessions` storage bucket.

Before enabling the portal:
1. In Supabase Dashboard, open **Authentication → Sign In / Providers** and enable **Anonymous Sign-Ins**.
2. Keep the existing `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `WHATSAPP_SESSION_ENCRYPTION_KEY` Render environment variables configured.
3. Set `WHATSAPP_PAIRING_ENABLED=true` in Render.
4. Confirm the existing storage bucket `whatsapp-sessions` is private and that your existing database RLS policies allow each authenticated user (including anonymous users) to read their own settings rows.
5. Deploy and test using a spare WhatsApp account first.

Guest users are isolated by Supabase user UUID. The browser stores only the temporary Supabase access/refresh tokens; Baileys credentials remain encrypted server-side. Anonymous users do not get the authenticated dashboard/settings endpoints.
