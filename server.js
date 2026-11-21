
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import {
  registerUser,
  loginUser,
  verifyUserToken,
  createUserSupabase,
  createGuestSession,
  refreshUserSession
} from './lib/supabase.js';

import {
  startAuthenticatedUserConnection,
  stopUserConnection
} from './lib/sessions/connection-manager.js';

import { getSession } from './lib/sessions/manager.js';
import { loadUserSettings } from './lib/user-settings.js';

const app = express();
app.set('trust proxy', 1);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// RATE LIMITERS
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many attempts. Please try again later.'
  }
});

const pairingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many pairing attempts. Please try again later.'
  }
});

const allowedCommands = [
  'general',
  'group',
  'ai',
  'downloader',
  'sticker',
  'admin',
  'fun',
  'tools'
];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validEmail(email) {
  return (
    typeof email === 'string' &&
    email.length <= 254 &&
    emailPattern.test(email.trim())
  );
}

// AUTHENTICATION MIDDLEWARE
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Please log in first.'
    });
  }

  const token = header.slice(7).trim();

  verifyUserToken(token)
    .then(user => {
      if (!user) {
        return res.status(401).json({
          error: 'Your login session is invalid or expired.'
        });
      }

      req.user = user;
      req.supabase = createUserSupabase(token);
      next();
    })
    .catch(error => {
      console.error('Authentication error:', error.message);

      res.status(401).json({
        error: 'Authentication failed.'
      });
    });
}

// HEALTH CHECK
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'Captain XMD API'
  });
});



// LOGIN-FREE GUEST SESSION: Supabase anonymous auth gives each visitor an
// isolated UUID and scoped access token. WhatsApp credentials remain encrypted
// in the existing server-side storage; the browser receives only auth tokens.
app.post('/api/guest/session', authLimiter, async (req, res) => {
  try {
    const session = await createGuestSession();
    res.set('Cache-Control', 'no-store');
    res.json(session);
  } catch (error) {
    console.error('Guest session creation failed:', error.message);
    res.status(503).json({
      error: 'Login-free pairing is not enabled yet. Enable Anonymous Sign-Ins in Supabase Authentication settings.'
    });
  }
});

app.post('/api/guest/refresh', authLimiter, async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;
    const session = await refreshUserSession(refreshToken);
    res.set('Cache-Control', 'no-store');
    res.json(session);
  } catch (error) {
    res.status(401).json({ error: 'Guest session expired. Refresh this page to start a new pairing session.' });
  }
});

// WHATSAPP CONNECTION STATUS
app.get('/api/whatsapp/status', authRequired, (req, res) => {
  const session = getSession(req.user.id);
  const connected = session?.status === 'connected';
  const rawJid = session?.sock?.user?.id || '';
  const phoneNumber = rawJid
    ? rawJid.split('@')[0].split(':')[0].replace(/\D/g, '')
    : null;

  res.set('Cache-Control', 'no-store');
  res.json({
    connected,
    status: session?.status || 'disconnected',
    phoneNumber,
    connectedAt: session?.connectedAt || null,
    pairingEnabled: process.env.WHATSAPP_PAIRING_ENABLED === 'true'
  });
});


// REQUEST WHATSAPP PAIRING CODE
app.post(
  '/api/whatsapp/connect',
  authRequired,
  pairingLimiter,
  async (req, res) => {
    try {
      if (process.env.WHATSAPP_PAIRING_ENABLED !== 'true') {
        return res.status(503).json({
          ok: false,
          error: 'WhatsApp pairing is temporarily unavailable.'
        });
      }

      const phoneNumber = req.body?.phoneNumber ?? '';

      if (
        typeof phoneNumber !== 'string' ||
        (phoneNumber.trim() && !/^\+?[0-9\s()-]{8,20}$/.test(phoneNumber))
      ) {
        return res.status(400).json({
          ok: false,
          error: 'Enter a valid phone number with country code.'
        });
      }

      const session = await startAuthenticatedUserConnection({
        user: req.user,
        headers: req.headers,
        body: { phoneNumber }
      });

      // Prevent pairing-code responses from being cached.
      res.set('Cache-Control', 'no-store');

      return res.json({
        ok: true,
        status: session.pairingCode
          ? 'PAIRING_REQUIRED'
          : 'CONNECTING',
        pairingCode: session.pairingCode || null
      });
    } catch (error) {
      console.error('WhatsApp connection startup failed:', {
        name: error?.name || 'Error',
        message: error?.message || 'Unknown startup error',
        statusCode: error?.output?.statusCode || error?.statusCode || null,
        failureReason: error?.data?.reason || error?.data?.attrs?.reason || null
      });

      return res.status(400).json({
        ok: false,
        error: error?.message || 'Could not start WhatsApp connection. Please try again.'
      });
    }
  }
);

// DISCONNECT WHATSAPP
app.post('/api/whatsapp/disconnect', authRequired, (req, res) => {
  try {
    const disconnected = stopUserConnection(req.user.id);

    res.json({
      ok: true,
      disconnected
    });
  } catch (error) {
    console.error('WhatsApp disconnect error:', error.message);

    res.status(400).json({
      ok: false,
      error: 'Unable to disconnect WhatsApp.'
    });
  }
});

