-- HistoryGuesser multiplayer schema
-- Run in Supabase SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid,
  status text not null default 'lobby'
    check (status in ('lobby', 'playing', 'round_result', 'finished')),
  total_rounds int not null default 5 check (total_rounds between 1 and 15),
  timer_duration_sec int not null default 60 check (timer_duration_sec between 15 and 300),
  is_public boolean not null default false,
  allow_late_join boolean not null default true,
  question_indices int[] not null default '{}',
  current_round int not null default 0,
  round_started_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  client_id text not null,
  name text not null,
  score int not null default 0,
  ready boolean not null default false,
  answered boolean not null default false,
  answer_lat double precision,
  answer_lng double precision,
  answer_year int,
  last_round_score int not null default 0,
  joined_at timestamptz not null default now(),
  unique (room_id, client_id)
);

create index if not exists room_players_room_id_idx on public.room_players(room_id);
create index if not exists rooms_code_idx on public.rooms(code);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;

create policy "rooms_anon_all" on public.rooms for all using (true) with check (true);
create policy "room_players_anon_all" on public.room_players for all using (true) with check (true);

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;

create or replace function public.get_server_now()
returns timestamptz
language sql
stable
as $$ select now(); $$;

grant execute on function public.get_server_now() to anon, authenticated;
