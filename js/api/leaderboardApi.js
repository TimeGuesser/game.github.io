import { supabase } from '../config/supabase.js';
import { LEADERBOARD_KEY, saveJSON, loadJSON } from '../storage/storage.js';
import { withTimeout } from '../utils/withTimeout.js';

const TABLE_NAME = 'leaderboard';

export async function getLeaderboard() {
  try {
    if (!supabase) throw new Error('Supabase offline');
    const { data, error } = await withTimeout(
      supabase.from(TABLE_NAME).select('*').order('points', { ascending: false }).limit(500)
    );

    if (error) throw error;
    if (Array.isArray(data)) {
      return data.map((r) => ({ ...r, group: r.grp || r.group || '—' }));
    }
  } catch (e) {
    console.warn('Leaderboard load failed:', e.message);
  }
  try {
    return loadJSON(LEADERBOARD_KEY, []);
  } catch {
    return [];
  }
}

export async function saveLeaderboardEntry(profile, points) {
  if (!profile?.name) return false;

  const entry = {
    name: profile.name,
    org: profile.org || 'Не указано',
    course: profile.course || '—',
    grp: profile.group || profile.grp || '—',
    points: Math.floor(points),
    created_at: new Date().toISOString()
  };

  try {
    const list = loadJSON(LEADERBOARD_KEY, []);
    list.push({ ...entry, group: entry.grp });
    saveJSON(LEADERBOARD_KEY, list);
  } catch {}

  try {
    if (!supabase) throw new Error('Supabase offline');
    const { error } = await withTimeout(supabase.from(TABLE_NAME).insert([entry]));
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('Supabase leaderboard write failed:', e.message);
    return false;
  }
}
