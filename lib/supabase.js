
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishableKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY.'
  );
}

const authOptions = {
  autoRefreshToken: false,
  persistSession: false,
  detectSessionInUrl: false
};

const authClient = createClient(url, publishableKey, {
  auth: authOptions
});

export async function createGuestSession() {
  const { data, error } = await authClient.auth.signInAnonymously();
  if (error || !data?.session || !data?.user) {
    throw new Error(error?.message || 'Could not create a guest session. Enable anonymous sign-ins in Supabase Authentication settings.');
  }
  return {
    user: data.user,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at
  };
}

export async function registerUser(email, password) {
  return authClient.auth.signUp({
    email,
    password
  });
}

export async function loginUser(email, password) {
  return authClient.auth.signInWithPassword({
    email,
    password
  });
}

export async function verifyUserToken(accessToken) {
  if (
    typeof accessToken !== 'string' ||
    !accessToken.trim()
  ) {
    return null;
  }

  const { data, error } = await authClient.auth.getUser(
    accessToken
  );

  if (error || !data?.user) {
    return null;
  }

  return data.user;
}

export function createUserSupabase(accessToken) {
  if (
    typeof accessToken !== 'string' ||
    !accessToken.trim()
  ) {
    throw new Error('A valid access token is required.');
  }

  return createClient(url, publishableKey, {
    auth: authOptions,
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

export async function refreshUserSession(refreshToken) {
  if (
    typeof refreshToken !== 'string' ||
    !refreshToken.trim()
  ) {
    throw new Error('A valid refresh token is required.');
  }

  const client = createClient(url, publishableKey, {
    auth: authOptions
  });

  const { data, error } = await client.auth.refreshSession({
    refresh_token: refreshToken
  });

  if (error || !data?.session || !data?.user) {
    throw new Error('Unable to refresh the user session.');
  }

  return {
    user: data.user,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at
  };
}

// Server-only client. Never import this into frontend code.
export function createServerSupabase() {
  if (!secretKey) {
    throw new Error('Supabase server secret key is missing.');
  }

  return createClient(url, secretKey, {
    auth: authOptions
  });
}
