// UMD из index.html (jsdelivr). Не использовать esm.sh.
export const SUPABASE_URL = 'https://buchbzzalpsckbslvkef.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Y2hienphbHBzY2tic2x2a2VmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMDc3MTcsImV4cCI6MjA5NDU4MzcxN30.qQt4XYTVrwXodBa6iI7mIvbNFkOr6rIxdyg_Lu1DOTc';

// Стандартный fetch — без обёртки AbortController (меньше конфликтов с расширениями браузера)
export const supabase = typeof window !== 'undefined' && window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      // Иногда расширения/антивирусные прокси ломают соединения и кэш.
      // Принудительно отключаем кэш на запросах к Supabase.
      fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' })
    }
  })
  : null;

if (!supabase) {
  console.warn('Supabase SDK не загружен. Мультиплеер и онлайн-лидерборд недоступны.');
}
