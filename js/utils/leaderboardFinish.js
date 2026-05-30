import { byId } from './dom.js';
import { saveLeaderboardEntry } from '../api/leaderboardApi.js';

async function maybeSaveScore(profile, points) {
  const optOut = byId('skipLeaderboardCheckbox');
  if (optOut?.checked || !profile?.name) return;
  await saveLeaderboardEntry(profile, points);
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
  againBtn.onclick = async () => {
    await maybeSaveScore(profile, points);
    modal.classList.add('hidden');
    onAgain?.();
  };

  const menuBtn = document.createElement('button');
  menuBtn.className = 'modal-btn';
  menuBtn.textContent = 'Главное меню';
  menuBtn.onclick = async () => {
    await maybeSaveScore(profile, points);
    modal.classList.add('hidden');
    onMenu?.();
  };

  finalButtons.append(againBtn, menuBtn);
  modal.classList.remove('hidden');
}
