-- Run this once in Supabase: Dashboard -> SQL Editor -> New query
create table if not exists public.wa_sessions (
  session_id text not null,
  key        text not null,
  value      text not null,
  updated_at timestamptz not null default now(),
  primary key (session_id, key)
);

-- Lock the table down. The bot uses the service_role key, which bypasses RLS,
-- so with RLS on and no policies the anon/public keys cannot read your session.
alter table public.wa_sessions enable row level security;

-- Per-chat settings (welcome messages, antilink). Added in v2.
create table if not exists public.chat_settings (
  chat_id text not null,
  key     text not null,
  value   jsonb,
  primary key (chat_id, key)
);
alter table public.chat_settings enable row level security;
