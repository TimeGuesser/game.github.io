import { byId } from '../utils/dom.js';

let hostSettingsDirty = false;

export function markHostSettingsDirty() {
  hostSettingsDirty = true;
}

export function clearHostSettingsDirty() {
  hostSettingsDirty = false;
}

export function showLobby() {
  byId('menuScreen')?.classList.add('hidden');
  byId('gameScreen')?.classList.add('hidden');
  byId('leaderboardScreen')?.classList.add('hidden');
  byId('roomScreen')?.classList.add('hidden');
  byId('mpFinalScreen')?.classList.add('hidden');
  byId('lobbyScreen')?.classList.remove('hidden');
}

export function showRoom() {
  byId('lobbyScreen')?.classList.add('hidden');
  byId('roomScreen')?.classList.remove('hidden');
}

export function showMenu() {
  byId('lobbyScreen')?.classList.add('hidden');
  byId('roomScreen')?.classList.add('hidden');
  byId('mpFinalScreen')?.classList.add('hidden');
  byId('gameScreen')?.classList.add('hidden');
  byId('menuScreen')?.classList.remove('hidden');
}

export function renderRoomCode(code) {
  const el = byId('roomCodeDisplay');
  const text = code || '——';
  if (el) el.textContent = text;
  const btn = byId('roomCodeCopyBtn');
  if (btn) btn.disabled = !code;
}

export async function copyRoomCodeToClipboard(code) {
  const text = (code || byId('roomCodeDisplay')?.textContent || '').trim();
  if (!text || text === '——') return false;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

export function flashCopyButton(copied) {
  const btn = byId('roomCodeCopyBtn');
  if (!btn) return;
  const prev = btn.textContent;
  btn.classList.toggle('copied', copied);
  btn.textContent = copied ? 'Скопировано' : 'Копировать';
  if (copied) {
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.textContent = prev === 'Скопировано' ? 'Копировать' : prev;
    }, 2000);
  }
}

export function renderPlayersList(players, localClientId) {
  const list = byId('roomPlayersList');
  if (!list) return;
  if (!players?.length) {
    list.innerHTML = '<li class="room-player-empty">Нет игроков</li>';
    return;
  }
  list.innerHTML = players.map((p) => {
    const isMe = p.clientId === localClientId;
    const hostBadge = p.isHost ? '<span class="player-host-badge">Хост</span>' : '';
    const readyClass = p.ready ? 'ready' : '';
    return `<li class="room-player-item ${readyClass} ${isMe ? 'is-me' : ''}">
      <span class="player-name">${escapeHtml(p.name)}${isMe ? ' (вы)' : ''}</span>
      ${hostBadge}
      <span class="player-ready-dot" title="${p.ready ? 'Готов' : 'Не готов'}"></span>
    </li>`;
  }).join('');
}

export function renderHostSettings(isHost, settings) {
  const panel = byId('roomHostSettings');
  if (!panel) return;
  panel.classList.toggle('hidden', !isHost);

  if (!isHost) return;

  if (hostSettingsDirty) return;

  const rounds = byId('hostTotalRounds');
  const timer = byId('hostTimerDuration');

  if (rounds) rounds.value = settings.totalRounds;
  if (timer) timer.value = settings.timerDuration;
}

export function setReadyButton(ready, disabled = false) {
  const btn = byId('roomReadyBtn');
  if (!btn) return;
  btn.textContent = ready ? 'Отменить готовность' : 'Готов';
  btn.disabled = disabled;
}

export function setStartButtonVisible(isHost, allReady, playerCount) {
  const btn = byId('roomStartBtn');
  if (!btn) return;
  btn.classList.toggle('hidden', !isHost);
  btn.disabled = !allReady || playerCount < 1;
}

export function showRoomError(msg) {
  const el = byId('roomError');
  if (el) {
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
  }
}

export function renderRoundTimer(remainingMs) {
  const el = byId('roundTimer');
  if (!el) return;
  const sec = Math.ceil(remainingMs / 1000);
  el.textContent = String(sec).padStart(2, '0');
  el.classList.toggle('timer-warning', sec <= 10);
}

export function showRoundTimer(visible) {
  const el = byId('roundTimer');
  if (el) el.classList.toggle('hidden', !visible);
}

export function renderRoundLeaderboard(players) {
  const wrap = byId('mpRoundLeaderboard');
  const body = byId('mpRoundLeaderboardBody');
  if (!wrap || !body) return;

  const sorted = [...players].sort((a, b) => b.lastRoundScore - a.lastRoundScore);
  body.innerHTML = sorted.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${p.lastRoundScore}</td>
      <td>${p.score}</td>
    </tr>
  `).join('');
  wrap.classList.remove('hidden');
}

export function hideRoundLeaderboard() {
  byId('mpRoundLeaderboard')?.classList.add('hidden');
}

export function renderMpFinalScreen(players, localClientId) {
  const screen = byId('mpFinalScreen');
  const body = byId('mpFinalBody');
  if (!screen || !body) return;

  const sorted = [...players].sort((a, b) => b.score - a.score);
  body.innerHTML = sorted.map((p, i) => `
    <tr class="${i < 3 ? `rank-place-${i + 1}` : ''}">
      <td>${i + 1}</td>
      <td>${escapeHtml(p.name)}${p.clientId === localClientId ? ' (вы)' : ''}</td>
      <td>${p.score}</td>
    </tr>
  `).join('');

  screen.classList.remove('hidden');
}

export function hideMpFinalScreen() {
  byId('mpFinalScreen')?.classList.add('hidden');
}

export function showMpEndButtons({ onMenu, onAgain }) {
  const menuBtn = byId('mpFinalMenuBtn');
  const againBtn = byId('mpFinalAgainBtn');
  if (menuBtn) menuBtn.onclick = onMenu;
  if (againBtn) againBtn.onclick = onAgain;
}

const TIMER_MIN_SEC = 15;
const TIMER_MAX_SEC = 300;

export function getHostSettingsFromForm() {
  const totalRounds = Math.min(15, Math.max(1, parseInt(byId('hostTotalRounds')?.value, 10) || 5));
  const timerDuration = Math.min(
    TIMER_MAX_SEC,
    Math.max(TIMER_MIN_SEC, parseInt(byId('hostTimerDuration')?.value, 10) || 60)
  );
  return {
    totalRounds,
    timerDuration
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
