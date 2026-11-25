const parse = (v) => {
  const x = (v || '').toLowerCase()
  if (['on', 'true', 'yes', 'enable'].includes(x)) return true
  if (['off', 'false', 'no', 'disable'].includes(x)) return false
  return null
}

function toggle({ name, aliases = [], description, label, on, off, exclusiveWith, after }) {
  return {
    name, aliases, category: 'Auto', description, usage: 'on|off', ownerOnly: true,
    async run({ sock, args, reply, flags, setFlag }) {
      const value = parse(args[0])
      if (value === null) return reply(`${label} is currently *${flags[name] ? 'ON' : 'OFF'}*.\nUsage: .${name} on | off`)
      await setFlag(name, value)
      let extra = ''
      if (value && exclusiveWith && flags[exclusiveWith]) {
        await setFlag(exclusiveWith, false)
        extra = `\n(.${exclusiveWith} turned off: WhatsApp can only show one status at a time.)`
      }
      if (after) await after(sock, value).catch(() => {})
      await reply(`${value ? on : off}${extra}`)
    }
  }
}

export default [
  toggle({
    name: 'autotyping', aliases: ['autotype'], description: 'Show "typing..." when messages arrive', label: 'Auto typing',
    on: '⌨️ Auto typing is *ON*.', off: '⌨️ Auto typing is *OFF*.', exclusiveWith: 'autorecording'
  }),
  toggle({
    name: 'autorecording', aliases: ['autorecord'], description: 'Show "recording audio..." when messages arrive', label: 'Auto recording',
    on: '🎙 Auto recording is *ON*.', off: '🎙 Auto recording is *OFF*.', exclusiveWith: 'autotyping'
  }),
  toggle({
    name: 'autoviewstatus', aliases: ['autoview', 'autostatus'], description: "Automatically view contacts' statuses", label: 'Auto view status',
    on: '👀 Auto view status is *ON*. I will mark your contacts\' statuses as seen.', off: '👀 Auto view status is *OFF*.'
  }),
  toggle({
    name: 'alwaysonline', aliases: ['online'], description: 'Keep the bot showing as online', label: 'Always online',
    on: '🟢 Always online is *ON*.\n_Note: while a linked device shows online, your phone may stop getting message notifications._',
    off: '⚪ Always online is *OFF*.',
    after: (sock, value) => sock.sendPresenceUpdate(value ? 'available' : 'unavailable')
  })
]
