-- Orbit Messenger schema. Run in Supabase SQL Editor.
-- Browser apps must use only the anon/publishable key; never expose service_role.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  title text,
  is_group boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_members (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 10000),
  created_at timestamptz not null default now()
);

create index if not exists messages_chat_created_idx on public.messages(chat_id, created_at);
create index if not exists chat_members_user_idx on public.chat_members(user_id, chat_id);

create table if not exists public.call_signals (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  signal_type text not null check (signal_type in ('offer','answer','ice','hangup','decline')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists call_signals_recipient_idx on public.call_signals(recipient_id, created_at);

create or replace function public.is_chat_member(target_chat uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_members
    where chat_id = target_chat and user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_chat_member(uuid) from public;
grant execute on function public.is_chat_member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;
alter table public.call_signals enable row level security;

drop policy if exists "profiles readable by signed in users" on public.profiles;
create policy "profiles readable by signed in users" on public.profiles
for select to authenticated using (true);
drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile" on public.profiles
for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "members can read their chats" on public.chats;
create policy "members can read their chats" on public.chats
for select to authenticated using (public.is_chat_member(id));
drop policy if exists "signed in users create chats" on public.chats;
create policy "signed in users create chats" on public.chats
for insert to authenticated with check (created_by = (select auth.uid()));
drop policy if exists "members can read membership" on public.chat_members;
create policy "members can read membership" on public.chat_members
for select to authenticated using (user_id = (select auth.uid()) or public.is_chat_member(chat_id));
-- Membership writes are intentionally not open to arbitrary users. Add a trusted invite/creation flow before enabling inserts.

drop policy if exists "members can read messages" on public.messages;
create policy "members can read messages" on public.messages
for select to authenticated using (public.is_chat_member(chat_id));
drop policy if exists "members can send as themselves" on public.messages;
create policy "members can send as themselves" on public.messages
for insert to authenticated with check (
  sender_id = (select auth.uid()) and public.is_chat_member(chat_id)
);
drop policy if exists "sender can delete own messages" on public.messages;
create policy "sender can delete own messages" on public.messages
for delete to authenticated using (sender_id = (select auth.uid()) and public.is_chat_member(chat_id));

drop policy if exists "call participants can read signals" on public.call_signals;
create policy "call participants can read signals" on public.call_signals
for select to authenticated using (
  sender_id = (select auth.uid()) or recipient_id = (select auth.uid())
);
drop policy if exists "chat members can send call signals" on public.call_signals;
create policy "chat members can send call signals" on public.call_signals
for insert to authenticated with check (
  sender_id = (select auth.uid())
  and recipient_id <> (select auth.uid())
  and public.is_chat_member(chat_id)
  and exists (select 1 from public.chat_members cm where cm.chat_id = call_signals.chat_id and cm.user_id = call_signals.recipient_id)
);

-- Create a private profile row automatically on signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Realtime is used for chat messages and call signals.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
when undefined_object then raise notice 'Create the supabase_realtime publication in Supabase first.';
end $$;
do $$
begin
  alter publication supabase_realtime add table public.call_signals;
exception when duplicate_object then null;
when undefined_object then raise notice 'Create the supabase_realtime publication in Supabase first.';
end $$;
