import { readdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'commands')

/** Each file in src/commands exports default { name, ... } or an array of such objects. */
export async function loadCommands() {
  const commands = new Map()
  for (const file of (await readdir(dir)).sort()) {
    if (!file.endsWith('.js')) continue
    let mod
    try {
      mod = await import(pathToFileURL(path.join(dir, file)).href)
    } catch (err) {
      console.error(`Failed to load ${file}:`, err.message)
      continue
    }
    for (const cmd of [mod.default].flat()) {
      if (!cmd?.name || typeof cmd.run !== 'function') continue
      commands.set(cmd.name, cmd)
      for (const alias of cmd.aliases ?? []) commands.set(alias, cmd)
    }
  }
  return commands
}
