-- Captain XMD dashboard tables. Run this in Supabase SQL Editor.
-- The server uses the Supabase secret key only on the backend.

create table if not exists public.bot_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prefix text not null default '.',
  updated_at timestamptz not null default now()
);

create table if not exists public.command_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  command_name text not null,
  enabled boolean not null default true,
  primary key (user_id, command_name)
);

create table if not exists public.group_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id text not null,
  anti_link boolean not null default false,
  anti_spam boolean not null default false,
  welcome boolean not null default false,
  primary key (user_id, group_id)
);

alter table public.bot_preferences enable row level security;
alter table public.command_preferences enable row level security;
alter table public.group_settings enable row level security;

drop policy if exists "Users manage their bot preferences" on public.bot_preferences;
create policy "Users manage their bot preferences" on public.bot_preferences
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their command preferences" on public.command_preferences;
create policy "Users manage their command preferences" on public.command_preferences
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their group settings" on public.group_settings;
create policy "Users manage their group settings" on public.group_settings
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private bucket for encrypted per-user Baileys credentials.
insert into storage.buckets (id, name, public)
values ('whatsapp-sessions', 'whatsapp-sessions', false)
on conflict (id) do update set public = false;
