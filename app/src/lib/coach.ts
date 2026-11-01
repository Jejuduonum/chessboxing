import type { LichessGame } from './games';
import { authHeader } from './supabase';
import { fmtEval, VERDICT_LABEL, type GameReview } from './review';

export type CoachError = 'not_configured' | 'not_chess' | 'offline' | 'rate_limited' | 'failed';

export interface CoachResult {
  summary: string;
  keyLesson: string;
  moves: { ply: number; comment: string }[];
}

/** Ask the server-side coach (POST api/coach) to explain the user's moves. */
export async function requestCoaching(game: LichessGame, review: GameReview): Promise<CoachResult> {
  const me = review.userColor === 'white' ? game.white : game.black;
  const opp = review.userColor === 'white' ? game.black : game.white;
  const result = game.winner ? (game.winner === review.userColor ? 'student won' : 'student lost') : 'draw or unfinished';
  const body = {
    userColor: review.userColor,
    userRating: me.rating,
    opponentRating: opp.rating,
    result,
    allMovesSan: review.moves.map((m) => m.san),
    moves: review.moves.filter((m) => m.color === review.userColor).map((m) => ({
      ply: m.ply, moveNo: m.moveNo, san: m.san, fenBefore: m.fenBefore,
      verdict: VERDICT_LABEL[m.verdict],
      evalBefore: fmtEval(m.evalBefore), evalAfter: fmtEval(m.evalAfter, m.mateAfter),
      bestSan: m.bestSan && m.bestSan !== m.san ? m.bestSan : undefined,
      engineNote: m.note,
    })),
  };
  let res: Response;
  try {
    res = await fetch(new URL('api/coach', document.baseURI), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('offline' satisfies CoachError);
  }
  if (res.status === 404 || res.status === 503) throw new Error('not_configured' satisfies CoachError);
  if (res.status === 401) throw new Error('signed_out');
  if (res.status === 400) throw new Error('not_chess' satisfies CoachError);
  if (res.status === 429) throw new Error('rate_limited' satisfies CoachError);
  if (!res.ok) throw new Error('failed' satisfies CoachError);
  const data = (await res.json()) as CoachResult;
  if (!data || !Array.isArray(data.moves)) throw new Error('failed' satisfies CoachError);
  return data;
}

export function coachErrorText(kind: string): string {
  switch (kind) {
    case 'not_configured': return 'AI coach isn’t set up yet — add an Anthropic API key to the server (see README). Engine feedback is shown for every move meanwhile.';
    case 'not_chess': return 'The coach only reviews legal chess games, and this one didn’t check out. Engine feedback is still shown for every move.';
    case 'signed_out': return 'Sign in to get AI coach notes. Engine feedback is shown for every move meanwhile.';
    case 'offline': return 'You’re offline. Engine feedback still works; coach notes need a connection.';
    case 'rate_limited': return 'The coach is busy. Try again in a minute.';
    default: return 'The coach couldn’t review this game. Try again.';
  }
}
