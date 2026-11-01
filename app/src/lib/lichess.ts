import { db, TIME_CONTROLS, type TimeControl } from '../db';

export type LichessErrorKind = 'not_found' | 'offline' | 'rate_limited' | 'error';

export class LichessError extends Error {
  constructor(public kind: LichessErrorKind) {
    super(kind);
  }
}

export type RatingHistory = Record<TimeControl, [string, number][]>;

// Lichess has returned these names both capitalised and lowercase — match case-insensitively.
const NAMES: Record<string, TimeControl> = { rapid: 'rapid', blitz: 'blitz', classical: 'classical', puzzle: 'puzzle', puzzles: 'puzzle' };
const pad = (n: number) => String(n).padStart(2, '0');

async function getJSON<T>(url: string): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new LichessError('offline');
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new LichessError('offline');
  }
  if (res.status === 404) throw new LichessError('not_found');
  if (res.status === 429) throw new LichessError('rate_limited');
  if (!res.ok) throw new LichessError('error');
  return (await res.json()) as T;
}

const emptyHistory = () => Object.fromEntries(TIME_CONTROLS.map((tc) => [tc, [] as [string, number][]])) as RatingHistory;
const isEmpty = (h: RatingHistory) => TIME_CONTROLS.every((tc) => h[tc].length === 0);

/**
 * GET https://lichess.org/api/user/{username}/rating-history — public, no login.
 * If Lichess returns an empty history (it sometimes does, temporarily), fall back to
 * the profile's current ratings so the app still shows today's numbers.
 */
export async function fetchRatingHistory(username: string): Promise<RatingHistory> {
  const name = username.trim();
  if (!name) throw new LichessError('not_found');
  const base = `https://lichess.org/api/user/${encodeURIComponent(name)}`;
  const data = await getJSON<{ name: string; points: [number, number, number, number][] }[]>(`${base}/rating-history`);
  const out = emptyHistory();
  for (const row of Array.isArray(data) ? data : []) {
    const tc = NAMES[String(row.name).toLowerCase()];
    if (!tc) continue;
    // Lichess months are 0-based. Keep the last rating of each day.
    const byDay = new Map<string, number>();
    for (const [y, m, d, r] of row.points) byDay.set(`${y}-${pad(m + 1)}-${pad(d)}`, r);
    out[tc] = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }
  if (!isEmpty(out)) return out;

  const profile = await getJSON<{ perfs?: Record<string, { games?: number; rating?: number }> }>(base);
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  for (const [key, perf] of Object.entries(profile.perfs ?? {})) {
    const tc = NAMES[key.toLowerCase()];
    if (tc && perf.rating && (perf.games ?? 0) > 0) out[tc] = [[today, perf.rating]];
  }
  return out;
}

/**
 * Merge new points into the cache by date — a sync never wipes ratings already saved.
 * Pass `replace` when switching to a different Lichess account.
 */
export async function saveHistory(history: RatingHistory, { replace = false } = {}) {
  const fetchedAt = Date.now();
  await db.transaction('rw', db.ratingCache, async () => {
    if (replace) await db.ratingCache.clear();
    for (const tc of TIME_CONTROLS) {
      const existing = await db.ratingCache.get(tc);
      const byDay = new Map<string, number>(existing?.points ?? []);
      for (const [date, rating] of history[tc]) byDay.set(date, rating);
      const points = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      await db.ratingCache.put({ timeControl: tc, points, fetchedAt });
    }
  });
}

export function lichessErrorText(kind: LichessErrorKind): string {
  switch (kind) {
    case 'not_found':
      return 'No Lichess account with that username. Check the spelling.';
    case 'offline':
      return 'You’re offline. Ratings will sync when you’re back online.';
    case 'rate_limited':
      return 'Lichess asked us to slow down. Try again in a minute.';
    default:
      return 'Lichess didn’t respond. Try again shortly.';
  }
}

export const latestRating = (points: [string, number][] | undefined) =>
  points && points.length ? points[points.length - 1][1] : null;
