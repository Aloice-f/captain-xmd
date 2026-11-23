
const DEFAULT_PREFIX = '.';

const ALLOWED_COMMANDS = [
  'general',
  'group',
  'ai',
  'downloader',
  'sticker',
  'admin',
  'fun',
  'tools',
  'status'
];

function createGroupSettings(rows = []) {
  const settings = {
    antiLinkGroups: new Set(),
    antiSpamGroups: new Set(),
    welcomeGroups: new Set()
  };

  for (const row of rows) {
    if (!row.group_id) continue;

    if (row.anti_link) {
      settings.antiLinkGroups.add(row.group_id);
    }

    if (row.anti_spam) {
      settings.antiSpamGroups.add(row.group_id);
    }

    if (row.welcome) {
      settings.welcomeGroups.add(row.group_id);
    }
  }

  return settings;
}

export async function loadUserSettings(supabase, userId) {
  if (!supabase || !userId) {
    throw new Error('Supabase client and user ID are required.');
  }

  const [preferences, commands, groups] = await Promise.all([
    supabase
      .from('bot_preferences')
      .select('prefix')
      .eq('user_id', userId)
      .maybeSingle(),

    supabase
      .from('command_preferences')
      .select('command_name, enabled')
      .eq('user_id', userId),

    supabase
      .from('group_settings')
      .select('group_id, anti_link, anti_spam, welcome')
      .eq('user_id', userId)
  ]);

  if (preferences.error) throw preferences.error;
  if (commands.error) throw commands.error;
  if (groups.error) throw groups.error;

  const commandSettings = Object.fromEntries(
    ALLOWED_COMMANDS.map(name => [name, true])
  );

  for (const row of commands.data || []) {
    if (ALLOWED_COMMANDS.includes(row.command_name)) {
      commandSettings[row.command_name] = row.enabled;
    }
  }

  return {
    userId,
    prefix: preferences.data?.prefix || DEFAULT_PREFIX,
    botName: 'Captain XMD',
    commands: commandSettings,
    groupSettings: createGroupSettings(groups.data || [])
  };
}

export async function saveGroupSetting(
  supabase,
  userId,
  groupId,
  setting,
  enabled
) {
  const columns = {
    antilink: 'anti_link',
    antispam: 'anti_spam',
    welcome: 'welcome'
  };

  const column = columns[setting];

  if (!supabase || !userId || !groupId) {
    throw new Error('Supabase client, user ID and group ID are required.');
  }

  if (!column || typeof enabled !== 'boolean') {
    throw new Error('Invalid group setting.');
  }

  const { data: existing, error: readError } = await supabase
    .from('group_settings')
    .select('group_id, anti_link, anti_spam, welcome')
    .eq('user_id', userId)
    .eq('group_id', groupId)
    .maybeSingle();

  if (readError) throw readError;

  const row = {
    user_id: userId,
    group_id: groupId,
    anti_link: existing?.anti_link ?? false,
    anti_spam: existing?.anti_spam ?? false,
    welcome: existing?.welcome ?? false,
    [column]: enabled
  };

  const { error } = await supabase
    .from('group_settings')
    .upsert(row, {
      onConflict: 'user_id,group_id'
    });

  if (error) throw error;

  return row;
}

export function isCommandEnabled(settings, commandName) {
  if (!settings || !ALLOWED_COMMANDS.includes(commandName)) {
    return false;
  }

  return settings.commands[commandName] !== false;
}
