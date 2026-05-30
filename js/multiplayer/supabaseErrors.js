export function formatSupabaseError(error) {
  if (!error) return 'Неизвестная ошибка Supabase';
  if (typeof error === 'string') return error;
  const parts = [
    error.message,
    error.details,
    error.hint,
    error.code ? `код: ${error.code}` : ''
  ].filter(Boolean);
  return parts.join(' — ') || 'Ошибка Supabase';
}

export function isNetworkFailure(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return msg.includes('failed to fetch')
    || msg.includes('networkerror')
    || msg.includes('connection reset')
    || msg.includes('err_connection')
    || msg.includes('quic')
    || msg.includes('abort')
    || msg.includes('network request failed');
}

export function humanizeError(error) {
  const raw = formatSupabaseError(error).toLowerCase();
  if (raw.includes('not all ready')) return 'Все игроки должны нажать «Готов».';
  if (raw.includes('room not found')) return 'Комната не найдена. Проверьте код.';
  if (raw.includes('game finished')) return 'Игра в этой комнате уже завершена.';
  if (raw.includes('room full')) return 'Комната заполнена (макс. 30 игроков).';
  if (raw.includes('late join')) return 'Позднее подключение в эту комнату запрещено.';
  if (raw.includes('pgrst202') || raw.includes('could not find the function')) {
    return 'Выполните supabase/migrations/002_rpc_rooms.sql в SQL Editor.';
  }
  if (raw.includes('does not exist') || raw.includes('pgrst205')) {
    return 'Таблицы не найдены. Выполните supabase/setup_complete.sql';
  }
  if (isNetworkFailure(error) || raw.includes('failed to fetch')) {
    return 'Сбой сети при ответе Supabase (часто расширения браузера: AdBlock, VPN). Попробуйте режим InPrivate, отключите расширения или повторите через 2–3 сек.';
  }
  if (raw.includes('jwt') || raw.includes('401') || raw.includes('unauthorized')) {
    return 'Неверный API-ключ. Скопируйте anon key из Supabase → Settings → API в js/config/supabase.js';
  }
  return formatSupabaseError(error);
}

export function isDuplicateError(error) {
  if (!error) return false;
  if (error.code === '23505') return true;
  const status = error.status ?? error.statusCode;
  if (status === 409) return true;
  const msg = String(error.message || error.details || '').toLowerCase();
  return msg.includes('duplicate') || msg.includes('unique') || msg.includes('conflict');
}

export function isMissingTableError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('does not exist') || error?.code === '42P01' || error?.code === 'PGRST205';
}

export function isMissingRpcError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return error?.code === 'PGRST202' || msg.includes('could not find the function');
}
