import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase.js';
import { getClientId } from '../utils/clientId.js';
import { withTimeout } from '../utils/withTimeout.js';
import {
  formatSupabaseError,
  humanizeError,
  isDuplicateError,
  isMissingRpcError,
  isNetworkFailure
} from './supabaseErrors.js';
import { FULL_QUESTIONS } from '../data/questions.js';

// В мультиплеере важнее быстро показать интерфейс, чем ждать 20–60 секунд из-за ретраев.
// Поэтому базовый таймаут короче; для критичных мутаций ниже оставлены ретраи.
const REQUEST_TIMEOUT_MS = 8000;
const RPC_RETRIES = 2;
const MUTATION_RETRIES = 3;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase не загружен. Обновите страницу (Ctrl+F5).');
  }
  return supabase;
}

function dbOp(promise, timeoutMs = REQUEST_TIMEOUT_MS) {
  return withTimeout(promise, timeoutMs);
}

function throwDbError(error, context) {
  throw new Error(`${context}: ${humanizeError(error)}`);
}

/** Прямой POST к PostgREST — обход сбоев supabase-js + расширений (requests.js) */
async function rpcDirect(functionName, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    cache: 'no-store',
    body: JSON.stringify(params)
  });

  const text = await res.text();
  if (!res.ok) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { message: text };
    }
    const err = new Error(parsed.message || `HTTP ${res.status}`);
    err.code = parsed.code;
    throw err;
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Некорректный JSON от Supabase');
  }
}

async function callRpc(functionName, params) {
  let lastError = null;

  for (let attempt = 0; attempt < RPC_RETRIES; attempt++) {
    if (attempt > 0) await sleep(600 * attempt);

    try {
      const { data, error } = await dbOp(
        requireSupabase().rpc(functionName, params)
      );
      if (!error && data !== null && data !== undefined) return data;
      if (error) {
        lastError = error;
        if (isMissingRpcError(error)) throw error;
        if (!isNetworkFailure(error)) throw error;
      }
    } catch (e) {
      lastError = e;
      if (isMissingRpcError(e)) throw e;
    }

    try {
      const data = await dbOp(rpcDirect(functionName, params));
      if (data !== null && data !== undefined) return data;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('Failed to fetch');
}

/** Проверка связи (без HEAD /rest/v1/ — он даёт ложный 401) */
export async function testSupabaseConnection() {
  if (!supabase) {
    return { ok: false, message: 'SDK Supabase не загружен (Ctrl+F5).' };
  }

  try {
    const { data, error } = await dbOp(requireSupabase().rpc('get_server_now'));
    if (error) {
      return { ok: false, message: humanizeError(error) };
    }
    if (data) return { ok: true, message: 'Связь с Supabase есть' };
  } catch (e) {
    return { ok: false, message: humanizeError(e) };
  }

  try {
    const { error } = await dbOp(
      requireSupabase().from('rooms').select('id').limit(1)
    );
    if (error) return { ok: false, message: humanizeError(error) };
    return { ok: true, message: 'Связь с Supabase есть' };
  } catch (e) {
    return { ok: false, message: humanizeError(e) };
  }
}

export async function fetchServerNow() {
  try {
    const { data, error } = await dbOp(requireSupabase().rpc('get_server_now'));
    if (!error && data) return new Date(data).getTime();
  } catch (e) {
    console.warn('get_server_now:', e.message);
  }
  return Date.now();
}

export async function createRoom(hostName, settings = {}) {
  const clientId = getClientId();
  requireSupabase();

  try {
    const data = await callRpc('create_game_room', {
      p_host_name: hostName,
      p_client_id: clientId,
      p_total_rounds: settings.totalRounds ?? 5,
      p_timer_sec: settings.timerDuration ?? 60
    });
    const roomId = data?.room_id;
    if (!roomId) throw new Error('Некорректный ответ create_game_room');
    try {
      return await fetchRoomBundle(roomId);
    } catch (e) {
      console.warn('fetchRoomBundle after create failed:', e.message);
      return {
        room: {
          id: roomId,
          code: data.code,
          host_client_id: clientId,
          status: 'lobby',
          total_rounds: settings.totalRounds ?? 5,
          timer_duration_sec: settings.timerDuration ?? 60,
          question_indices: [],
          current_round: 0,
          round_started_at: null,
          created_at: new Date().toISOString()
        },
        players: [{
          id: clientId,
          room_id: roomId,
          client_id: clientId,
          name: hostName,
          score: 0,
          ready: false,
          answered: false,
          answer_lat: null,
          answer_lng: null,
          answer_year: null,
          last_round_score: 0,
          joined_at: new Date().toISOString()
        }]
      };
    }
  } catch (error) {
    if (isMissingRpcError(error)) {
      return createRoomLegacy(hostName, settings);
    }
    throwDbError(error, 'Не удалось создать комнату');
  }
}

export async function joinRoomByCode(code, playerName) {
  const clientId = getClientId();
  requireSupabase();

  try {
    const data = await callRpc('join_game_room', {
      p_code: code.trim().toUpperCase(),
      p_client_id: clientId,
      p_player_name: playerName
    });
    const roomId = data?.room_id;
    if (!roomId) throw new Error('Некорректный ответ join_game_room');
    return fetchRoomBundle(roomId);
  } catch (error) {
    if (isMissingRpcError(error)) {
      return joinRoomByCodeLegacy(code, playerName);
    }
    throwDbError(error, 'Не удалось войти в комнату');
  }
}

async function restGetJson(pathAndQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json'
    },
    cache: 'no-store'
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text).message || msg;
    } catch {
      /* ignore */
    }
    const err = new Error(msg || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (!text) return [];
  return JSON.parse(text);
}

