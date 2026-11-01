import { useMemo } from 'react';
import { Chess, type Square } from 'chess.js';
import type { Verdict } from '../lib/review';

// Filled glyphs for both sides (coloured via fill/stroke); U+FE0E forces text, not emoji, rendering.
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const VS15 = '︎';

export const VERDICT_COLOR: Record<Verdict, string> = {
  best: 'var(--good)', good: 'var(--good)', inaccuracy: 'var(--warn)', mistake: '#FF8A3D', blunder: 'var(--fit)',
};
const VERDICT_SYMBOL: Record<Verdict, string> = { best: '★', good: '✓', inaccuracy: '?!', mistake: '?', blunder: '??' };

/** Static SVG board: pieces, last-move highlight, verdict badge and an arrow for the better move. */
export function Board({ fen, orientation, lastMove, bestMove, verdict, label }: {
  fen: string;
  orientation: 'white' | 'black';
  lastMove?: string; // uci
  bestMove?: string; // uci — drawn as an arrow
  verdict?: Verdict;
  label: string;
}) {
  const board = useMemo(() => new Chess(fen).board(), [fen]);
  const S = 100;
  const files = 'abcdefgh';
  const pos = (sq: string) => {
    const f = files.indexOf(sq[0]);
    const r = Number(sq[1]) - 1;
    const x = orientation === 'white' ? f : 7 - f;
    const y = orientation === 'white' ? 7 - r : r;
    return { x: x * S, y: y * S };
  };
  const from = lastMove?.slice(0, 2), to = lastMove?.slice(2, 4);
  const arrow = bestMove && bestMove !== lastMove ? { a: pos(bestMove.slice(0, 2)), b: pos(bestMove.slice(2, 4)) } : null;

  const squares = [];
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const sq = (files[f] + (r + 1)) as Square;
    const { x, y } = pos(sq);
    const light = (f + r) % 2 === 1;
    const hl = sq === from || sq === to;
    squares.push(
      <rect key={sq} x={x} y={y} width={S} height={S} fill={hl ? (light ? '#CDD8F5' : '#7F98D8') : light ? '#E7E3DA' : '#8A8F9C'} />,
    );
  }

  const pieces = [];
  for (const row of board) for (const p of row) {
    if (!p) continue;
    const { x, y } = pos(p.square);
    const white = p.color === 'w';
    pieces.push(
      <text
        key={p.square}
        x={x + S / 2}
        y={y + S * 0.8}
        textAnchor="middle"
        fontSize={S * 0.82}
        fill={white ? '#FAFAF7' : '#18181B'}
        stroke={white ? '#18181B' : '#FAFAF7'}
        strokeWidth={white ? 3 : 1.5}
        paintOrder="stroke"
        fontFamily='"Segoe UI Symbol","Apple Symbols","Noto Sans Symbols 2","DejaVu Sans",serif'
      >
        {GLYPH[p.type] + VS15}
      </text>,
    );
  }

  const coords = [];
  for (let i = 0; i < 8; i++) {
    const file = orientation === 'white' ? files[i] : files[7 - i];
    const rank = orientation === 'white' ? 8 - i : i + 1;
    coords.push(
      <text key={`f${i}`} x={i * S + S - 6} y={8 * S - 6} textAnchor="end" fontSize={16} fontWeight={600} fill={(i % 2 === 0) ? '#E7E3DA' : '#8A8F9C'} fontFamily="Inter, sans-serif">{file}</text>,
      <text key={`r${i}`} x={6} y={i * S + 20} fontSize={16} fontWeight={600} fill={(i % 2 === 0) ? '#8A8F9C' : '#E7E3DA'} fontFamily="Inter, sans-serif">{rank}</text>,
    );
  }

  return (
    <svg viewBox={`0 0 ${8 * S} ${8 * S}`} role="img" aria-label={label} className="block h-auto w-full select-none rounded-xl">
      <defs>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#3E7BFA" />
        </marker>
      </defs>
      {squares}
      {coords}
      {pieces}
      {arrow && (
        <line
          x1={arrow.a.x + S / 2} y1={arrow.a.y + S / 2} x2={arrow.b.x + S / 2} y2={arrow.b.y + S / 2}
          stroke="#3E7BFA" strokeWidth={16} strokeLinecap="round" opacity={0.85} markerEnd="url(#arrowhead)"
        />
      )}
      {verdict && to && (() => {
        const { x, y } = pos(to);
        return (
          <g>
            <circle cx={x + S - 14} cy={y + 14} r={20} fill={VERDICT_COLOR[verdict]} stroke="#0E0E10" strokeWidth={3} />
            <text x={x + S - 14} y={y + 21} textAnchor="middle" fontSize={verdict === 'inaccuracy' || verdict === 'blunder' ? 17 : 21} fontWeight={800} fill="#0E0E10" fontFamily="Inter, sans-serif">
              {VERDICT_SYMBOL[verdict]}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

/** Horizontal evaluation bar: share of white winning chances. */
export function EvalBar({ pct, label, flipped }: { pct: number; label: string; flipped: boolean }) {
  const white = Math.max(2, Math.min(98, pct));
  return (
    <div className="flex items-center gap-3" aria-label={`Evaluation ${label}`}>
      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-[#18181B] ring-1 ring-line">
        <div
          className="absolute inset-y-0 bg-[#FAFAF7] transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${white}%`, [flipped ? 'right' : 'left']: 0 }}
        />
      </div>
      <span className="w-14 shrink-0 text-right font-display text-[20px] font-bold tabular-nums">{label}</span>
    </div>
  );
}
