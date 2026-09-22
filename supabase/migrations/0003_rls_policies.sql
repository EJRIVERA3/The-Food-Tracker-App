-- Row Level Security policies.
--
-- ############################################################
-- READ THIS FIRST, OR THIS FILE WILL MISLEAD YOU
--
-- Migrations 0001 and 0002 turned RLS ON and defined ZERO policies. That is
-- not "locked down" — it is deny-all for the anon and authenticated roles,
-- while the API connects with the SERVICE ROLE key, which bypasses RLS
-- entirely. So today these tables are protected only by the secrecy of that
-- key and of each user's sync key.
--
-- Adding the policies below changes nothing on its own. They take effect
-- only once the app stops using the service role key for user-facing reads
-- and starts passing the end user's JWT. Until that happens, treat this
-- file as preparation, not protection.
--
-- The blocker is that identity today is a sync key, not an account. Real
-- per-user policies need real per-user auth (Supabase Auth), at which point
-- auth.uid() becomes meaningful and `user_key` should be joined to it.
-- ############################################################

-- ---------------------------------------------------------------------------
-- A place to map a Supabase auth user to their sync key. Without this there
-- is nothing for a policy to compare against.
-- ---------------------------------------------------------------------------
create table if not exists public.user_keys (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  user_key   text not null unique,
  created_at timestamptz not null default now()
);

alter table public.user_keys enable row level security;

drop policy if exists "own key row" on public.user_keys;
create policy "own key row"
  on public.user_keys
  for select
  using (user_id = auth.uid());

-- Helper: the signed-in user's sync key, or null.
create or replace function public.current_user_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select user_key from public.user_keys where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- A user reads and writes only their own rows.
-- ---------------------------------------------------------------------------
drop policy if exists "own settings" on public.user_settings;
create policy "own settings"
  on public.user_settings
  for all
  using (user_key = public.current_user_key())
  with check (user_key = public.current_user_key());

drop policy if exists "own logs" on public.daily_logs;
create policy "own logs"
  on public.daily_logs
  for all
  using (user_key = public.current_user_key())
  with check (user_key = public.current_user_key());

drop policy if exists "own totals" on public.daily_totals;
create policy "own totals"
  on public.daily_totals
  for all
  using (user_key = public.current_user_key())
  with check (user_key = public.current_user_key());

-- ---------------------------------------------------------------------------
-- Coach access, via an ACTIVE consent record.
--
-- Read-only on purpose: a coach may look at a client's log, never edit it.
-- Revoking the link (status <> 'active') removes access immediately, with no
-- other cleanup required.
-- ---------------------------------------------------------------------------
create or replace function public.is_coach_for(target_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coach_links cl
    join public.staff_users su on su.coach_id = cl.coach_id
    where cl.user_key = target_key
      and cl.status = 'active'
      and su.user_id = auth.uid()
  )
$$;

-- Which auth users are coaches, and under which coach_id.
create table if not exists public.staff_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  coach_id   text not null,
  created_at timestamptz not null default now()
);

alter table public.staff_users enable row level security;

drop policy if exists "own staff row" on public.staff_users;
create policy "own staff row"
  on public.staff_users
  for select
  using (user_id = auth.uid());

drop policy if exists "coach reads shared logs" on public.daily_logs;
create policy "coach reads shared logs"
  on public.daily_logs
  for select
  using (public.is_coach_for(user_key));

drop policy if exists "coach reads shared totals" on public.daily_totals;
create policy "coach reads shared totals"
  on public.daily_totals
  for select
  using (public.is_coach_for(user_key));

drop policy if exists "coach reads shared settings" on public.user_settings;
create policy "coach reads shared settings"
  on public.user_settings
  for select
  using (public.is_coach_for(user_key));

-- ---------------------------------------------------------------------------
-- Consent records: a client sees and revokes their own; a coach sees theirs.
-- Neither may forge one — creation stays server-side.
-- ---------------------------------------------------------------------------
drop policy if exists "client sees own links" on public.coach_links;
create policy "client sees own links"
  on public.coach_links
  for select
  using (user_key = public.current_user_key());

drop policy if exists "client revokes own link" on public.coach_links;
create policy "client revokes own link"
  on public.coach_links
  for update
  using (user_key = public.current_user_key())
  with check (user_key = public.current_user_key() and status = 'revoked');

drop policy if exists "coach sees own links" on public.coach_links;
create policy "coach sees own links"
  on public.coach_links
  for select
  using (
    exists (
      select 1 from public.staff_users su
      where su.user_id = auth.uid() and su.coach_id = coach_links.coach_id
    )
  );
