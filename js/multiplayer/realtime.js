import { supabase } from '../config/supabase.js';

let channel = null;

export function subscribeRoom(roomId, handlers = {}) {
  unsubscribeRoom();

  channel = supabase.channel(`room:${roomId}`, {
    config: { broadcast: { self: true } }
  });

  channel
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'rooms',
      filter: `id=eq.${roomId}`
    }, (payload) => handlers.onRoomChange?.(payload))
    // ВАЖНО: НЕ подписываемся на postgres_changes по room_players.
    // Для игроков используем только broadcast-события (быстрее и без лагов при мультиплеере).
    .on('broadcast', { event: 'round_advance' }, (payload) => {
      handlers.onBroadcast?.('round_advance', payload.payload);
    })
    .on('broadcast', { event: 'force_sync' }, (payload) => {
      handlers.onBroadcast?.('force_sync', payload.payload);
    })
    // Игроки: все изменения (join/leave/ready/answer) сигнализируем broadcast'ом.
    .on('broadcast', { event: 'player_joined' }, (payload) => {
      handlers.onPlayersBroadcast?.('player_joined', payload.payload);
    })
    .on('broadcast', { event: 'player_left' }, (payload) => {
      handlers.onPlayersBroadcast?.('player_left', payload.payload);
    })
    .on('broadcast', { event: 'player_ready' }, (payload) => {
      handlers.onPlayersBroadcast?.('player_ready', payload.payload);
    })
    .on('broadcast', { event: 'player_answered' }, (payload) => {
      handlers.onPlayersBroadcast?.('player_answered', payload.payload);
    });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') handlers.onSubscribed?.();
    if (status === 'CHANNEL_ERROR') handlers.onChannelError?.(status);
    if (status === 'TIMED_OUT') handlers.onChannelError?.(status);
  });

  return channel;
}

export function unsubscribeRoom() {
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
}

export async function broadcast(event, payload) {
  if (!channel) return;
  await channel.send({
    type: 'broadcast',
    event,
    payload
  });
}
