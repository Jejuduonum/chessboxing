import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { db } from '../db';
import { cn, fmtDay, fmtInt, toISO } from '../lib/format';
import { cachedGame, fetchGame, GamesError, gamesErrorText, userColour, type LichessGame } from '../lib/games';
import { analyseGame, fmtEval, VERDICT_LABEL, VERDICT_MARK, winPct, type GameReview as Review, type MoveReview, type Verdict } from '../lib/review';
import { coachErrorText, requestCoaching } from '../lib/coach';
import { Board, EvalBar, VERDICT_COLOR } from '../components/Board';
import { BigButton, Icon, IconButton } from '../components/ui';
import { useData, useSettings } from '../state/data';
import { useNav } from '../state/nav';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BAD: Verdict[] = ['inaccuracy', 'mistake', 'blunder'];

export function GameReview({ gameId, onClose }: { gameId: string; onClose: () => void }) {
  const s = useSettings();
  const { today } = useData();
  const nav = useNav();
  const username = s.lichessUsername;
  const [game, setGame] = useState<LichessGame | null>(cachedGame(gameId) ?? null);
  const [review, setReview] = useState<Review | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coach, setCoach] = useState<'idle' | 'loading' | 'done' | string>('idle');
  const [ply, setPly] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { titleRef.current?.focus(); window.scrollTo(0, 0); }, []);

  const save = useCallback(async (r: Review, g: LichessGame) => {
    await db.gameReviews.put({ ...r, username: username.toLowerCase(), game: g });
  }, [username]);

  const runCoach = useCallback(async (g: LichessGame, r: Review) => {
    setCoach('loading');
    try {
      const c = await requestCoaching(g, r);
      const byPly = new Map(c.moves.map((m) => [m.ply, m.comment]));
      const next: Review = { ...r, summary: c.summary, keyLesson: c.keyLesson, coachAt: Date.now(), moves: r.moves.map((m) => ({ ...m, coach: byPly.get(m.ply) ?? m.coach })) };
      setReview(next);
      await save(next, g);
      setCoach('done');
    } catch (e) {
      setCoach(e instanceof Error ? e.message : 'failed');
    }
  }, [save]);

  // Load: stored review → game (cache, stored, or Lichess) → analysis → coach.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await db.gameReviews.get(gameId);
        const g = game ?? stored?.game ?? (await fetchGame(gameId));
        if (cancelled) return;
        setGame(g);
        if (stored) {
          setReview(stored);
          setCoach(stored.coachAt ? 'done' : 'idle');
          if (!stored.coachAt) void runCoach(g, stored);
          return;
        }
        const r = await analyseGame(g, userColour(g, username), (done, total) => { if (!cancelled) setProgress({ done, total }); });
        if (cancelled) return;
        setReview(r);
        await save(r, g);
        void runCoach(g, r);
      } catch (e) {
        if (!cancelled) setError(e instanceof GamesError ? gamesErrorText(e.kind) : 'Couldn’t analyse this game. Try again.');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const total = review?.moves.length ?? 0;
  const go = useCallback((p: number) => setPly(Math.max(0, Math.min(total, p))), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(ply - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(ply + 1); }
      if (e.key === 'Home') go(0);
      if (e.key === 'End') go(total);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, ply, total]);

  // Keep the active move visible in the move list.
  useEffect(() => {
    document.getElementById(`ply-${ply}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [ply]);

  const swipe = useRef<number | null>(null);
  const onPointerDown = (e: PointerEvent) => { swipe.current = e.clientX; };
  const onPointerUp = (e: PointerEvent) => {
    if (swipe.current === null) return;
    const dx = e.clientX - swipe.current;
    swipe.current = null;
    if (Math.abs(dx) > 40) go(ply + (dx < 0 ? 1 : -1));
  };

  const current: MoveReview | undefined = review && ply > 0 ? review.moves[ply - 1] : undefined;
  const orientation = review?.userColor ?? 'white';
  const isMine = current && review ? current.color === review.userColor : false;
  const keyMoments = useMemo(() => review?.moves.filter((m) => m.color === review.userColor && (m.verdict === 'mistake' || m.verdict === 'blunder')) ?? [], [review]);

  const opp = game && review ? (review.userColor === 'white' ? game.black : game.white) : null;
  const resultText = game && review ? (!game.winner ? 'Draw' : game.winner === review.userColor ? 'Won' : 'Lost') : '';
  const subtitle = game && opp
    ? `vs ${opp.name}${opp.rating ? ` (${fmtInt(opp.rating)})` : ''} · ${fmtDay(toISO(new Date(game.createdAt)))}${resultText ? ` · ${resultText}` : ''}`
    : 'Loading game…';

  return (
    <main className="mx-auto min-h-dvh max-w-app px-4 pb-[calc(env(safe-area-inset-bottom)+32px)]">
      <header className="flex items-center gap-3 pb-3 pt-[calc(env(safe-area-inset-top)+16px)]">
        <IconButton icon="left" label="Back to Chess" size={28} onClick={onClose} className="-ml-2" />
        <div className="min-w-0 flex-1">
          <h1 ref={titleRef} tabIndex={-1} className="h-page outline-none">Review</h1>
          <p className="truncate text-[15px] text-muted">{subtitle}</p>
        </div>
      </header>

      {error ? (
        <div role="alert" className="mt-4 rounded-3xl bg-surface p-5">
          <p className="flex items-start gap-2 text-[16px]"><Icon name="alert" size={20} className="mt-0.5 text-warn" /><span>{error}</span></p>
          <BigButton className="mt-4" onClick={onClose}>Back</BigButton>
        </div>
      ) : !review ? (
        <div className="mt-4 rounded-3xl bg-surface p-5" aria-live="polite">
          <p className="text-[18px] font-semibold">Analysing your game</p>
          <p className="mt-1 text-[15px] text-muted">
            {progress ? `Checking position ${progress.done} of ${progress.total} with Stockfish` : game ? 'Starting the engine…' : 'Loading the game from Lichess…'}
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ? Math.round((progress.done / progress.total) * 100) : 0}>
            <div className="h-full rounded-full bg-chess transition-[width] duration-200 ease-out" style={{ width: `${progress ? (progress.done / progress.total) * 100 : 4}%` }} />
          </div>
          <p className="mt-3 text-[14px] text-muted">Runs on your phone. Each game is only analysed once.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <section className="rounded-3xl bg-surface p-5" aria-label="Game summary">
            <div className="flex items-end gap-4">
              <p>
                <span className="block font-display text-[56px] font-bold leading-[0.9]">{Math.round(review.accuracy)}%</span>
                <span className="block text-[14px] text-muted">your accuracy</span>
              </p>
              <ul className="ml-auto grid grid-cols-3 gap-2 text-center" aria-label="Your move counts">
                {(['blunder', 'mistake', 'inaccuracy'] as Verdict[]).map((v) => (
                  <li key={v} className="min-w-[64px] rounded-xl bg-raised px-2 py-2">
                    <span className="block font-display text-[24px] font-bold leading-none" style={{ color: VERDICT_COLOR[v] }}>{review.counts[v]}</span>
                    <span className="mt-1 block text-[12px] text-muted">{review.counts[v] === 1 ? VERDICT_LABEL[v] : v === 'inaccuracy' ? 'Inaccuracies' : `${VERDICT_LABEL[v]}s`}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 border-t border-line pt-4">
              {review.summary ? (
                <>
                  <p className="mb-1 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-chess-ink"><Icon name="check" size={16} />Coach</p>
                  <p className="text-[16px] leading-relaxed">{review.summary}</p>
                  {review.keyLesson && <p className="mt-2 text-[15px] text-muted"><span className="font-semibold text-ink">Practise: </span>{review.keyLesson}</p>}
                </>
              ) : coach === 'loading' ? (
                <p className="flex items-center gap-2 text-[15px] text-muted" aria-live="polite">
                  <Icon name="refresh" size={18} className="animate-spin motion-reduce:animate-none" />The coach is writing notes for each of your moves…
                </p>
              ) : coach !== 'idle' && coach !== 'done' ? (
                <div>
                  <p className="text-[15px] text-muted">{coachErrorText(coach)}</p>
                  {coach !== 'not_configured' && game && (
                    <button onClick={() => void runCoach(game, review)} className="mt-2 min-h-[44px] font-semibold text-chess-ink underline underline-offset-4">Try again</button>
                  )}
                </div>
              ) : null}
              <p className="mt-3 text-[13px] text-muted">{review.source === 'lichess' ? 'Engine data from Lichess analysis.' : 'Engine data from Stockfish on this device.'}</p>
            </div>
          </section>

          {keyMoments.length > 0 && (
            <section aria-labelledby="moments">
              <h2 id="moments" className="mb-2 text-[16px] text-muted">Key moments</h2>
              <div className="flex flex-wrap gap-2">
                {keyMoments.map((m) => (
                  <button key={m.ply} onClick={() => go(m.ply)} aria-pressed={ply === m.ply}
                    className={cn('min-h-[44px] rounded-full border px-4 text-[15px] font-semibold', ply === m.ply ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink')}>
                    {m.moveNo}{m.color === 'white' ? '.' : '…'} {m.san}<span style={{ color: ply === m.ply ? undefined : VERDICT_COLOR[m.verdict] }}> {VERDICT_MARK[m.verdict]}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Board */}
          <section aria-label="Board" className="rounded-3xl bg-surface p-3">
            <div className="px-1 pb-3 pt-1">
              <EvalBar pct={winPct(current ? current.evalAfter : 20)} label={current ? fmtEval(current.evalAfter, current.mateAfter) : '+0.2'} flipped={orientation === 'black'} />
            </div>
            <div onPointerDown={onPointerDown} onPointerUp={onPointerUp} className="touch-pan-y">
              <Board
                fen={current?.fenAfter ?? START_FEN}
                orientation={orientation}
                lastMove={current?.uci}
                verdict={current?.verdict}
                bestMove={current && BAD.includes(current.verdict) ? current.bestUci : undefined}
                label={current ? `Position after ${current.moveNo}${current.color === 'white' ? '.' : '…'} ${current.san}` : 'Starting position'}
              />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="Move navigation">
              <button onClick={() => go(0)} aria-label="First move" className="flex h-12 items-center justify-center rounded-xl bg-raised text-[16px] font-semibold text-muted">Start</button>
              <button onClick={() => go(ply - 1)} aria-label="Previous move" className="flex h-12 items-center justify-center rounded-xl bg-raised text-[18px] font-bold">‹ Prev</button>
              <button onClick={() => go(ply + 1)} aria-label="Next move" className="flex h-12 items-center justify-center rounded-xl bg-ink text-[18px] font-bold text-bg">Next ›</button>
              <button onClick={() => go(total)} aria-label="Last move" className="flex h-12 items-center justify-center rounded-xl bg-raised text-[16px] font-semibold text-muted">End</button>
            </div>
          </section>

          {/* Feedback for the current move */}
          <section aria-live="polite" aria-label="Move feedback" className="rounded-3xl bg-surface p-5">
            {!current ? (
              <p className="text-[16px] text-muted">Start of the game. Tap Next, swipe the board, or jump to a key moment.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 text-[15px] font-bold text-on-accent" style={{ background: VERDICT_COLOR[current.verdict] }}>
                    <span aria-hidden="true">{VERDICT_MARK[current.verdict]}</span>{VERDICT_LABEL[current.verdict]}
                  </span>
                  <span className="text-[16px]">
                    {current.moveNo}{current.color === 'white' ? '.' : '…'} {isMine ? 'You played' : 'Opponent played'} <b>{current.san}</b>
                  </span>
                </div>
                <p className="mt-2 text-[15px] text-muted">
                  Evaluation {fmtEval(current.evalBefore)} → {fmtEval(current.evalAfter, current.mateAfter)}
                  {BAD.includes(current.verdict) && current.bestSan && current.bestSan !== current.san && <> · Better: <b className="text-chess-ink">{current.bestSan}</b> (blue arrow)</>}
                </p>
                {isMine && current.coach && (
                  <div className="mt-3">
                    <p className="mb-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-chess-ink">Coach</p>
                    <p className="text-[17px] leading-relaxed">{current.coach}</p>
                  </div>
                )}
                <div className="mt-3">
                  <p className="mb-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Engine</p>
                  <p className={cn('leading-relaxed', isMine && current.coach ? 'text-[15px] text-muted' : 'text-[17px]')}>{current.note}</p>
                </div>
              </>
            )}
          </section>

          {/* Move list */}
          <section aria-labelledby="moves-title" className="rounded-3xl bg-surface p-4">
            <h2 id="moves-title" className="mb-2 text-[16px] text-muted">Moves</h2>
            <ol className="grid max-h-[280px] grid-cols-[40px_1fr_1fr] gap-x-2 gap-y-1 overflow-y-auto">
              {Array.from({ length: Math.ceil(total / 2) }, (_, i) => {
                const w = review.moves[i * 2];
                const b = review.moves[i * 2 + 1];
                return (
                  <li key={i} className="contents">
                    <span className="flex items-center text-[14px] text-muted">{i + 1}.</span>
                    {[w, b].map((m, k) => m ? (
                      <button key={k} id={`ply-${m.ply}`} onClick={() => go(m.ply)} aria-current={ply === m.ply ? 'true' : undefined}
                        className={cn('flex min-h-[40px] items-center justify-between rounded-lg px-2 text-left text-[16px]', ply === m.ply ? 'bg-ink text-bg' : 'hover:bg-raised')}>
                        <span className={cn(m.color === review.userColor ? 'font-semibold' : '')}>{m.san}</span>
                        {m.verdict !== 'good' && (
                          <span aria-label={VERDICT_LABEL[m.verdict]} className="text-[13px] font-bold" style={{ color: ply === m.ply ? undefined : VERDICT_COLOR[m.verdict] }}>{VERDICT_MARK[m.verdict]}</span>
                        )}
                      </button>
                    ) : <span key={k} />)}
                  </li>
                );
              })}
            </ol>
          </section>

          <BigButton
            onClick={() => nav.openSession(undefined, {
              category: 'chess', type: 'review', durationMin: 15, intensity: 2,
              notes: opp ? `Reviewed game vs ${opp.name} · ${Math.round(review.accuracy)}% accuracy` : 'Game review',
            })}
          >
            Log as game review
          </BigButton>
          {game?.url && (
            <a href={game.url} target="_blank" rel="noopener noreferrer" className="flex min-h-[48px] items-center justify-center text-[16px] font-medium text-muted underline underline-offset-4">
              Open on Lichess
            </a>
          )}
        </div>
      )}
    </main>
  );
}