// REGISTER
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    if (process.env.REGISTRATION_ENABLED !== 'true') {
      return res.status(403).json({
        error: 'New account registration is currently disabled.'
      });
    }

    const email = req.body?.email;
    const password = req.body?.password;

    if (!validEmail(email)) {
      return res.status(400).json({
        error: 'Enter a valid email address.'
      });
    }

    if (
      typeof password !== 'string' ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({
        error: 'Password must be between 8 and 128 characters.'
      });
    }

    const { data, error } = await registerUser(
      email.trim(),
      password
    );

    if (error) {
      return res.status(400).json({
        error: error.message
      });
    }

    res.status(201).json({
      message: data.session
        ? 'Account created. You can now log in.'
        : 'Account created. Check your email to confirm your account.',
      needsEmailConfirmation: !data.session
    });
  } catch (error) {
    console.error('Registration error:', error.message);

    res.status(500).json({
      error: 'Could not create your account.'
    });
  }
});

// LOGIN
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const email = req.body?.email;
    const password = req.body?.password;

    if (
      !validEmail(email) ||
      typeof password !== 'string' ||
      !password
    ) {
      return res.status(400).json({
        error: 'Enter your email and password.'
      });
    }

    const { data, error } = await loginUser(
      email.trim(),
      password
    );

    if (error || !data.session) {
      return res.status(401).json({
        error: 'Login failed. Check your details and email confirmation.'
      });
    }

    res.json({
      message: 'Login successful.',
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
      user: {
        id: data.user.id,
        email: data.user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error.message);

    res.status(500).json({
      error: 'Login failed. Please try again.'
    });
  }
});

// GET PERSONAL BOT SETTINGS
app.get('/api/settings', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;

    const [preferences, commands] = await Promise.all([
      req.supabase
        .from('bot_preferences')
        .select('prefix')
        .eq('user_id', userId)
        .maybeSingle(),

      req.supabase
        .from('command_preferences')
        .select('command_name, enabled')
        .eq('user_id', userId)
    ]);

    if (preferences.error || commands.error) {
      throw preferences.error || commands.error;
    }

    res.json({
      prefix: preferences.data?.prefix || '.',
      commands: commands.data || allowedCommands.map(name => ({
        command_name: name,
        enabled: true
      }))
    });
  } catch (error) {
    console.error('Settings read error:', error.message);

    res.status(500).json({
      error: 'Could not load your settings.'
    });
  }
});

// UPDATE PERSONAL BOT SETTINGS
app.put('/api/settings', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const prefix = req.body?.prefix;
    const commands = req.body?.commands;

    if (
      typeof prefix !== 'string' ||
      prefix.length < 1 ||
      prefix.length > 5 ||
      /\s/.test(prefix)
    ) {
      return res.status(400).json({
        error: 'Prefix must be 1–5 characters without spaces.'
      });
    }

    if (!Array.isArray(commands)) {
      return res.status(400).json({
        error: 'Commands must be an array.'
      });
    }

    if (commands.length > allowedCommands.length) {
      return res.status(400).json({
        error: 'Too many command settings.'
      });
    }

    const seen = new Set();

    for (const item of commands) {
      if (
        !item ||
        !allowedCommands.includes(item.command_name) ||
        typeof item.enabled !== 'boolean' ||
        seen.has(item.command_name)
      ) {
        return res.status(400).json({
          error: 'Invalid command settings.'
        });
      }

      seen.add(item.command_name);
    }

    const { error: preferenceError } = await req.supabase
      .from('bot_preferences')
      .upsert({
        user_id: userId,
        prefix,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (preferenceError) throw preferenceError;

    const commandRows = commands.map(item => ({
      user_id: userId,
      command_name: item.command_name,
      enabled: item.enabled
    }));

    if (commandRows.length) {
      const { error } = await req.supabase
        .from('command_preferences')
        .upsert(commandRows, {
          onConflict: 'user_id,command_name'
        });

      if (error) throw error;
    }

    // Apply dashboard changes to the active WhatsApp session immediately.
    const activeSession = getSession(userId);
    if (activeSession?.context) {
      const updatedSettings = await loadUserSettings(req.supabase, userId);
      activeSession.context.settings = updatedSettings;
      activeSession.context.config.prefix = updatedSettings.prefix;
      activeSession.context.config.botName = updatedSettings.botName;
      activeSession.context.groupSettings = updatedSettings.groupSettings;
    }

    res.json({
      message: 'Your settings have been saved.'
    });
  } catch (error) {
    console.error('Settings update error:', error.message);

    res.status(500).json({
      error: 'Could not save your settings.'
    });
  }
});

// NOT FOUND
app.use((req, res) => {
  res.status(404).json({
    error: 'API route not found.'
  });
});

// START SERVER
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Captain XMD API running on port ${PORT}`);
});
