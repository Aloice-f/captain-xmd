import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../data/bot-mode.json', import.meta.url));
export async function getBotMode(){ try { const x=JSON.parse(await readFile(file,'utf8')); return x.mode==='public'?'public':'private'; } catch { return 'private'; } }
export async function setBotMode(mode){ if(!['private','public'].includes(mode)) throw new Error('Mode must be private or public'); await mkdir(dirname(file),{recursive:true}); await writeFile(file,JSON.stringify({mode},null,2),'utf8'); return mode; }
