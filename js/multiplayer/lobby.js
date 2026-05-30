import { byId } from '../utils/dom.js';
import { PLAYER_KEY, loadJSON, saveJSON } from '../storage/storage.js';
import { createRoom, joinRoomByCode, testSupabaseConnection } from './multiplayerApi.js';
import { supabase } from '../config/supabase.js';
import {
  showLobby,
  showRoom,
  showMenu,
  copyRoomCodeToClipboard,
  flashCopyButton
} from './multiplayerUI.js';
import {
  applyBundle,
  refreshBundle,
  renderRoomUI,
  toggleReady,
  saveHostSettings,
  hostStartGame,
  leaveCurrentRoom,
  setBundleUpdateHandler,
  getRoomState
} from './room.js';
import { startSync, cleanupSync, syncRoomStateNow } from './sync.js';

const ROOM_SESSION_KEY = 'historyguesser_room_session';

let lobbyBusy = false;

const BTN_CREATE = 'Создать комнату';
const BTN_JOIN = 'Войти в комнату';

export function showLobbyScreen() {
  showLobby();
  const profile = loadJSON(PLAYER_KEY, null);
  const nameInput = byId('lobbyPlayerName');
  if (nameInput && profile?.name) nameInput.value = profile.name;

  testSupabaseConnection().then((result) => {
    if (!result.ok) showLobbyError(result.message);
    else showLobbyError('');
  });
}

function showLobbyError(msg) {
  const el = byId('lobbyError');
  if (el) el.textContent = msg || '';
}

function showRoomError(msg) {
  const el = byId('roomError');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}

function setLobbyBusy(busy, statusText = '') {
  lobbyBusy = busy;
  const createBtn = byId('lobbyCreateBtn');
  const joinBtn = byId('lobbyJoinBtn');
  if (createBtn) {
    createBtn.disabled = busy;
    createBtn.textContent = busy && statusText ? statusText : BTN_CREATE;
  }
  if (joinBtn) {
    joinBtn.disabled = busy;
    joinBtn.textContent = busy && statusText ? statusText : BTN_JOIN;
  }
}

function getPlayerName() {
  const name = byId('lobbyPlayerName')?.value?.trim();
  if (!name) throw new Error('Введите имя игрока');
  const prev = loadJSON(PLAYER_KEY, {}) || {};
  saveJSON(PLAYER_KEY, { ...prev, name });
  return name;
}

function saveRoomSession(roomId) {
  saveJSON(ROOM_SESSION_KEY, { roomId, at: Date.now() });
}

function clearRoomSession() {
  localStorage.removeItem(ROOM_SESSION_KEY);
}

function prepareLobbyAction() {
  cleanupSync();
  clearRoomSession();
}

async function onCreateRoom() {
  if (lobbyBusy) return;
  if (!supabase) {
    showLobbyError('Supabase не загружен. Обновите страницу (Ctrl+F5).');
    return;
  }

  setLobbyBusy(true, 'Создание…');
  try {
    showLobbyError('');
    prepareLobbyAction();
    const name = getPlayerName();
    const bundle = await createRoom(name);
    saveRoomSession(bundle.room.id);
    await enterRoom(bundle.room.id, { initialBundle: bundle });
  } catch (e) {
    const msg = e?.message || 'Ошибка создания комнаты';
    showLobbyError(msg.length > 120 ? msg.slice(0, 120) + '…' : msg);
    console.error('createRoom:', e);
  } finally {
    setLobbyBusy(false);
  }
}

async function onJoinRoom() {
  if (lobbyBusy) return;
  if (!supabase) {
    showLobbyError('Supabase не загружен. Обновите страницу (Ctrl+F5).');
    return;
  }

  setLobbyBusy(true, 'Подключение…');
  try {
    showLobbyError('');
    prepareLobbyAction();
    const code = byId('lobbyRoomCode')?.value?.trim();
    if (!code) throw new Error('Введите код комнаты');
    const name = getPlayerName();
    const bundle = await joinRoomByCode(code, name);
    saveRoomSession(bundle.room.id);
    await enterRoom(bundle.room.id, { initialBundle: bundle });
  } catch (e) {
    showLobbyError(e.message);
    console.error('joinRoom:', e);
  } finally {
    setLobbyBusy(false);
  }
}

async function enterRoom(roomId, options = {}) {
  if (options.initialBundle) {
    applyBundle(options.initialBundle.room, options.initialBundle.players);
  }

  showRoom();
  renderRoomUI();

  setBundleUpdateHandler(() => {
    renderRoomUI();
  });

  try {
    await startSync(roomId, { skipInitialFetch: !!options.initialBundle });
  } catch (e) {
    console.warn('startSync:', e);
    showRoomError('Синхронизация с задержкой. Обновите страницу, если список игроков не обновляется.');
  }

  if (!options.initialBundle) {
    try {
      await refreshBundle(roomId);
      renderRoomUI();
    } catch (e) {
      console.warn('refreshBundle:', e);
      showRoomError('Не удалось загрузить комнату. Проверьте интернет.');
    }
  }
}

async function onRoomStart() {
  const startBtn = byId('roomStartBtn');
  try {
    showRoomError('');
    if (startBtn) startBtn.disabled = true;
    await hostStartGame();
    await syncRoomStateNow();
    renderRoomUI();
  } catch (e) {
    showRoomError(e?.message || 'Не удалось начать игру');
    console.error('startGame:', e);
  } finally {
    if (startBtn) startBtn.disabled = false;
  }
}

async function onLeaveRoom() {
  cleanupSync();
  try {
    await leaveCurrentRoom();
  } catch (e) {
    console.warn('leaveRoom:', e);
  }
  clearRoomSession();
  showMenu();
}

function wireLobbyEvents() {
  byId('lobbyCreateBtn')?.addEventListener('click', onCreateRoom);
  byId('lobbyJoinBtn')?.addEventListener('click', onJoinRoom);
  byId('lobbyBackBtn')?.addEventListener('click', () => showMenu());
  byId('roomReadyBtn')?.addEventListener('click', () => {
    toggleReady().catch((e) => {
      const msg = e?.message || 'Не удалось изменить готовность';
      showRoomError(msg);
      console.error('toggleReady:', e);
    });
  });
  byId('roomStartBtn')?.addEventListener('click', onRoomStart);
  byId('roomLeaveBtn')?.addEventListener('click', () => onLeaveRoom().catch(console.error));
  byId('roomBackLobbyBtn')?.addEventListener('click', () => onLeaveRoom().catch(console.error));

  byId('roomCodeCopyBtn')?.addEventListener('click', async () => {
    const state = getRoomState();
    const ok = await copyRoomCodeToClipboard(state?.code);
    flashCopyButton(ok);
    if (!ok) showRoomError('Не удалось скопировать код');
  });

  byId('lobbyRoomCode')?.addEventListener('input', (e) => {
    const el = e.target;
    if (el?.value) el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  });
}

export function initMultiplayer() {
  wireLobbyEvents();
}

export function openMultiplayerFromMenu() {
  showLobbyScreen();
}
