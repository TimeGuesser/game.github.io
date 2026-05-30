import { supabase } from '../config/supabase.js';

let serverOffsetMs = 0;
let rafId = null;
let onTickCb = null;
let onExpireCb = null;

export async function syncServerClock() {
  const start = Date.now();
  const { data, error } = await supabase.rpc('get_server_now');
  const end = Date.now();
  if (!error && data) {
    const serverMs = new Date(data).getTime();
    const rtt = (end - start) / 2;
    serverOffsetMs = serverMs + rtt - end;
    return serverOffsetMs;
  }
  serverOffsetMs = 0;
  return 0;
}

export function serverNow() {
  return Date.now() + serverOffsetMs;
}

export function getRemainingMs(roundStartedAt, durationSec) {
  if (!roundStartedAt || !durationSec) return 0;
  const startMs = new Date(roundStartedAt).getTime();
  const elapsed = serverNow() - startMs;
  return Math.max(0, durationSec * 1000 - elapsed);
}

export function startTimer(roomState, { onTick, onExpire }) {
  stopTimer();
  onTickCb = onTick;
  onExpireCb = onExpire;
  let expired = false;

  const tick = () => {
    const remaining = getRemainingMs(roomState.roundStartedAt, roomState.timerDuration);
    onTickCb?.(remaining);
    if (remaining <= 0 && !expired) {
      expired = true;
      onExpireCb?.();
      stopTimer();
      return;
    }
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
}

export function stopTimer() {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  onTickCb = null;
  onExpireCb = null;
}
