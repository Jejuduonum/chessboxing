import { TC_LABEL } from '../db';
import { chessStats, planDays, weekSummary, weightStats } from '../lib/calc';
import { cn, fmtDay, fmtDelta, fmtInt, mondayOf, numeralSize, weightParts } from '../lib/format';
import { Sparkline } from '../components/charts';
import { BigButton, Dot, Icon, Status } from '../components/ui';
import { useData, useSettings } from '../state/data';
import { useNav } from '../state/nav';

export function Home() {
  const s = useSettings();
  const { weights, sessions, ratings, today } = useData();
  const nav = useNav();
  const { total, left, dayNumber } = planDays(s, today);
  const chess = chessStats(s, ratings[s.primaryTimeControl]?.points, today);
  const w = weightStats(s, weights, today);
  const week = weekSummary(sessions, mondayOf(today));
  const connected = !!s.lichessUsername;
  const big = weightParts(w.current, s.units);

  const heading = left > 0 ? `${left} ${left === 1 ? 'day' : 'days'} to go` : 'Target day';

  return (
    <div className="pb-32">
      <header className="flex items-start gap-3 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="min-w-0 flex-1">
          <p className="text-[16px] text-muted">Day {dayNumber} of {total} · {fmtDay(today)}</p>
          <h1 className="h-page">{heading}</h1>
        </div>
        <button onClick={nav.openSettings} aria-label="Settings" className="mt-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface text-ink hover:bg-raised">
          <Icon name="sliders" size={24} />
        </button>
      </header>

      <div className="space-y-4 px-4">
        {/* Chess goal */}
        <button onClick={() => nav.goTab('chess')} className="block w-full rounded-3xl bg-surface p-5 text-left transition-colors duration-150 hover:bg-raised">
          <div className="flex items-center gap-2 text-[17px]">
            <Dot tone="chess" />
            <span className="flex-1">{TC_LABEL[s.primaryTimeControl]} rating</span>
            {connected && chess.hasData && <span className="whitespace-nowrap text-muted">{chess.weekChange === 0 ? 'No change this week' : `${chess.weekChange > 0 ? '+' : '−'}${fmtInt(Math.abs(chess.weekChange))} this week`}</span>}
          </div>
          <div className="mt-2 flex items-end gap-3">
            <p className="min-w-0 shrink-0">
              <span className="font-display text-[clamp(64px,20vw,88px)] font-bold leading-[0.9] text-chess-ink">{fmtInt(chess.current)}</span>
              <span className="ml-2 text-[18px] text-muted">/ {fmtInt(s.targetRating)}</span>
            </p>
            <div className="mb-2 min-w-0 flex-1">
              <Sparkline series={chess.series} start={s.startDate} today={today} from={s.startRating} to={s.targetRating} targetDate={s.targetDate} color="var(--chess)" />
            </div>
          </div>
          <div className="mt-3">
            {!connected ? (
              <Status kind="neutral">Connect Lichess on the Chess tab to sync your rating</Status>
            ) : chess.toGo === 0 ? (
              <Status kind="good">Target reached</Status>
            ) : chess.ahead >= 0 ? (
              <Status kind="good">{fmtInt(chess.ahead)} points ahead of target · {fmtInt(chess.toGo)} to go</Status>
            ) : (
              <Status kind="warn">{fmtInt(-chess.ahead)} points behind target · {fmtInt(chess.toGo)} to go</Status>
            )}
          </div>
        </button>

        {/* Weight goal */}
        <button onClick={() => nav.goTab('weight')} className="block w-full rounded-3xl bg-surface p-5 text-left transition-colors duration-150 hover:bg-raised">
          <div className="flex items-center gap-2 text-[17px]">
            <Dot tone="fit" />
            <span className="flex-1">{w.hasTrend ? 'Weight · 7-day avg' : 'Weight · latest'}</span>
            {w.hasTrend && <span className="whitespace-nowrap text-muted">{w.soFar <= 0 ? '−' : '+'}{fmtDelta(w.soFar, s.units)} so far</span>}
          </div>
          <div className="mt-2 flex items-end gap-3">
            <p className={cn('min-w-0', big.value.length > 6 ? 'flex-1' : 'shrink-0')}>
              <span className={cn('whitespace-nowrap font-display font-bold leading-[0.9] text-fit-ink', numeralSize(big.value, 'card'))}>{big.value}</span>
              <span className={cn('text-[18px] text-muted', big.value.length > 6 ? 'mt-1 block' : 'ml-2')}>{big.unit} / {weightParts(s.targetWeightKg, s.units).value}</span>
            </p>
            <div className={cn('mb-2 min-w-0 flex-1', big.value.length > 6 && 'max-w-[35%]')}>
              {w.hasTrend && (
                <Sparkline series={w.maSeries} start={s.startDate} today={today} from={s.startWeightKg} to={s.targetWeightKg} targetDate={s.targetDate} color="var(--fit)" />
              )}
            </div>
          </div>
          <div className="mt-3">
            {!w.hasTrend ? (
              <Status kind="neutral">Your trend appears after 3 weigh-ins ({w.count} of 3)</Status>
            ) : w.remaining === 0 ? (
              <Status kind="good">Target reached</Status>
            ) : w.ahead >= 0 ? (
              <Status kind="good">{fmtDelta(w.ahead, s.units)} ahead of target · {fmtDelta(w.remaining, s.units)} to go</Status>
            ) : (
              <Status kind="warn">{fmtDelta(w.ahead, s.units)} behind target · {fmtDelta(w.remaining, s.units)} to go</Status>
            )}
          </div>
        </button>

        {/* This week */}
        <section aria-labelledby="week-title" className="rounded-3xl bg-surface p-5">
          <div className="flex items-baseline gap-2 text-[17px]">
            <h2 id="week-title" className="flex-1">This week</h2>
            <span className="text-muted">{week.count} {week.count === 1 ? 'session' : 'sessions'} · {week.total} min</span>
          </div>
          {week.count === 0 ? (
            <div className="mt-3">
              <p className="text-[16px] text-muted">Nothing logged yet this week. A session takes about 10 seconds to log.</p>
              <BigButton tone="surface" className="mt-4 bg-raised" onClick={() => nav.openSession()}>Log a session</BigButton>
            </div>
          ) : (
            <>
              <div className="mt-4 flex h-3 gap-1 overflow-hidden rounded-full" role="img" aria-label={`Chess ${week.chess} minutes, fitness ${week.fitness} minutes`}>
                {week.chess > 0 && <span className="h-full rounded-full bg-chess" style={{ flexGrow: week.chess }} />}
                {week.fitness > 0 && <span className="h-full rounded-full bg-fit" style={{ flexGrow: week.fitness }} />}
              </div>
              <div className="mt-3 flex justify-between text-[17px]">
                <p><span className="font-semibold text-chess-ink">{week.chess} min</span> <span className="text-muted">chess</span></p>
                <p><span className="font-semibold text-fit-ink">{week.fitness} min</span> <span className="text-muted">fitness</span></p>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

