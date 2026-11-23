# Captain XMD — source audit and fixes

## What was inspected
- Express API and dashboard
- Baileys 6.7.24 connection manager, socket factory, auth state and encrypted Supabase Storage
- The Baileys 6.7.24 package actually included in the uploaded archive
- Environment-variable names and non-secret configuration metadata
- JavaScript syntax across the project

## Confirmed results
- The uploaded encryption key decodes to exactly 32 bytes and passes the Base64 validation used by `lib/sessions/encryption.js`. Its value is intentionally not reproduced here.
- The encrypted session envelope uses AES-256-GCM with a 12-byte IV and 16-byte authentication tag; encrypt/decrypt handling is internally consistent.
- The session is stored per user in `whatsapp-sessions/<user UUID>/session.enc`.
- The project JavaScript source passes `node --check`.
- The included Baileys 6.7.24 package exports `fetchLatestWaWebVersion`; the socket factory import is valid for this included package.
- The code preserves saved credentials when WhatsApp returns 401. It does not automatically delete the stored session.

## Fixes applied in this copy
1. Fixed connection-status retention: terminal states such as `recoveryRequired`, `connectionFailed`, and `reconnectFailed` are now retained after the in-memory socket is unregistered.
2. Updated `/api/whatsapp/status` to return the retained status when no live socket exists.
3. Updated the dashboard to refresh connection status every five seconds and display a clearer message when WhatsApp rejects a saved session.
4. Added the missing `.env.example` referenced by the README.
5. Excluded `.env`, `.git`, and `node_modules` from this distribution archive so private configuration and bulky dependencies are not included.

## Important: the WhatsApp 401 is not proven fixed
The 401 occurs after the WebSocket opens, during WhatsApp's login/authentication handshake. Static inspection cannot determine whether WhatsApp has revoked/unlinked the stored device credentials or is rejecting the saved auth state for another account-side reason. The uploaded encryption key itself passed local format validation, but the archive cannot verify the live Supabase object or the encryption key configured on the running host.

Do not delete the Supabase `whatsapp-sessions` object or change `WHATSAPP_SESSION_ENCRYPTION_KEY` as a troubleshooting shortcut. Changing that key makes existing encrypted sessions unreadable unless they are first decrypted and re-encrypted with a migration.

If the same saved session continues to receive 401, inspect WhatsApp → Linked Devices and confirm whether the Captain XMD linked device is still listed. If it is listed but the server continues to receive 401, the next step is a controlled recovery/relink after backing up the existing encrypted object; this cannot be performed safely by a source-code-only change.

## Deployment
1. Keep your current `.env` and Supabase session object backed up.
2. Replace project source with this audited copy, but do not upload `.env`.
3. Run `npm install`, then `npm run check`, then `npm start`.
4. Keep your existing Supabase encryption key unchanged.
