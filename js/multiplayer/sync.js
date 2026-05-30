import { FULL_QUESTIONS } from '../data/questions.js';
import { calcPoints } from '../utils/scoring.js';
import { getClientId } from '../utils/clientId.js';
import { getGameBridge } from '../gameBridge.js';
import { getLocalPlayer, isHost } from './roomState.js';
import {
  fetchRoomBundle,
  submitAnswer,
  setRoundResult,
  resetPlayersForRound,
  advanceRound
} from './multiplayerApi.js';
import { subscribeRoom, unsubscribeRoom, broadcast } from './realtime.js';
import { syncServerClock, startTimer, stopTimer } from './timerSync.js';
import {
  renderRoundTimer,
  showRoundTimer,
  renderRoundLeaderboard,
  hideRoundLeaderboard,
  renderMpFinalScreen,
  hideMpFinalScreen,
  showMenu
} from './multiplayerUI.js';
import { applyBundle, getRoomState, hostAdvanceRound, hostEndRound } from './room.js';
import { showFinishModal } from '../utils/leaderboardFinish.js';
import { PLAYER_KEY, loadJSON } from '../storage/storage.js';

let activeRoomId = null;
let roundAdvanceTimer = null;
let localSubmitted = false;

function getQuestionForRound(state) {
  const idx = state.questionIndices[Math.max(0, state.currentRound - 1)];
  if (idx == null || idx < 0 || idx >= FULL_QUESTIONS.length) return null;
  return FULL_QUESTIONS[idx];
}

function loadPlayerProfile() {
  return loadJSON(PLAYER_KEY, null);
}

async function handleRoomStateChange() {
  const state = getRoomState();
  if (!state) return;

  const bridge = getGameBridge();
  if (!bridge) return;

  if (state.status === 'lobby') {
    return;
  }

  if (state.status === 'playing') {
    hideMpFinalScreen();
    hideRoundLeaderboard();
    localSubmitted = false;

    const q = getQuestionForRound(state);
    if (!q) return;

    bridge.enterRoomGame?.(state, q);
    showRoundTimer(true);

    startTimer(state, {
      onTick: (ms) => renderRoundTimer(ms),
      onExpire: () => onTimerExpire(state)
    });
  } else if (state.status === 'round_result') {
    stopTimer();
    showRoundTimer(false);
    const q = getQuestionForRound(state);
    if (q) {
      bridge.showRoomRoundResult?.(state, q);
      renderRoundLeaderboard(state.players);
    }

    if (isHost(state, getClientId())) {
      clearTimeout(roundAdvanceTimer);
      roundAdvanceTimer = setTimeout(() => hostAdvanceAfterResult(state), 5000);
    }
  } else if (state.status === 'finished') {
    stopTimer();
    showRoundTimer(false);
    bridge.exitRoomGame?.();
    showRoomFinal(state);
  }
}

async function onTimerExpire(state) {
  const bridge = getGameBridge();
  const local = getLocalPlayer(state, getClientId());

  if (!localSubmitted && bridge?.submitRoomAnswer) {
    await bridge.submitRoomAnswer(local.id);
    localSubmitted = true;
  }

  if (isHost(state, getClientId())) {
    await new Promise((r) => setTimeout(r, 800));
    const bundle = await fetchRoomBundle(state.roomId);
    applyBundle(bundle.room, bundle.players);
    await setRoundResult(state.roomId);
    await broadcast('round_advance', { phase: 'round_result' });
  }
}

async function hostAdvanceAfterResult(state) {
  clearTimeout(roundAdvanceTimer);
  const next = state.currentRound + 1;
  if (next > state.totalRounds) {
    await advanceRound(state.roomId, next, state.totalRounds);
  } else {
    await resetPlayersForRound(state.roomId);
    await advanceRound(state.roomId, next, state.totalRounds);
  }
  await broadcast('round_advance', { round: next });
  const bundle = await fetchRoomBundle(state.roomId);
  applyBundle(bundle.room, bundle.players);
}

function showRoomFinal(state) {
  const bridge = getGameBridge();
  bridge?.exitRoomGame?.();

  hideMpFinalScreen();
  renderMpFinalScreen(state.players, getClientId());

  const local = getLocalPlayer(state, getClientId());
  const profile = loadPlayerProfile() || { name: local?.name || 'Игрок' };
  const maxPoints = state.totalRounds * 1000;

  showFinishModal({
    message: `Игра в комнате завершена.<br>Ваш результат: <strong>${local?.score ?? 0}</strong> из ${maxPoints}`,
    points: local?.score ?? 0,
    profile,
    againLabel: 'Новая игра',
    onMenu: () => {
      cleanupSync();
      localStorage.removeItem('historyguesser_room_session');
      showMenu();
    },
    onAgain: () => {
      cleanupSync();
      localStorage.removeItem('historyguesser_room_session');
      import('./lobby.js').then((m) => m.showLobbyScreen());
    }
  });
}

