import { useState } from 'react';
import { TC_LABEL, TIME_CONTROLS, type TimeControl } from '../db';
import { cn, fmtInt } from '../lib/format';
import { fetchRatingHistory, LichessError, lichessErrorText, latestRating, type RatingHistory } from '../lib/lichess';
import { Icon, inputClass } from './ui';

/** Username field + Check. Calls onFound with the fetched history so callers can save it. */
export function LichessConnect({ initial = '', goal, onFound, onChange }: {
  initial?: string;
  goal: TimeControl;
  onFound: (username: string, history: RatingHistory) => void;
  onChange?: (username: string) => void;
}) {
  const [username, setUsername] = useState(initial);
  const [state, setState] = useState<'idle' | 'checking' | 'found' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RatingHistory | null>(null);

  const check = async () => {
    const name = username.trim();
    if (!name) { setState('error'); setError('Enter your Lichess username first.'); return; }
    setState('checking');
    setError(null);
    try {
      const h = await fetchRatingHistory(name);
      setHistory(h);
      setState('found');
      onFound(name, h);
    } catch (e) {
      setState('error');
      setError(lichessErrorText(e instanceof LichessError ? e.kind : 'error'));
    }
  };

  const others = TIME_CONTROLS.filter((tc) => tc !== goal && history && history[tc].length).slice(0, 2);
  const tiles: TimeControl[] = [goal, ...others];

  return (
    <div>
      <label htmlFor="lichess-user" className="mb-1.5 block text-[15px] text-muted">Lichess username</label>
      <div className="flex gap-3">
        <input
          id="lichess-user"
          className={inputClass}
          value={username}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="username"
          placeholder="your-username"
          aria-invalid={state === 'error'}
          aria-describedby={error ? 'lichess-error' : undefined}
          onChange={(e) => { setUsername(e.target.value); setState('idle'); onChange?.(e.target.value.trim()); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void check(); }}
        />
        <button
          onClick={() => void check()}
          disabled={state === 'checking'}
          className="min-h-[56px] shrink-0 rounded-2xl border border-line bg-surface px-5 text-[17px] font-semibold text-ink transition-colors duration-150 hover:bg-raised disabled:text-muted"
        >
          {state === 'checking' ? 'Checking…' : 'Check'}
        </button>
      </div>
      {error && <p id="lichess-error" className="mt-2 flex items-start gap-2 text-[15px] font-medium text-warn"><Icon name="alert" size={20} /><span>{error}</span></p>}

      {state === 'found' && history && (
        <div className="mt-4 rounded-3xl border border-line bg-surface p-5">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-chess-soft text-chess-ink"><Icon name="check" size={24} /></span>
            <div>
              <p className="text-[18px] font-semibold">Account found</p>
              <p className="text-[15px] text-muted">Rating history synced just now</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {tiles.map((tc) => {
              const r = latestRating(history[tc]);
              const isGoal = tc === goal;
              return (
                <div key={tc} className={cn('min-w-0 rounded-2xl border bg-bg px-3 py-3', isGoal ? 'border-chess' : 'border-transparent')}>
                  <p className="truncate text-[14px] text-muted">{TC_LABEL[tc]}{isGoal ? ' · goal' : ''}</p>
                  <p className={cn('font-display text-[30px] font-bold leading-tight', isGoal && 'text-chess-ink')}>{r === null ? '—' : fmtInt(r)}</p>
                </div>
              );
            })}
          </div>
          {latestRating(history[goal]) === null && (
            <p className="mt-3 text-[14px] text-muted">No {TC_LABEL[goal].toLowerCase()} games yet. Your chart starts with your first rated game.</p>
          )}
        </div>
      )}
    </div>
  );
}
