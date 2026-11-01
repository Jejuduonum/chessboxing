import { Chess } from 'chess.js';
import type { TimeControl } from '../db';

/** One Lichess game, normalised for the review screens. */
export interface LichessGame {
  id: string;
  speed: string; // bullet | blitz | rapid | classical | correspondence | unknown
  createdAt: number;
  white: { name: string; rating?: number };
  black: { name: string; rating?: number };
  winner?: 'white' | 'black';
  status: string;
  opening?: string;
  moves: string[]; // SAN
  /** Lichess server analysis, one entry per ply (position after that move), if the game was analysed. */
  analysis?: { eval?: number; mate?: number; best?: string; judgment?: string }[];
  url: string;
}

export type GamesErrorKind = 'no_user' | 'not_found' | 'unavailable' | 'offline' | 'rate_limited' | 'error';
export class GamesError extends Error {
  constructor(public kind: GamesErrorKind) { super(kind); }
}

const cache = new Map<string, LichessGame>();
export const cachedGame = (id: string) => cache.get(id);

interface RawGame {
  id: string;
  speed?: string;
  createdAt?: number;
  status?: string;
  winner?: 'white' | 'black';
  players?: Record<'white' | 'black', { user?: { name?: string }; rating?: number }>;
  opening?: { name?: string };
  moves?: string;
  analysis?: { eval?: number; mate?: number; best?: string; judgment?: { name?: string } }[];
}

function normalise(raw: RawGame): LichessGame {
  const g: LichessGame = {
    id: raw.id,
    speed: raw.speed ?? 'unknown',
    createdAt: raw.createdAt ?? Date.now(),
    white: { name: raw.players?.white?.user?.name ?? 'Anonymous', rating: raw.players?.white?.rating },
    black: { name: raw.players?.black?.user?.name ?? 'Anonymous', rating: raw.players?.black?.rating },
    winner: raw.winner,
    status: raw.status ?? 'unknown',
    opening: raw.opening?.name,
    moves: (raw.moves ?? '').split(' ').filter(Boolean),
    analysis: raw.analysis?.map((a) => ({ eval: a.eval, mate: a.mate, best: a.best, judgment: a.judgment?.name })),
    url: `https://lichess.org/${raw.id}`,
  };
  cache.set(g.id, g);
  return g;
}

async function get(url: string, init: RequestInit & { accept?: string } = {}): Promise<Response> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new GamesError('offline');
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { Accept: init.accept ?? 'application/json', ...(init.body ? { 'Content-Type': 'text/plain' } : {}) } });
  } catch {
    throw new GamesError('offline');
  }
  if (res.status === 429) throw new GamesError('rate_limited');
  if (res.status === 401 || res.status === 403) throw new GamesError('unavailable');
  if (res.status === 404) throw new GamesError('not_found');
  if (!res.ok) throw new GamesError('error');
  return res;
}

const PERF: Record<TimeControl, string | null> = { rapid: 'rapid', blitz: 'blitz', classical: 'classical', puzzle: null };

/** Fetch up to 300 games by id in one request. Works without a login and includes Lichess analysis when present. */
export async function fetchGamesByIds(ids: string[]): Promise<LichessGame[]> {
  if (!ids.length) return [];
  const res = await get('https://lichess.org/api/games/export/_ids?moves=true&evals=true&opening=true', {
    method: 'POST',
    body: ids.slice(0, 300).join(','),
    accept: 'application/x-ndjson',
  });
  const text = await res.text();
  return text.split('\n').filter((l) => l.trim()).map((l) => normalise(JSON.parse(l) as RawGame)).filter((g) => g.moves.length > 0);
}

export interface NotableGames {
  latest: LichessGame[];
  worstLosses: LichessGame[];
  bestWins: LichessGame[];
}

export interface GameGroups extends NotableGames {
  /** Newest first. Populated only when the server has a Lichess token configured. */
  recent: LichessGame[];
  source: 'recent' | 'notable';
}

type StreakEnd = { gameId?: string };
type Streak = { cur?: { from?: StreakEnd; to?: StreakEnd }; max?: { from?: StreakEnd; to?: StreakEnd } };
interface PerfStat {
  stat?: {
    highest?: { gameId?: string };
    lowest?: { gameId?: string };
    bestWins?: { results?: { gameId: string }[] };
    worstLosses?: { results?: { gameId: string }[] };
    resultStreak?: { win?: Streak; loss?: Streak };
    playStreak?: { nb?: Streak; time?: Streak };
  };
}

/**
 * Username-only game discovery. Lichess no longer lists a player's games without a login, but each
 * time control's public stats name notable games: best wins, worst losses, streak games (which include
 * the most recent game) and rating highs/lows. We collect those ids and fetch them in one request.
 */