async function restPatchRow(table, filterQuery, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filterQuery}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation'
    },
    cache: 'no-store',
    body: JSON.stringify(patch)
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text).message || msg;
    } catch {
      /* ignore */
    }
    const err = new Error(msg || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const rows = text ? JSON.parse(text) : [];
  const row = rows[0];
  if (!row) throw new Error('Пустой ответ сервера');
  return row;
}

async function runMutation(sdkFn, directFn) {
  let lastErr = null;

  for (let attempt = 0; attempt < MUTATION_RETRIES; attempt++) {
    if (attempt > 0) await sleep(400 * attempt);

    try {
      const { data, error } = await dbOp(sdkFn());
      if (error) throw error;
      if (data) return data;
    } catch (e) {
      lastErr = e;
      if (isMissingRpcError(e)) throw e;
    }

    try {
      return await dbOp(directFn());
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('Failed to fetch');
}

async function fetchRoomBundleDirect(roomId) {
  const rooms = await restGetJson(
    `rooms?id=eq.${encodeURIComponent(roomId)}&select=id,code,host_client_id,status,total_rounds,timer_duration_sec,question_indices,current_round,round_started_at,created_at`
  );
  const room = rooms?.[0];
  if (!room) throw new Error('Комната не найдена');

  const players = await restGetJson(
    `room_players?room_id=eq.${encodeURIComponent(roomId)}&select=id,room_id,client_id,name,score,ready,answered,answer_lat,answer_lng,answer_year,last_round_score,joined_at&order=joined_at.asc`
  );
  return { room, players: players || [] };
}

export async function fetchRoomBundle(roomId) {
  let lastErr = null;

  // Для первичной загрузки комнаты не делаем долгих ожиданий.
  // Если сеть плохая — лучше быстро показать ошибку и дать пользователю перезагрузить.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(500 * attempt);

    try {
      const db = requireSupabase();
      const { data: room, error: roomErr } = await dbOp(
        db.from('rooms')
          .select('id,code,host_client_id,status,total_rounds,timer_duration_sec,question_indices,current_round,round_started_at,created_at')
          .eq('id', roomId)
          .single(),
        8000
      );
      if (roomErr) throw roomErr;

      const { data: players, error: playersErr } = await dbOp(
        db.from('room_players')
          .select('id,room_id,client_id,name,score,ready,answered,answer_lat,answer_lng,answer_year,last_round_score,joined_at')
          .eq('room_id', roomId)
          .order('joined_at', { ascending: true }),
        8000
      );
      if (playersErr) throw playersErr;

      return { room, players: players || [] };
    } catch (e) {
      lastErr = e;
    }

    try {
      return await dbOp(fetchRoomBundleDirect(roomId), 8000);
    } catch (e) {
      lastErr = e;
    }
  }

  throwDbError(lastErr, 'Комната не загружена');
}

/* ── Legacy (если RPC ещё не установлены) ───────────────────────────── */

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(len = 8) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < len; i++) code += CHARS[bytes[i] % CHARS.length];
  return code;
}

async function insertRoomLegacy(db, settings) {
  let lastErr = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await dbOp(
      db.from('rooms').insert([{
        code: randomCode(),
        host_client_id: getClientId(),
        status: 'lobby',
        total_rounds: settings.totalRounds ?? 5,
        timer_duration_sec: settings.timerDuration ?? 60,
        question_indices: []
      }]).select('*')
    );
    if (!error && data?.length) return data[0];
    lastErr = error;
    if (error && isDuplicateError(error)) continue;
    if (error) throwDbError(error, 'Не удалось создать комнату');
  }
  throw new Error(formatSupabaseError(lastErr));
}

async function createRoomLegacy(hostName, settings) {
  const clientId = getClientId();
  const db = requireSupabase();
  const room = await insertRoomLegacy(db, settings);
  const { data: playerRows, error: playerErr } = await dbOp(
    db.from('room_players').upsert({
      room_id: room.id,
      client_id: clientId,
      name: hostName,
      ready: false
    }, { onConflict: 'room_id,client_id' }).select('*')
  );
  if (playerErr) throwDbError(playerErr, 'Игрок не добавлен');
  // В новой схеме host_client_id хранится сразу в rooms при создании.
  return fetchRoomBundle(room.id);
}

