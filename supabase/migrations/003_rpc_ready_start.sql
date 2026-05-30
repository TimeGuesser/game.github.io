-- Готовность и старт игры одним запросом (меньше PATCH при нестабильной сети)

create or replace function public.set_player_ready(
  p_player_id uuid,
  p_client_id text,
  p_ready boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_room public.rooms;
begin
  if coalesce(trim(p_client_id), '') = '' then
    raise exception 'client id required';
  end if;

  update public.room_players
  set ready = coalesce(p_ready, false)
  where id = p_player_id and client_id = p_client_id
  returning room_id into v_room_id;

  if v_room_id is null then
    raise exception 'player not found';
  end if;

  select * into v_room from public.rooms where id = v_room_id;

  return jsonb_build_object(
    'room', to_jsonb(v_room),
    'players', (
      select coalesce(jsonb_agg(to_jsonb(rp) order by rp.joined_at), '[]'::jsonb)
      from public.room_players rp
      where rp.room_id = v_room_id
    )
  );
end;
$$;

create or replace function public.start_game_room(
  p_room_id uuid,
  p_client_id text,
  p_total_rounds int,
  p_timer_sec int,
  p_is_public boolean,
  p_allow_late_join boolean,
  p_question_indices int[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_host public.room_players;
  v_not_ready int;
begin
  select * into v_host
  from public.room_players
  where room_id = p_room_id and client_id = p_client_id;

  if not found then
    raise exception 'not in room';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;

  if not found then
    raise exception 'room not found';
  end if;
  if v_room.host_id is distinct from v_host.id then
    raise exception 'not host';
  end if;
  if v_room.status <> 'lobby' then
    raise exception 'already started';
  end if;

  select count(*)::int into v_not_ready
  from public.room_players
  where room_id = p_room_id and not ready;

  if v_not_ready > 0 then
    raise exception 'not all ready';
  end if;

  update public.rooms set
    status = 'playing',
    total_rounds = greatest(1, least(coalesce(p_total_rounds, 5), 15)),
    timer_duration_sec = greatest(15, least(coalesce(p_timer_sec, 60), 300)),
    is_public = coalesce(p_is_public, false),
    allow_late_join = coalesce(p_allow_late_join, true),
    question_indices = coalesce(p_question_indices, '{}'),
    current_round = 0,
    round_started_at = now()
  where id = p_room_id
  returning * into v_room;

  return jsonb_build_object(
    'room', to_jsonb(v_room),
    'players', (
      select coalesce(jsonb_agg(to_jsonb(rp) order by rp.joined_at), '[]'::jsonb)
      from public.room_players rp
      where rp.room_id = p_room_id
    )
  );
end;
$$;

grant execute on function public.set_player_ready(uuid, text, boolean) to anon, authenticated;
grant execute on function public.start_game_room(uuid, text, int, int, boolean, boolean, int[]) to anon, authenticated;