export async function fetchNotableGames(username: string, tc: TimeControl): Promise<NotableGames> {
  const perf = PERF[tc];
  if (!perf) return { latest: [], worstLosses: [], bestWins: [] };
  let stat: PerfStat['stat'];
  try {
    const res = await get(`https://lichess.org/api/user/${encodeURIComponent(username)}/perf/${perf}`);
    stat = ((await res.json()) as PerfStat).stat;
  } catch (e) {
    if (e instanceof GamesError && e.kind === 'not_found') throw new GamesError('no_user');
    throw e;
  }
  const worstIds = (stat?.worstLosses?.results ?? []).map((r) => r.gameId);
  const bestIds = (stat?.bestWins?.results ?? []).map((r) => r.gameId);
  const ends = (s?: Streak) => [s?.cur?.from, s?.cur?.to, s?.max?.from, s?.max?.to].map((e) => e?.gameId);
  const otherIds = [
    ...ends(stat?.resultStreak?.win), ...ends(stat?.resultStreak?.loss),
    ...ends(stat?.playStreak?.nb), ...ends(stat?.playStreak?.time),
    stat?.highest?.gameId, stat?.lowest?.gameId,
  ];
  const ids = [...new Set([...worstIds, ...bestIds, ...otherIds].filter((x): x is string => !!x))];
  const games = await fetchGamesByIds(ids);
  const byId = new Map(games.map((g) => [g.id, g]));
  const latest = [...games].sort((a, b) => b.createdAt - a.createdAt).slice(0, 2);
  const shown = new Set(latest.map((g) => g.id));
  const pick = (list: string[]) => list.filter((id) => !shown.has(id)).map((id) => byId.get(id)).filter((g): g is LichessGame => !!g);
  return { latest, worstLosses: pick(worstIds), bestWins: pick(bestIds) };
}

/**
 * Tries the server route that pulls the player's latest games in order. Returns null when the
 * server has no Lichess token (or can't be reached), so the caller can fall back to the
 * public notable-games route.
 */
export async function fetchRecentGames(username: string, tc: TimeControl, max = 12): Promise<LichessGame[] | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  try {
    const res = await fetch(new URL('api/games', document.baseURI), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, tc, max }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { configured?: boolean; games?: RawGame[] };
    if (!data.configured || !Array.isArray(data.games)) return null;
    return data.games.map(normalise).filter((g) => g.moves.length > 0);
  } catch {
    return null;
  }
}

/**
 * Everything the Chess tab shows: the latest games when the server can pull them,
 * plus the notable games that always work without a login.
 */
export async function fetchGamesToReview(username: string, tc: TimeControl, max = 12): Promise<GameGroups> {
  const settled = (p: Promise<NotableGames>) => p.then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e }));
  const notablePromise = settled(fetchNotableGames(username, tc));
  const recent = await fetchRecentGames(username, tc, max);
  const notable = await notablePromise;

  if (recent && recent.length) {
    const seen = new Set(recent.map((g) => g.id));
    return {
      recent,
      latest: [],
      worstLosses: notable.ok ? notable.v.worstLosses.filter((g) => !seen.has(g.id)) : [],
      bestWins: notable.ok ? notable.v.bestWins.filter((g) => !seen.has(g.id)) : [],
      source: 'recent',
    };
  }

  if (!notable.ok) throw notable.e;
  return { ...notable.v, recent: [], source: 'notable' };
}

/** Accepts a full Lichess URL (any of /id, /id/black, /id12345678) or a bare 8-character id. */
export function parseGameId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/lichess\.org\/([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?(?:\/|\?|#|$)/) ?? s.match(/^([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?$/);
  return m ? m[1] : null;
}

export async function fetchGame(id: string): Promise<LichessGame> {
  const [g] = await fetchGamesByIds([id]);
  if (!g) throw new GamesError('not_found');
  return g;
}

/** A pasted PGN becomes a local game (no Lichess analysis). */
export function gameFromPgn(pgn: string): LichessGame {
  const chess = new Chess();
  chess.loadPgn(pgn.trim());
  const h = chess.getHeaders();
  const moves = chess.history();
  if (!moves.length) throw new Error('No moves found in that PGN.');
  const result = h.Result;
  const id = `pgn-${Math.abs(hash(pgn)).toString(36)}`;
  const g: LichessGame = {
    id,
    speed: 'unknown',
    createdAt: h.Date && /^\d{4}\.\d{2}\.\d{2}$/.test(h.Date) ? new Date(h.Date.replace(/\./g, '-')).getTime() : Date.now(),
    white: { name: h.White ?? 'White', rating: h.WhiteElo ? Number(h.WhiteElo) : undefined },
    black: { name: h.Black ?? 'Black', rating: h.BlackElo ? Number(h.BlackElo) : undefined },
    winner: result === '1-0' ? 'white' : result === '0-1' ? 'black' : undefined,
    status: result === '1/2-1/2' ? 'draw' : result ? 'finished' : 'unknown',
    opening: h.Opening,
    moves,
    url: '',
  };
  cache.set(id, g);
  return g;
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export function gamesErrorText(kind: GamesErrorKind): string {
  switch (kind) {
    case 'no_user': return 'No Lichess account with that username. Check it in Settings.';
    case 'not_found': return 'Couldn’t find that game on Lichess. Check the link.';
    case 'unavailable': return 'Lichess didn’t share that game. Paste its PGN instead (on Lichess: Share & export → PGN).';
    case 'offline': return 'You’re offline. Games load when you’re back online.';
    case 'rate_limited': return 'Lichess asked us to slow down. Try again in a minute.';
    default: return 'Lichess didn’t respond. Try again shortly.';
  }
}

/** The user's colour in a game, matched case-insensitively by username. */
export function userColour(g: LichessGame, username: string): 'white' | 'black' {
  return g.black.name.toLowerCase() === username.toLowerCase() ? 'black' : 'white';
}
