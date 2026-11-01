import { Chess } from 'chess.js';
import type { LichessGame } from './games';
import { Engine } from './engine';

export type Verdict = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface MoveReview {
  ply: number; // 1-based
  moveNo: number;
  color: 'white' | 'black';
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  evalBefore: number; // white POV, centipawns (mates mapped to ±10000)
  evalAfter: number;
  mateAfter?: number; // white POV
  bestUci?: string; // best move in the position before this move
  bestSan?: string;
  verdict: Verdict;
  winLoss: number; // winning-chance drop for the mover, 0–100
  note: string; // engine-written feedback (always present)
  coach?: string; // AI-written feedback (when available)
}

export interface GameReview {
  gameId: string;
  userColor: 'white' | 'black';
  source: 'lichess' | 'engine';
  analysedAt: number;
  accuracy: number; // user's accuracy, 0–100
  counts: Record<Verdict, number>; // user's moves only
  moves: MoveReview[];
  summary?: string;
  keyLesson?: string;
  coachAt?: number;
}

/* ---------------- Maths (Lichess-style) ---------------- */
const clampCp = (cp: number) => Math.max(-1500, Math.min(1500, cp));
/** Winning chances 0–100 for white. */
export const winPct = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clampCp(cp))) - 1);
const moveAccuracy = (loss: number) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));

export function verdictFor(loss: number, playedBest: boolean): Verdict {
  if (playedBest || loss < 2) return 'best';
  if (loss < 10) return 'good';
  if (loss < 20) return 'inaccuracy';
  if (loss < 30) return 'mistake';
  return 'blunder';
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  best: 'Best', good: 'Good', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder',
};
export const VERDICT_MARK: Record<Verdict, string> = { best: '★', good: '✓', inaccuracy: '?!', mistake: '?', blunder: '??' };

export function fmtEval(cp: number, mate?: number): string {
  if (mate !== undefined && mate !== 0) return `${mate > 0 ? '' : '−'}M${Math.abs(mate)}`;
  if (Math.abs(cp) >= 9000) return cp > 0 ? 'Mate' : '−Mate';
  const v = cp / 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
}

const PIECE: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

function uciToSan(fen: string, uci?: string): string | undefined {
  if (!uci) return undefined;
  try {
    const c = new Chess(fen);
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return m?.san;
  } catch {
    return undefined;
  }
}

/** Plain-English, engine-grounded feedback. Never invents tactics beyond what the data shows. */
function engineNote(m: Omit<MoveReview, 'note'>, isUser: boolean, nextBestSan?: string): string {
  const better = m.bestSan && m.bestSan !== m.san ? m.bestSan : undefined;
  let bestDetail = '';
  if (better && m.bestUci) {
    try {
      const c = new Chess(m.fenBefore);
      const mv = c.move({ from: m.bestUci.slice(0, 2), to: m.bestUci.slice(2, 4), promotion: m.bestUci[4] });
      if (mv?.captured) bestDetail = `, winning the ${PIECE[mv.captured]} on ${mv.to}`;
      else if (mv?.san.includes('#')) bestDetail = ', which is checkmate';
      else if (mv?.san.includes('+')) bestDetail = ', with check';
    } catch { /* ignore */ }
  }
  const mateNote = m.mateAfter !== undefined && Math.sign(m.mateAfter) !== (m.color === 'white' ? 1 : -1)
    ? ` It allows mate in ${Math.abs(m.mateAfter)}.` : '';
  const swing = `${fmtEval(m.evalBefore)} → ${fmtEval(m.evalAfter, m.mateAfter)}`;

  if (!isUser) {
    if (m.verdict === 'mistake' || m.verdict === 'blunder')
      return `Your opponent slipped (${swing}).${nextBestSan ? ` Look for ${nextBestSan} to punish it.` : ''}`;
    if (m.verdict === 'inaccuracy') return `A small inaccuracy from your opponent (${swing}).`;
    return 'A solid move from your opponent.';
  }
  switch (m.verdict) {
    case 'best': return `${m.san} is the engine’s top choice. Nicely played.`;
    case 'good': return better ? `Solid. ${better} was slightly more precise, but this keeps things level (${swing}).` : `Solid move — the evaluation barely changes (${swing}).`;
    case 'inaccuracy': return `Inaccuracy. ${better ? `${better}${bestDetail} was more precise. ` : ''}You gave away about ${Math.round(m.winLoss)}% winning chances (${swing}).`;
    case 'mistake': return `Mistake. ${better ? `${better}${bestDetail} was much better. ` : ''}The position slipped from ${swing}.${mateNote}`;
    case 'blunder': return `Blunder. ${better ? `${better}${bestDetail} was needed. ` : ''}This swung the game from ${swing}.${mateNote}`;
  }
}

