-- =====================================================================
-- Chess Boxing Tracker — Supabase schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run: it only creates what doesn't exist yet.
--
-- Sign-in is handled by Supabase Auth (magic-link email). This file adds
-- the app's own tables, keyed to auth.users, with row-level security so
-- every user can only ever read and change their own rows.
--
-- Sync model (offline-first):
--   updated_at  = when the user last changed the row on a device (last write wins)
--   deleted_at  = soft delete, so deletions reach every device
--   synced_at   = set by the server on every accepted write; devices pull
--                 rows whose synced_at is newer than their last pull
-- =====================================================================

-- ---------- Shared triggers ----------

-- Stamp synced_at on every write, and ignore writes older than what's stored
-- (protects against an offline device overwriting newer edits).
create or replace function sync_stamp() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;                         -- stale write: keep the newer row
  end if;
  new.synced_at = now();
  return new;
end $$;

-- ---------- Profiles & settings ----------

create table if not exists profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text check (char_length(display_name) <= 40),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

-- One row per user: preferences, Lichess link and the current goal plan.
-- Goal columns are null until the user finishes setup in the app.
create table if not exists user_settings (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  lichess_username      text check (lichess_username = '' or lichess_username ~ '^[A-Za-z0-9_-]{2,30}$'),
  primary_time_control  text not null default 'rapid' check (primary_time_control in ('rapid', 'blitz', 'classical', 'puzzle')),
  start_rating          int  check (start_rating  between 400 and 3500),
  target_rating         int  check (target_rating between 400 and 3500),
  start_date            date,
  target_date           date,
  start_weight_kg       numeric(5,2) check (start_weight_kg  between 30 and 300),
  target_weight_kg      numeric(5,2) check (target_weight_kg between 30 and 300),
  units                 text not null default 'kg'   check (units in ('kg', 'stlb')),
  theme                 text not null default 'dark' check (theme in ('dark', 'light')),
  onboarded             boolean not null default false,
  -- Created at sign-up with an "old" timestamp so a device's existing settings win on first sync.
  updated_at            timestamptz not null default 'epoch',
  synced_at             timestamptz not null default now()
);

-- Create profile + settings automatically when someone signs up.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id) on conflict do nothing;
  insert into user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- Weigh-ins: one per user per local day ----------

create table if not exists weight_entries (
  user_id     uuid not null references auth.users (id) on delete cascade,
  entry_date  date not null,
  weight_kg   numeric(5,2) not null check (weight_kg between 30 and 300),
  waist_cm    numeric(5,1)          check (waist_cm  between 40 and 200),
  updated_at  timestamptz not null,
  deleted_at  timestamptz,
  synced_at   timestamptz not null default now(),
  primary key (user_id, entry_date)
);
create index if not exists weight_entries_pull on weight_entries (user_id, synced_at);

-- ---------- Training & chess-study sessions ----------

create table if not exists sessions (
  id            uuid primary key,          -- generated on the device, so offline logging works
  user_id       uuid not null references auth.users (id) on delete cascade,
  session_date  date not null,
  category      text not null check (category in ('chess', 'fitness')),
  type          text not null,
  duration_min  int  not null check (duration_min between 1 and 600),
  intensity     smallint not null check (intensity between 1 and 5),
  notes         text check (char_length(notes) <= 1000),
  result        text check (result in ('won', 'draw', 'lost')),
  updated_at    timestamptz not null,
  deleted_at    timestamptz,
  synced_at     timestamptz not null default now(),
  check (
    (category = 'chess'   and type in ('tactics', 'rated', 'review', 'openings', 'endgames')) or
    (category = 'fitness' and type in ('boxing', 'cardio', 'strength', 'other'))
  ),
  check (result is null or (category = 'chess' and type = 'rated'))
);
create index if not exists sessions_pull on sessions (user_id, synced_at);

-- ---------- Game reviews (engine verdicts + coach notes per move) ----------

create table if not exists game_reviews (
  user_id     uuid not null references auth.users (id) on delete cascade,
  game_id     text not null check (char_length(game_id) <= 40),
  data        jsonb not null check (pg_column_size(data) < 400000),
  updated_at  timestamptz not null,
  deleted_at  timestamptz,
  synced_at   timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index if not exists game_reviews_pull on game_reviews (user_id, synced_at);

-- ---------- AI coach usage (per-account rate limit, written by the server) ----------

create table if not exists coach_usage (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists coach_usage_recent on coach_usage (user_id, created_at desc);

-- ---------- Sync triggers ----------

drop trigger if exists t_sync on user_settings;
create trigger t_sync before insert or update on user_settings  for each row execute function sync_stamp();
drop trigger if exists t_sync on weight_entries;
create trigger t_sync before insert or update on weight_entries for each row execute function sync_stamp();
drop trigger if exists t_sync on sessions;
create trigger t_sync before insert or update on sessions       for each row execute function sync_stamp();
drop trigger if exists t_sync on game_reviews;
create trigger t_sync before insert or update on game_reviews   for each row execute function sync_stamp();

-- ---------- Row-level security: users only see their own rows ----------

alter table profiles       enable row level security;
alter table user_settings  enable row level security;
alter table weight_entries enable row level security;
alter table sessions       enable row level security;
alter table game_reviews   enable row level security;
alter table coach_usage    enable row level security;   -- no policies: only the server (service role) touches it

drop policy if exists own_profile  on profiles;
create policy own_profile  on profiles       for all using (id = auth.uid())      with check (id = auth.uid());
drop policy if exists own_settings on user_settings;
create policy own_settings on user_settings  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own_weights  on weight_entries;
create policy own_weights  on weight_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own_sessions on sessions;
create policy own_sessions on sessions       for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own_reviews  on game_reviews;
create policy own_reviews  on game_reviews   for all using (user_id = auth.uid()) with check (user_id = auth.uid());