async function joinRoomByCodeLegacy(code, playerName) {
  const clientId = getClientId();
  const normalized = code.trim().toUpperCase();
  const db = requireSupabase();
  const { data: room, error } = await dbOp(
    db.from('rooms').select('*').eq('code', normalized).maybeSingle()
  );
  if (error) throwDbError(error, 'Ошибка поиска комнаты');
  if (!room) throw new Error('Комната не найдена');
  const { error: joinErr } = await dbOp(
    db.from('room_players').upsert({
      room_id: room.id,
      client_id: clientId,
      name: playerName,
      ready: false
    }, { onConflict: 'room_id,client_id' })
  );
  if (joinErr) throwDbError(joinErr, 'Не удалось войти');
  return fetchRoomBundle(room.id);
}

/* ── Остальные операции ─────────────────────────────────────────────── */

function shuffleIndices(count) {
  const indices = Array.from({ length: FULL_QUESTIONS.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count);
}

export async function updateRoom(roomId, patch) {
  const filter = `id=eq.${encodeURIComponent(roomId)}`;
  return runMutation(
    () => requireSupabase().from('rooms').update(patch).eq('id', roomId).select().single(),
    () => restPatchRow('rooms', filter, patch)
  );
}

export async function updatePlayer(playerId, patch) {
  const filter = `id=eq.${encodeURIComponent(playerId)}`;
  return runMutation(
    () => requireSupabase().from('room_players').update(patch).eq('id', playerId).select().single(),
    () => restPatchRow('room_players', filter, patch)
  );
}

export async function setPlayerReady(roomId, ready) {
  const clientId = getClientId();

  try {
    const data = await callRpc('set_player_ready', {
      p_room_id: roomId,
      p_client_id: clientId,
      p_ready: ready
    });
    return data;
  } catch (error) {
    if (isMissingRpcError(error)) {
      // В legacy-режиме (старые RPC) fallback был update по playerId.
      // Для новой схемы legacy не поддерживаем.
      return null;
    }
    throwDbError(error, 'Не удалось изменить готовность');
  }
}

export async function startGameAsHost(roomId, settings) {
  const clientId = getClientId();
  const totalRounds = settings.totalRounds ?? 5;
  const indices = shuffleIndices(totalRounds);

  try {
    await updateRoom(roomId, {
      total_rounds: totalRounds,
      timer_duration_sec: settings.timerDuration ?? 60,
      question_indices: indices
    });
    const data = await callRpc('start_game', {
      p_room_id: roomId,
      p_client_id: clientId
    });
    if (data !== true) {
      // На всякий случай: если RPC вернул не boolean
      return fetchRoomBundle(roomId);
    }
    return fetchRoomBundle(roomId);
  } catch (error) {
    if (isMissingRpcError(error)) {
      await updateRoomSettings(roomId, settings);
      await updateRoom(roomId, {
        status: 'playing',
        question_indices: indices,
        current_round: 1,
        round_started_at: new Date().toISOString()
      });
      return fetchRoomBundle(roomId);
    }
    if (String(error?.message || '').toLowerCase().includes('not all ready')) {
      throw new Error('Все игроки должны нажать «Готов»');
    }
    if (String(error?.message || '').toLowerCase().includes('not host')) {
      throw new Error('Только хост может начать игру');
    }
    throwDbError(error, 'Не удалось начать игру');
  }
}

export async function advanceRound(roomId, nextRound, totalRounds) {
  if (nextRound > totalRounds) {
    return updateRoom(roomId, { status: 'finished', current_round: nextRound });
  }
  return updateRoom(roomId, {
    status: 'playing',
    current_round: nextRound,
    round_started_at: new Date().toISOString()
  });
}

export async function setRoundResult(roomId) {
  return updateRoom(roomId, { status: 'round_result' });
}

export async function resetPlayersForRound(roomId) {
  const { error } = await dbOp(
    requireSupabase().from('room_players').update({
      answered: false,
      answer_lat: null,
      answer_lng: null,
      answer_year: null
    }).eq('room_id', roomId)
  );
  if (error) throw error;
}

export async function submitAnswer(playerId, lat, lng, year, roundScore, totalScore) {
  return updatePlayer(playerId, {
    answered: true,
    answer_lat: lat,
    answer_lng: lng,
    answer_year: year,
    last_round_score: roundScore,
    score: totalScore
  });
}

export async function leaveRoom(roomId, playerId) {
  await dbOp(requireSupabase().from('room_players').delete().eq('id', playerId));
  const bundle = await fetchRoomBundle(roomId);
  if (bundle.players.length === 0) {
    await dbOp(requireSupabase().from('rooms').delete().eq('id', roomId));
  } else {
    // host_client_id больше не связан с playerId (uuid). Хост определяется по client_id.
    // Переназначение хоста при выходе в этой версии не делаем.
  }
}

export async function updateRoomSettings(roomId, settings) {
  return updateRoom(roomId, {
    total_rounds: settings.totalRounds,
    timer_duration_sec: settings.timerDuration
  });
}