function terminalEval(fen: string): number | null {
  const c = new Chess(fen);
  if (c.isCheckmate()) return c.turn() === 'w' ? -10000 : 10000;
  if (c.isDraw() || c.isStalemate()) return 0;
  return null;
}

/**
 * Build a full review. Uses Lichess's own analysis when the game has it,
 * otherwise runs Stockfish on every position (reporting progress).
 */
export async function analyseGame(
  game: LichessGame,
  userColor: 'white' | 'black',
  onProgress?: (done: number, total: number) => void,
): Promise<GameReview> {
  const chess = new Chess();
  const fens = [chess.fen()];
  const ucis: string[] = [];
  const sans: string[] = [];
  for (const san of game.moves) {
    const mv = chess.move(san);
    ucis.push(mv.from + mv.to + (mv.promotion ?? ''));
    sans.push(mv.san);
    fens.push(chess.fen());
  }
  const n = sans.length;
  const evals: number[] = new Array(n + 1).fill(0);
  const mates: (number | undefined)[] = new Array(n + 1).fill(undefined);
  const bestAt: (string | undefined)[] = new Array(n + 1).fill(undefined);
  let source: GameReview['source'] = 'engine';

  const lichessUsable = game.analysis && game.analysis.length >= n - 1;
  if (lichessUsable && game.analysis) {
    source = 'lichess';
    evals[0] = 20;
    for (let i = 1; i <= n; i++) {
      const a = game.analysis[i - 1];
      const term = terminalEval(fens[i]);
      if (term !== null) { evals[i] = term; continue; }
      if (!a) { evals[i] = evals[i - 1]; continue; }
      if (a.mate !== undefined) { mates[i] = a.mate; evals[i] = a.mate > 0 ? 10000 - a.mate : -10000 - a.mate; }
      else evals[i] = a.eval ?? evals[i - 1];
      if (a.best) bestAt[i - 1] = a.best; // Lichess puts the better alternative on the move it judges
    }
    onProgress?.(n + 1, n + 1);
  } else {
    const engine = new Engine();
    try {
      for (let i = 0; i <= n; i++) {
        const term = terminalEval(fens[i]);
        if (term !== null) evals[i] = term;
        else {
          const r = await engine.evaluate(fens[i], 12);
          evals[i] = r.cp;
          mates[i] = r.mate;
          bestAt[i] = r.bestUci;
        }
        onProgress?.(i + 1, n + 1);
      }
    } finally {
      engine.terminate();
    }
  }

  const draft = sans.map((san, idx) => {
    const ply = idx + 1;
    const color: 'white' | 'black' = idx % 2 === 0 ? 'white' : 'black';
    const sign = color === 'white' ? 1 : -1;
    const before = winPct(evals[idx] * sign);
    const after = winPct(evals[ply] * sign);
    const winLoss = Math.max(0, before - after);
    const bestUci = bestAt[idx];
    const playedBest = !!bestUci && bestUci === ucis[idx];
    return {
      ply, moveNo: Math.ceil(ply / 2), color, san, uci: ucis[idx],
      fenBefore: fens[idx], fenAfter: fens[ply],
      evalBefore: evals[idx], evalAfter: evals[ply], mateAfter: mates[ply],
      bestUci, bestSan: uciToSan(fens[idx], bestUci),
      verdict: verdictFor(winLoss, playedBest), winLoss,
    };
  });

  const moves: MoveReview[] = draft.map((m, i) => ({
    ...m,
    note: engineNote(m, m.color === userColor, draft[i + 1]?.bestSan),
  }));

  const mine = moves.filter((m) => m.color === userColor);
  const counts = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 } as Record<Verdict, number>;
  mine.forEach((m) => { counts[m.verdict]++; });
  const accuracy = mine.length ? mine.reduce((a, m) => a + moveAccuracy(m.winLoss), 0) / mine.length : 0;

  return { gameId: game.id, userColor, source, analysedAt: Date.now(), accuracy, counts, moves };
}
