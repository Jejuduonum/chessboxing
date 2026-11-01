/**
 * POST /api/games — pulls a player's most recent games from Lichess, in order.
 *
 * Lichess only exposes a player's full game list to a logged-in client. Anonymous apps can
 * fetch notable games from the public stats endpoint, but not a chronological list. This
 * function closes that gap with one site-wide, read-only Lichess token held on the server
 * (LICHESS_TOKEN). Users still only ever type a username.
 *
 * - No token configured → `{ configured: false }`, and the app falls back to the public
 *   notable-games route. Nothing breaks; the list is just shorter.
 * - The token is never returned to the browser, and only public game data is passed through.
 * - Requests are cached for a minute per username/time control, and rate limited per IP.
 */
export const config = { maxDuration: 20 };

const USERNAME = /^[A-Za-z0-9_-]{2,30}$/;
const TIME_CONTROLS = ['rapid', 'blitz', 'classical'] as const;
type TimeControl = (typeof TIME_CONTROLS)[number];

const CACHE_MS = 60_000;
const RATE = { windowMs: 60 * 60 * 1000, max: 60 };

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });

/* ---------------- Cache & rate limit (per warm instance) ---------------- */
const cache = new Map<string, { at: number; body: unknown }>();
const hits = new Map<string, number[]>();

function limited(request: Request): boolean {
  const key =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local';
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE.windowMs);
  if (recent.length >= RATE.max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

/* ---------------- Lichess shape (only the fields the app uses) ---------------- */
interface RawExport {
  id?: string;
  speed?: string;
  createdAt?: number;
  status?: string;
  winner?: 'white' | 'black';
  players?: Record<'white' | 'black', { user?: { name?: string }; rating?: number }>;
  opening?: { name?: string };
  moves?: string;
  analysis?: { eval?: number; mate?: number; best?: string; judgment?: { name?: string } }[];
}

function trim(g: RawExport) {
  const side = (c: 'white' | 'black') => ({
    user: { name: g.players?.[c]?.user?.name ?? 'Anonymous' },
    rating: g.players?.[c]?.rating,
  });
  return {
    id: g.id,
    speed: g.speed,
    createdAt: g.createdAt,
    status: g.status,
    winner: g.winner,
    players: { white: side('white'), black: side('black') },
    opening: g.opening?.name ? { name: g.opening.name } : undefined,
    moves: g.moves,
    analysis: Array.isArray(g.analysis)
      ? g.analysis.map((a) => ({
          eval: a.eval,
          mate: a.mate,
          best: a.best,
          judgment: a.judgment?.name ? { name: a.judgment.name } : undefined,
        }))
      : undefined,
  };
}

export async function POST(request: Request): Promise<Response> {
  const token = process.env.LICHESS_TOKEN;
  if (!token) return json({ configured: false, games: [] });

  if (limited(request)) return json({ configured: true, error: 'rate_limited' }, 429);

  let body: { username?: unknown; tc?: unknown; max?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ configured: true, error: 'bad_request' }, 400);
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const tc = body.tc as TimeControl;
  const max = Math.min(Math.max(Number(body.max) || 12, 1), 30);

  if (!USERNAME.test(username)) return json({ configured: true, error: 'no_user' }, 404);
  if (!TIME_CONTROLS.includes(tc)) return json({ configured: true, games: [] });

  const key = `${username.toLowerCase()}:${tc}:${max}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return json(hit.body);

  const url =
    `https://lichess.org/api/games/user/${encodeURIComponent(username)}` +
    `?max=${Math.min(max * 3, 90)}&moves=true&evals=true&opening=true&tags=false&clocks=false&pgnInJson=false&sort=dateDesc`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/x-ndjson', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return json({ configured: true, error: 'upstream' }, 502);
  }

  if (res.status === 404) return json({ configured: true, error: 'no_user' }, 404);
  if (res.status === 401 || res.status === 403) {
    // A bad or expired token is a server setup problem, never the visitor's.
    console.error('Lichess rejected LICHESS_TOKEN — set a fresh read-only token in the host environment.');
    return json({ configured: true, error: 'token_invalid' }, 502);
  }
  if (res.status === 429) return json({ configured: true, error: 'rate_limited' }, 429);
  if (!res.ok) return json({ configured: true, error: 'upstream' }, 502);

  let games: ReturnType<typeof trim>[] = [];
  try {
    const text = await res.text();
    games = text
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => trim(JSON.parse(line) as RawExport))
      .filter((g) => !!g.id && !!g.moves && g.status !== 'started' && g.speed?.toLowerCase() === tc)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, max);
  } catch {
    return json({ configured: true, error: 'upstream' }, 502);
  }

  const payload = { configured: true, games, fetchedAt: Date.now() };
  cache.set(key, { at: Date.now(), body: payload });
  return json(payload);
}
