import { normalizePlayers } from './playerState.js';

export function createRoomState(roomRow, playerRows = []) {
  if (!roomRow) return null;

  const players = normalizePlayers(playerRows, roomRow.host_client_id);
  const currentRound = roomRow.current_round ?? 0;
  const indices = roomRow.question_indices || [];
  const questionIndexOffset = Math.max(0, currentRound - 1);

  return {
    roomId: roomRow.id,
    code: roomRow.code,
    hostClientId: roomRow.host_client_id,
    status: roomRow.status,
    currentRound,
    totalRounds: roomRow.total_rounds,
    timerDuration: roomRow.timer_duration_sec,
    imageIndex: indices[questionIndexOffset] ?? null,
    questionIndices: indices,
    roundStartedAt: roomRow.round_started_at,
    started: roomRow.status !== 'lobby',
    finished: roomRow.status === 'finished',
    players
  };
}

export function getLocalPlayer(state, clientId) {
  return state?.players?.find((p) => p.clientId === clientId) ?? null;
}

export function isHost(state, clientId) {
  const local = getLocalPlayer(state, clientId);
  return local?.isHost ?? false;
}
