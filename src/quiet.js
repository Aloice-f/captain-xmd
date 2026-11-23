// libsignal prints session internals with console.* on every message. They are harmless
// (old messages that cannot be decrypted after linking), so hide them. Set SHOW_SIGNAL_LOGS=1 to see them.
if (!process.env.SHOW_SIGNAL_LOGS) {
  const NOISE = [
    'Closing session',
    'Opening session',
    'Removing old closed session',
    'Migrating session',
    'Session error',
    'Failed to decrypt message with any known session',
    'Decrypted message with closed session'
  ]
  for (const method of ['log', 'info', 'warn', 'error']) {
    const original = console[method].bind(console)
    console[method] = (...args) => {
      if (typeof args[0] === 'string' && NOISE.some((n) => args[0].startsWith(n))) return
      original(...args)
    }
  }
}
