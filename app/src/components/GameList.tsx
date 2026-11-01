import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, TC_LABEL, type TimeControl } from '../db';
import { cn, fmtInt, relDay, toISO } from '../lib/format';
import { fetchGame, fetchGamesToReview, gameFromPgn, GamesError, gamesErrorText, parseGameId, userColour, type GameGroups, type GamesErrorKind, type LichessGame } from '../lib/games';
import { useNav } from '../state/nav';
import { Icon, SectionLabel, inputClass } from './ui';

/**
 * Chess tab section: games to review, pulled from Lichess for the username alone.
 * With a server-side Lichess token the list is your latest games in order; otherwise it falls
 * back to the notable games Lichess shares publicly (Latest · Worst losses · Best wins).
 * Tapping a row opens it and Stockfish analyses it on the device.
 */
export function GameList({ username, tc, today }: { username: string; tc: TimeControl; today: string }) {
  const nav = useNav();
  const [groups, setGroups] = useState<GameGroups | null>(null);
  const [error, setError] = useState<GamesErrorKind | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const reviews = useLiveQuery(() => db.gameReviews.where('username').equals(username.toLowerCase()).toArray(), [username], []);
  const accuracyById = new Map(reviews.map((r) => [r.gameId, r.accuracy]));

  useEffect(() => {
    if (tc === 'puzzle') { setGroups(null); setError(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGamesToReview(username, tc)
      .then((g) => { if (!cancelled) setGroups(g); })
      .catch((e) => { if (!cancelled) { setGroups(null); setError(e instanceof GamesError ? e.kind : 'error'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [username, tc, attempt]);

  const empty = groups && !groups.recent.length && !groups.latest.length && !groups.worstLosses.length && !groups.bestWins.length;
  // Previously reviewed games stay reachable when the list can't load.
  const pastReviews = [...reviews].sort((a, b) => b.analysedAt - a.analysedAt).slice(0, 5);
  const row = (g: LichessGame, note?: string) => (
    <GameRow key={g.id} game={g} username={username} today={today} note={note} accuracy={accuracyById.get(g.id)} onOpen={() => nav.openReview(g.id)} />
  );

  return (
    <section aria-labelledby="review-games">
      <div className="mt-2 flex items-center justify-between gap-3">
        <SectionLabel className="mb-2"><span id="review-games">Review your games</span></SectionLabel>
        {tc !== 'puzzle' && (
          <button
            onClick={() => setAttempt((n) => n + 1)}
            disabled={loading}
            aria-label="Pull your latest games from Lichess"
            className="mb-2 inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold text-chess-ink disabled:opacity-50"
          >
            <Icon name="refresh" size={17} className={cn(loading && 'animate-spin motion-reduce:animate-none')} />
            <span>{loading ? 'Pulling…' : 'Refresh'}</span>
          </button>
        )}
      </div>

      {tc === 'puzzle' ? (
        <p className="rounded-2xl bg-surface px-5 py-4 text-[16px] text-muted">Pick Rapid, Blitz or Classical above to see games to review.</p>
      ) : loading ? (
        <ul aria-busy="true" aria-label="Pulling games from Lichess" className="overflow-hidden rounded-2xl bg-surface">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex min-h-[68px] items-center gap-3 border-b border-line px-4 last:border-0">
              <span className="h-10 w-10 animate-pulse rounded-xl bg-raised motion-reduce:animate-none" />
              <span className="h-4 flex-1 animate-pulse rounded bg-raised motion-reduce:animate-none" />
            </li>
          ))}
        </ul>
      ) : error ? (
        <div className="rounded-2xl bg-surface px-5 py-4">
          <p className="flex items-start gap-2 text-[15px] text-ink"><Icon name="alert" size={20} className="mt-0.5 text-warn" /><span>{gamesErrorText(error)}</span></p>
          {error !== 'no_user' && (
            <button onClick={() => setAttempt((n) => n + 1)} className="mt-2 min-h-[44px] text-[16px] font-semibold text-chess-ink underline underline-offset-4">Try again</button>
          )}
        </div>
      ) : empty ? (
        <p className="rounded-2xl bg-surface px-5 py-4 text-[16px] text-muted">No finished {TC_LABEL[tc].toLowerCase()} games yet. Play one on Lichess, then tap Refresh.</p>
      ) : groups ? (
        <div className="space-y-4">
          {groups.recent.length > 0 && <Group title="Latest games" hint="newest first" items={groups.recent.map((g) => row(g))} />}
          {groups.recent.length === 0 && <Group title="Latest" items={groups.latest.map((g) => row(g))} />}
          <Group title="Worst losses" hint="The most useful games to study" items={groups.worstLosses.map((g) => row(g))} />
          <Group title="Best wins" items={groups.bestWins.map((g) => row(g))} />
          <p className="text-[13px] leading-snug text-muted">
            {groups.source === 'recent'
              ? 'Pulled from Lichess for @' + username + '. Tap a game and Stockfish reviews every move on your phone.'
              : 'Lichess only shares notable games without a login. For any other game, paste its link or PGN below.'}
          </p>
        </div>
      ) : null}

      {(error || tc === 'puzzle') && pastReviews.length > 0 && (
        <div className="mt-4">
          <Group title="Your past reviews" items={pastReviews.map((r) => (
            <GameRow key={r.gameId} game={r.game} username={username} today={today} accuracy={r.accuracy} onOpen={() => nav.openReview(r.gameId)} />
          ))} />
        </div>
      )}

      <ReviewByLink onReady={(id) => nav.openReview(id)} />
    </section>
  );
}

function Group({ title, hint, items }: { title: string; hint?: string; items: JSX.Element[] }) {
  if (!items.length) return null;
  const id = `grp-${title.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <h3 id={id} className="mb-1.5 flex items-baseline gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
        {title}{hint && <span className="text-[13px] font-normal normal-case tracking-normal">· {hint}</span>}
      </h3>
      <ul aria-labelledby={id} className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">{items}</ul>
    </div>
  );
}

function GameRow({ game, username, today, accuracy, note, onOpen }: { game: LichessGame; username: string; today: string; accuracy?: number; note?: string; onOpen: () => void }) {
  const color = userColour(game, username);
  const me = color === 'white' ? game.white : game.black;
  const opp = color === 'white' ? game.black : game.white;
  const result = !game.winner ? 'D' : game.winner === color ? 'W' : 'L';
  const resultLabel = result === 'W' ? 'Won' : result === 'L' ? 'Lost' : 'Draw';
  return (
    <li>
      <button onClick={onOpen} className="flex min-h-[68px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-raised" aria-label={`${resultLabel} vs ${opp.name}, review game`}>
        <span
          aria-hidden="true"
          className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-[20px] font-bold',
            result === 'W' ? 'bg-[color-mix(in_srgb,var(--good)_18%,transparent)] text-good' : result === 'L' ? 'bg-fit-soft text-fit-ink' : 'bg-raised text-muted')}
        >
          {result}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px]">vs {opp.name}{opp.rating ? ` (${fmtInt(opp.rating)})` : ''}</span>
          <span className="block truncate text-[14px] text-muted">
            {relDay(toISO(new Date(game.createdAt)), today)}{game.opening ? ` · ${game.opening}` : ''}{me.rating ? ` · you ${fmtInt(me.rating)}` : ''}{note ? ` · ${note}` : ''}
          </span>
        </span>
        {accuracy !== undefined ? (
          <span className="shrink-0 text-right">
            <span className="block font-display text-[22px] font-bold leading-none">{Math.round(accuracy)}%</span>
            <span className="block text-[12px] text-muted">accuracy</span>
          </span>
        ) : game.analysis ? (
          <span className="shrink-0 rounded-full bg-raised px-2.5 py-1 text-[12px] font-semibold text-muted">Analysed</span>
        ) : (
          <Icon name="right" size={20} className="text-muted" />
        )}
      </button>
    </li>
  );
}

function ReviewByLink({ onReady }: { onReady: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const text = value.trim();
    if (!text) { setError('Paste a Lichess game link or a PGN.'); return; }
    setBusy(true);
    setError(null);
    try {
      const id = parseGameId(text);
      if (id) onReady((await fetchGame(id)).id);
      else onReady(gameFromPgn(text).id);
      setValue('');
      setOpen(false);
    } catch (e) {
      setError(e instanceof GamesError ? gamesErrorText(e.kind) : 'That doesn’t look like a Lichess link or a valid PGN.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-3 flex min-h-[52px] w-full items-center gap-2 rounded-2xl border border-dashed border-line px-5 text-[16px] text-muted hover:text-ink">
        <Icon name="plus" size={20} /><span>Review a game by link or PGN</span>
      </button>
    );
  }
  return (
    <div className="mt-3 rounded-2xl bg-surface p-4">
      <label htmlFor="game-link" className="mb-1.5 block text-[15px] text-muted">Lichess game link or PGN</label>
      <textarea
        id="game-link"
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://lichess.org/abcd1234 — or paste the PGN"
        aria-invalid={!!error}
        aria-describedby={error ? 'game-link-error' : 'game-link-hint'}
        className={cn(inputClass, 'min-h-[88px] py-3 text-[16px] leading-snug')}
      />
      {error ? (
        <p id="game-link-error" className="mt-1.5 text-[14px] font-medium text-warn">{error}</p>
      ) : (
        <p id="game-link-hint" className="mt-1.5 text-[14px] text-muted">On Lichess, open the game → Share & export → copy the link or PGN.</p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button onClick={() => { setOpen(false); setError(null); }} className="min-h-[48px] rounded-2xl bg-raised font-semibold">Cancel</button>
        <button onClick={() => void submit()} disabled={busy} className="min-h-[48px] rounded-2xl bg-ink font-semibold text-bg disabled:opacity-60">{busy ? 'Loading…' : 'Review'}</button>
      </div>
    </div>
  );
}