let bundleRefreshTimer = null;
let lastBundlePullAt = 0;
let pendingBundlePull = false;
let reconnectTimer = null;
let reconnectAttempt = 0;

const BUNDLE_PULL_MIN_INTERVAL_MS = 1200;
const REALTIME_RECONNECT_BASE_DELAY_MS = 800;
const REALTIME_RECONNECT_MAX_DELAY_MS = 8000;

function resetReconnectBackoff() {
  reconnectAttempt = 0;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function scheduleRealtimeReconnect(roomId) {
  // При сетевых сбоях (ERR_CONNECTION_RESET) канал и запросы могут зависать.
  // Делаем мягкий ресабскрайб с backoff.
  const delay = Math.min(
    REALTIME_RECONNECT_MAX_DELAY_MS,
    REALTIME_RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempt)
  );
  reconnectAttempt++;

  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    try {
      unsubscribeRoom();
    } catch {
      /* ignore */
    }
    // Переподписка произойдёт через startSync ниже (мы просто вызываем её повторно)
    startSync(roomId, { skipInitialFetch: false }).catch((e) => console.warn('reconnect startSync:', e));
  }, delay);
}

async function pullRoomBundle(roomId, { handleGame = false } = {}) {
  pendingBundlePull = false;
  lastBundlePullAt = Date.now();
  try {
    const bundle = await fetchRoomBundle(roomId);
    applyBundle(bundle.room, bundle.players);
    const state = getRoomState();
    if (state?.status === 'round_result') {
      renderRoundLeaderboard(state.players);
    }
    if (handleGame) await handleRoomStateChange();
  } catch (e) {
    console.warn('pullRoomBundle:', e);
  }
}

function scheduleBundleRefresh(roomId, opts = {}) {
  // В комнате на 30 человек события могут приходить пачками.
  // Чтобы не устраивать "DDOS" к PostgREST, тянем bundle не чаще, чем раз в BUNDLE_PULL_MIN_INTERVAL_MS.
  const now = Date.now();
  const sinceLast = now - lastBundlePullAt;
  const delay = Math.max(150, BUNDLE_PULL_MIN_INTERVAL_MS - sinceLast);

  if (pendingBundlePull) return;
  pendingBundlePull = true;
  clearTimeout(bundleRefreshTimer);
  bundleRefreshTimer = setTimeout(() => pullRoomBundle(roomId, opts), delay);
}

export async function syncRoomStateNow() {
  await handleRoomStateChange();
}

export async function startSync(roomId, options = {}) {
  const { skipInitialFetch = false } = options;
  activeRoomId = roomId;
  localSubmitted = false;

  // Если соединение восстанавливается — сбрасываем backoff.
  // (дальше onSubscribed вызовется при успешной подписке)

  try {
    await syncServerClock();
  } catch (e) {
    console.warn('syncServerClock:', e);
  }

  subscribeRoom(roomId, {
    onSubscribed: async () => {
      resetReconnectBackoff();
      if (skipInitialFetch) return;
      await pullRoomBundle(roomId, { handleGame: true });
    },
    onChannelError: () => {
      scheduleRealtimeReconnect(roomId);
    },
    onRoomChange: () => {
      scheduleBundleRefresh(roomId, { handleGame: true });
    },
    // Игроки обновляются не через postgres_changes, а через broadcast.
    // В ответ на broadcast тянем bundle с сервера с rate-limit'ом.
    onPlayersBroadcast: () => {
      scheduleBundleRefresh(roomId, { handleGame: false });
    },
    onBroadcast: () => {
      scheduleBundleRefresh(roomId, { handleGame: true });
    }
  });
}

export function cleanupSync() {
  stopTimer();
  clearTimeout(roundAdvanceTimer);
  clearTimeout(bundleRefreshTimer);
  clearTimeout(reconnectTimer);
  unsubscribeRoom();
  activeRoomId = null;
  localSubmitted = false;
  hideRoundLeaderboard();
  hideMpFinalScreen();
}

export async function submitLocalAnswer(playerId, lat, lng, year) {
  const state = getRoomState();
  const q = getQuestionForRound(state);
  if (!q || lat == null || lng == null) return false;

  const local = getLocalPlayer(state, getClientId());
  const res = calcPoints(lat, lng, year, q.correctLat, q.correctLng, q.correctYear);
  const newTotal = (local?.score ?? 0) + res.total;

  await submitAnswer(playerId, lat, lng, year, res.total, newTotal);
  await broadcast('player_answered', {
    clientId: local.clientId,
    answered: true
  });
  localSubmitted = true;
  return res;
}

export function markLocalSubmitted() {
  localSubmitted = true;
}

export async function hostForceEndRound() {
  await hostEndRound();
}
