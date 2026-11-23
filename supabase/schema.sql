-- Run this in Supabase: Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run again on an existing project.

-- WhatsApp credentials for every bot (one row set per session_id).
create table if not exists public.wa_sessions (
  session_id text not null,
  key        text not null,
  value      text not null,
  updated_at timestamptz not null default now(),
  primary key (session_id, key)
);

-- Lock the table down. The bot uses the service_role key, which bypasses RLS,
-- so with RLS on and no policies the anon/public keys cannot read your sessions.
alter table public.wa_sessions enable row level security;

-- Per-chat settings (welcome, antilink). chat_id is namespaced per bot (v3).
create table if not exists public.chat_settings (
  chat_id text not null,
  key     text not null,
  value   jsonb,
  primary key (chat_id, key)
);
alter table public.chat_settings enable row level security;

-- The bots listed on the dashboard. Credentials stay in wa_sessions above.
create table if not exists public.bot_sessions (
  id            text primary key,
  label         text,
  owner_number  text,
  linked_number text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.bot_sessions enable row level security;
