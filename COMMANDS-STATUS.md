# Captain XMD selected command set

This update removes the old huge catalog of commands that responded with “not implemented yet” and restricts `.menu` to the currently implemented command set (under 100 command names including aliases).

Included functional command families in this source:
- General: menu/help/commands, ping, about/botinfo, owner, runtime/uptime/alive
- Group admin: kick, add, promote, demote, tagall, antilink, antispam, welcome
- Media: play/song/ytmusic (search/link response), video (search links), tiktok (link response), sticker/s/stiker, toimg, take
- Fun: joke, fact, quote, ship
- Utilities: qr, google, wiki, weather, translate, calc/calculator, time, date, shortlink
- Owner: broadcast, shutdown

Important: Media commands currently provide search/link responses where a true downloader is not implemented. This update does not claim every original catalog command has been implemented. The menu now avoids listing unsupported commands. Admin commands require WhatsApp group permissions; owner commands require the connected owner.

Validation: `npm run check` passed syntax checks for all project JS files.
