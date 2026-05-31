import { byId } from './dom.js';
import { saveLeaderboardEntry } from '../api/leaderboardApi.js';

async function maybeSaveScore(profile, points) {
  const optOut = byId('skipLeaderboardCheckbox');
  if (optOut?.checked || !profile?.name) return;
  await saveLeaderboardEntry(profile, points);
}

function runAfterSave(profile, points, action) {
  action?.();

  // Сохранение результата не должно блокировать кнопки финального окна.
  // Если Supabase/сеть зависнет, игрок всё равно сразу уйдёт в меню или начнёт заново.
  maybeSaveScore(profile, points).catch((e) => {
    console.warn('Leaderboard save skipped:', e.message);
  });
}

export function showFinishModal({
  message,
  points,
  profile,
  onMenu,
  onAgain,
  againLabel = 'Новая игра'
}) {
  const modal = byId('finalModal');
  const finalMessage = byId('finalMessage');
  const finalButtons = byId('finalButtons');
  const optOutWrap = byId('finalLeaderboardOptOut');

  finalMessage.innerHTML = message;
  if (optOutWrap) optOutWrap.classList.remove('hidden');
  const optOut = byId('skipLeaderboardCheckbox');
  if (optOut) optOut.checked = false;

  finalButtons.innerHTML = '';

  const againBtn = document.createElement('button');
  againBtn.className = 'modal-btn';
  againBtn.textContent = againLabel;
  againBtn.onclick = () => {
    modal.classList.add('hidden');
    runAfterSave(profile, points, onAgain);
  };

  const menuBtn = document.createElement('button');
  menuBtn.className = 'modal-btn';
  menuBtn.textContent = 'Главное меню';
  menuBtn.onclick = () => {
    modal.classList.add('hidden');
    runAfterSave(profile, points, onMenu);
  };

  finalButtons.append(againBtn, menuBtn);
  modal.classList.remove('hidden');
}
