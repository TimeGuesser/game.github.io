-- Один запрос к БД вместо 3–4 (меньше таймаутов на медленной сети)
-- Выполнить в SQL Editor после setup_complete.sql
-- (pgcrypto не обязателен — код комнаты через md5/random)

create or replace function public.create_game_room(
  p_host_name text,
  p_client_id text,
  p_total_rounds int default 5,
  p_timer_sec int default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_player public.room_players;
  v_code text;
  i int := 0;
begin
  if coalesce(trim(p_host_name), '') = '' then
    raise exception 'host name required';
  end if;
  if coalesce(trim(p_client_id), '') = '' then
    raise exception 'client id required';
  end if;

  loop
    i := i + 1;
    -- без pgcrypto: только встроенные функции PostgreSQL
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text || p_client_id || i::text), 1, 8));
    exit when not exists (select 1 from public.rooms r where r.code = v_code);
    if i > 25 then
      raise exception 'could not generate unique room code';
    end if;
  end loop;

  insert into public.rooms (
    code, status, total_rounds, timer_duration_sec,
    is_public, allow_late_join, question_indices
  )
  values (
    v_code, 'lobby',
    greatest(1, least(coalesce(p_total_rounds, 5), 15)),
    greatest(15, least(coalesce(p_timer_sec, 60), 300)),
    false, true, '{}'
  )
  returning * into v_room;

  insert into public.room_players (room_id, client_id, name, ready)
  values (v_room.id, p_client_id, trim(p_host_name), false)
  on conflict (room_id, client_id) do update
    set name = excluded.name, ready = false
  returning * into v_player;

  update public.rooms set host_id = v_player.id where id = v_room.id
  returning * into v_room;

  return jsonb_build_object(
    'room', to_jsonb(v_room),
    'players', jsonb_build_array(to_jsonb(v_player))
  );
end;
$$;

create or replace function public.join_game_room(
  p_code text,
  p_client_id text,
  p_player_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_player public.room_players;
  v_count int;
begin
  select * into v_room
  from public.rooms
  where code = upper(trim(p_code));

  if not found then
    raise exception 'room not found';
  end if;
  if v_room.status = 'finished' then
    raise exception 'game finished';
  end if;

  select count(*)::int into v_count from public.room_players where room_id = v_room.id;
  if v_count >= 30 then
    raise exception 'room full';
  end if;

  if v_room.status <> 'lobby' and not v_room.allow_late_join then
    raise exception 'late join disabled';
  end if;

  insert into public.room_players (room_id, client_id, name, ready)
  values (v_room.id, p_client_id, trim(p_player_name), false)
  on conflict (room_id, client_id) do update
    set name = excluded.name
  returning * into v_player;

  return jsonb_build_object(
    'room', to_jsonb(v_room),
    'players', (
      select coalesce(jsonb_agg(to_jsonb(rp) order by rp.joined_at), '[]'::jsonb)
      from public.room_players rp
      where rp.room_id = v_room.id
    )
  );
end;
$$;

grant execute on function public.create_game_room(text, text, int, int) to anon, authenticated;
grant execute on function public.join_game_room(text, text, text) to anon, authenticated;
