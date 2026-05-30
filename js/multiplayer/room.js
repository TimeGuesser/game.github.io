import { getClientId } from '../utils/clientId.js';
import { createRoomState, getLocalPlayer, isHost } from './roomState.js';
import { broadcast } from './realtime.js';
import {
  fetchRoomBundle,
  setPlayerReady,
  startGameAsHost,
  advanceRound,
  setRoundResult,
  resetPlayersForRound,
  updateRoomSettings,
  leaveRoom
} from './multiplayerApi.js';
import {
  renderRoomCode,
  renderPlayersList,
  renderHostSettings,
  setReadyButton,
  setStartButtonVisible,
  showRoomError
} from './multiplayerUI.js';

let currentBundle = null;
let onBundleUpdate = null;
let readyBusy = false;

function patchPlayerRow(playerId, patch) {
  if (!currentBundle?.players) return;
  currentBundle.players = currentBundle.players.map((p) =>
    p.id === playerId ? { ...p, ...patch } : p
  );
  onBundleUpdate?.(getRoomState());
}

export function getCurrentBundle() {
  return currentBundle;
}

export function getRoomState() {
  if (!currentBundle) return null;
  return createRoomState(currentBundle.room, currentBundle.players);
}

export function setBundleUpdateHandler(fn) {
  onBundleUpdate = fn;
}

export async function refreshBundle(roomId) {
  currentBundle = await fetchRoomBundle(roomId);
  onBundleUpdate?.(getRoomState());
  return currentBundle;
}

export function applyBundle(room, players) {
  currentBundle = { room, players };
  onBundleUpdate?.(getRoomState());
}

export function renderRoomUI() {
  const state = getRoomState();
  if (!state) return;

  const clientId = getClientId();
  const local = getLocalPlayer(state, clientId);

  renderRoomCode(state.code);
  renderPlayersList(state.players, clientId);
  renderHostSettings(isHost(state, clientId), {
    totalRounds: state.totalRounds,
    timerDuration: state.timerDuration
  });

  if (local) {
    setReadyButton(local.ready);
    const allReady = state.players.length > 0 && state.players.every((p) => p.ready);
    setStartButtonVisible(isHost(state, clientId), allReady, state.players.length);
  }

  showRoomError('');
}

export async function toggleReady() {
  if (readyBusy) return;

  const state = getRoomState();
  const local = getLocalPlayer(state, getClientId());
  if (!local) return;

  const nextReady = !local.ready;
  readyBusy = true;
  setReadyButton(nextReady, true);
  patchPlayerRow(local.id, { ready: nextReady });

  try {
    await setPlayerReady(state.roomId, nextReady);
    await broadcast('player_ready', {
      clientId: local.clientId,
      ready: nextReady
    });
  } catch (e) {
    patchPlayerRow(local.id, { ready: local.ready });
    throw e;
  } finally {
    readyBusy = false;
    renderRoomUI();
  }
}

export async function saveHostSettings() {
  const state = getRoomState();
  if (!isHost(state, getClientId())) return;

  const { getHostSettingsFromForm } = await import('./multiplayerUI.js');
  const settings = getHostSettingsFromForm();
  const updated = await updateRoomSettings(state.roomId, settings);
  if (currentBundle?.room) {
    currentBundle.room = { ...currentBundle.room, ...updated };
    onBundleUpdate?.(getRoomState());
  }
  renderRoomUI();
}

export async function hostStartGame() {
  const state = getRoomState();
  if (!isHost(state, getClientId())) return;

  const { getHostSettingsFromForm } = await import('./multiplayerUI.js');
  const settings = getHostSettingsFromForm();
  const bundle = await startGameAsHost(state.roomId, settings);

  if (bundle?.room) {
    applyBundle(bundle.room, bundle.players || currentBundle?.players || []);
  }
}

export async function hostAdvanceRound() {
  const state = getRoomState();
  if (!isHost(state, getClientId())) return;

  const next = state.currentRound + 1;
  if (next > state.totalRounds) {
    await advanceRound(state.roomId, next, state.totalRounds);
  } else {
    await resetPlayersForRound(state.roomId);
    await advanceRound(state.roomId, next, state.totalRounds);
  }
  await refreshBundle(state.roomId);
}

export async function hostEndRound() {
  const state = getRoomState();
  if (!isHost(state, getClientId())) return;
  await setRoundResult(state.roomId);
  await refreshBundle(state.roomId);
}

export async function leaveCurrentRoom() {
  const state = getRoomState();
  const local = getLocalPlayer(state, getClientId());
  if (state && local) {
    await leaveRoom(state.roomId, local.id);
  }
  currentBundle = null;
}
