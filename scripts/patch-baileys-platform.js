import fs from 'node:fs';
import path from 'node:path';

const packageRoot = path.resolve('node_modules/@whiskeysockets/baileys');
const libRoot = path.join(packageRoot, 'lib');

if (!fs.existsSync(libRoot)) {
  console.warn('[Captain XMD] Baileys lib folder not found; install dependencies first.');
  process.exit(0);
}

function walk(dir) {
  const found = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) found.push(...walk(full));
    else if (item.isFile() && item.name.endsWith('.js')) found.push(full);
  }
  return found;
}

// Target only Baileys' connection-validation implementation, not every WEB enum.
const candidates = walk(libRoot).filter(file => /validate[-_]connection/i.test(path.basename(file)));
let patched = false;
let alreadyPatched = false;
const targetPattern = /platform\s*:\s*proto\.ClientPayload\.UserAgent\.Platform\.WEB\b/;

for (const file of candidates) {
  const original = fs.readFileSync(file, 'utf8');
  if (targetPattern.test(original)) {
    const updated = original.replace(targetPattern, 'platform: proto.ClientPayload.UserAgent.Platform.MACOS');
    fs.writeFileSync(file, updated, 'utf8');
    console.log(`[Captain XMD] Applied WhatsApp platform compatibility patch: ${path.relative(process.cwd(), file)}`);
    patched = true;
    break;
  }
  if (/platform\s*:\s*proto\.ClientPayload\.UserAgent\.Platform\.MACOS\b/.test(original)) {
    alreadyPatched = true;
  }
}

if (!patched) {
  if (alreadyPatched) {
    console.log('[Captain XMD] Baileys platform compatibility patch is already applied.');
  } else {
    console.warn('[Captain XMD] Could not find the expected Baileys validate-connection code. No files changed.');
    console.warn('[Captain XMD] This Baileys build may use a different compiled layout; check the package before pairing.');
  }
}
