
import {
  loadUserSettings,
  saveGroupSetting
} from '../user-settings.js';

export async function createUserContext({
  userId,
  supabase,
  disconnect
}) {
  if (!userId || !supabase) {
    throw new Error(
      'Authenticated user ID and Supabase client are required.'
    );
  }

  const settings = await loadUserSettings(
    supabase,
    userId
  );

  return {
    userId,
    supabase,
    settings,

    config: {
      prefix: settings.prefix,
      botName: settings.botName
    },

    groupSettings: settings.groupSettings,
    saveGroupSetting,
    disconnect
  };
}
