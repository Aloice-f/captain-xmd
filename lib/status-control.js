import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../data/status-settings.json', import.meta.url));
const defaults = { autoView: false, autoReact: false, reaction: '❤️' };
async function load() {
  try { return { ...defaults, ...JSON.parse(await readFile(file, 'utf8')) }; }
  catch { return { ...defaults }; }
}
async function save(settings) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(settings, null, 2), 'utf8');
}
export async function getStatusSettings() { return load(); }
export async function setStatusSetting(key, value) {
  const s = await load();
  if (!(key in defaults)) throw new Error('Unknown status setting');
  s[key] = value;
  await save(s);
  return s;
}
export async function handleStatusMessage(sock, message) {
  if (message?.key?.remoteJid !== 'status@broadcast') return;
  const settings = await load();
  if (!settings.autoView && !settings.autoReact) return;
  try {
    if (settings.autoView) await sock.readMessages([message.key]);
    if (settings.autoReact && message.key?.participant) {
      await sock.sendMessage('status@broadcast', {
        react: { text: settings.reaction || '❤️', key: message.key }
      });
    }
  } catch (e) { console.error('Status automation error:', e.message); }
}
