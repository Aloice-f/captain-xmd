
import { generalCommands } from './general.js';
import { groupCommands } from './group.js';
import { aiCommands } from './ai.js';
import { downloaderCommands } from './downloader.js';
import { stickerCommands } from './sticker.js';
import { adminCommands } from './admin.js';
import { funCommands } from './fun.js';
import { toolCommands } from './tools.js';

const commandGroups = [
  ['general', generalCommands],
  ['group', groupCommands],
  ['ai', aiCommands],
  ['downloader', downloaderCommands],
  ['sticker', stickerCommands],
  ['admin', adminCommands],
  ['fun', funCommands],
  ['tools', toolCommands]
];

export const commands = new Map();

for (const [category, list] of commandGroups) {
  for (const command of list) {
    command.category = category;

    commands.set(command.name, command);

    for (const alias of command.aliases || []) {
      commands.set(alias, command);
    }
  }
}
