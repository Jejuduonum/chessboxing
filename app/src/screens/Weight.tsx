import { useState } from 'react';
import { weightStats } from '../lib/calc';
import { cn, fmtDay, fmtDelta, fmtDM, fmtRate, fmtWeight, numeralSize, rateUnit, toInputUnit, weightParts } from '../lib/format';
import { GoalChart } from '../components/charts';
import { BigButton, PageHeader, Pill, SectionLabel, StatTile, Status } from '../components/ui';
import { useData, useSettings } from '../state/data';
import { useNav } from '../state/nav';

export function Weight() {
  const s = useSettings();
  const { weights, today } = useData();
  const nav = useNav();
  const [showAll, setShowAll] = useState(false);
  const w = weightStats(s, weights, today);
  const big = weightParts(w.current, s.units);
  const list = [...weights].reverse();
  const visible = showAll ? list : list.slice(0, 10);
  const loggedToday = weights.some((x) => x.date === today);
  const conv = (kg: number) => toInputUnit(kg, s.units);

  const header = (
    <PageHeader
      title="Weight"
      action={<Pill id="primary-action" tone="fit" icon="plus" onClick={() => nav.openWeight()}>Log weight</Pill>}
    />
  );

  const entries = (
    <section aria-labelledby="weighins">
      <SectionLabel className="mt-2"><span id="weighins">Weigh-ins</span></SectionLabel>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
        {visible.map((e) => (
          <li key={e.date}>
            <button onClick={() => nav.openWeight(e.date)} className="flex min-h-[60px] w-full items-center gap-3 px-5 py-2 text-left hover:bg-raised">
              <span className="min-w-0 flex-1">
                <span className="block text-[17px]">
                  {e.date === today ? 'Today' : fmtDay(e.date)}
                  {e.date === s.startDate && <span className="text-muted"> · start</span>}
                </span>
                {e.waistCm !== undefined && <span className="block text-[14px] text-muted">Waist {e.waistCm} cm</span>}
              </span>
              <span className="shrink-0 whitespace-nowrap text-[17px]">{fmtWeight(e.weightKg, s.units)}</span>
            </button>
          </li>
        ))}
      </ul>
      {list.length > 10 && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-2 min-h-[44px] w-full text-[16px] font-medium text-muted hover:text-ink">
          {showAll ? 'Show fewer' : `Show all ${list.length} weigh-ins`}
        </button>
      )}
    </section>
  );

  if (!w.hasTrend) {
    const first = weights[0];
    const label = w.count <= 1 && first?.date === s.startDate ? 'starting weight' : 'latest';
    return (
      <div className="pb-32">
        {header}
        <div className="space-y-4 px-4">
          <section aria-label="Current weight">
            <p className="flex flex-wrap items-end gap-x-3">
              <span className={cn('whitespace-nowrap font-display font-bold leading-[0.9] text-fit-ink', numeralSize(big.value, 'hero'))}>{big.value}</span>
              <span className="pb-2 text-[20px] text-muted">{big.unit} · {label}</span>
            </p>
            <p className="mt-2 text-[17px] text-muted">Target {fmtWeight(s.targetWeightKg, s.units)} by {fmtDM(s.targetDate)}</p>
          </section>
          <section className="relative overflow-hidden rounded-3xl bg-surface px-6 py-14 text-center" aria-labelledby="trend-empty">
            <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <line x1="6" y1="12" x2="96" y2="88" stroke="var(--target)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            </svg>
            <span aria-hidden="true" className="absolute left-5 top-[9%] h-4 w-4 rounded-full bg-fit" />
            <div className="relative">
              <h2 id="trend-empty" className="text-[21px] font-semibold">Your trend appears after 3 entries</h2>
              <div className="mx-auto mt-3 flex w-32 gap-2" role="img" aria-label={`${w.count} of 3 weigh-ins logged`}>
                {[0, 1, 2].map((i) => <span key={i} className={cn('h-1.5 flex-1 rounded-full', i < w.count ? 'bg-fit' : 'bg-line')} />)}
              </div>
              <p className="mx-auto mt-4 max-w-[30ch] text-[16px] text-muted">Weigh in at the same time each morning for the steadiest trend.</p>
            </div>
          </section>
          {!loggedToday && <BigButton onClick={() => nav.openWeight()}>Log today's weight</BigButton>}
          {entries}
        </div>
      </div>
    );
  }

  const statusText = w.remaining === 0
    ? null
    : `${fmtDelta(w.ahead, s.units)} ${w.ahead >= 0 ? 'ahead of' : 'behind'} the target line · ${w.soFar <= 0 ? '−' : '+'}${fmtDelta(w.soFar, s.units)} so far`;

  return (
    <div className="pb-32">
      {header}
      <div className="space-y-4 px-4">
        <section aria-label="Seven-day average">
          <p className="flex flex-wrap items-end gap-x-3">
            <span className={cn('whitespace-nowrap font-display font-bold leading-[0.9] text-fit-ink', numeralSize(big.value, 'hero'))}>{big.value}</span>
            <span className="pb-2 text-[20px] text-muted">{big.unit} · 7-day avg</span>
          </p>
          <div className="mt-2">
            {statusText === null ? <Status kind="good">Target reached</Status> : <Status kind={w.ahead >= 0 ? 'good' : 'warn'}>{statusText}</Status>}
          </div>
        </section>

        <section className="rounded-3xl bg-surface px-4 pb-3 pt-4" aria-label="Weight chart">
          <div className="flex justify-between px-1 text-[15px] text-muted">
            <span>{fmtWeight(s.startWeightKg, s.units)}</span>
            <span>Dots: daily · line: 7-day avg</span>
          </div>
          <GoalChart
            start={s.startDate}
            target={s.targetDate}
            today={today}
            from={conv(s.startWeightKg)}
            to={conv(s.targetWeightKg)}
            line={w.maSeries.map((p) => ({ date: p.date, v: conv(p.v) }))}
            dots={weights.map((e) => ({ date: e.date, v: conv(e.weightKg) }))}
            color="var(--fit)"
            labelColor="var(--ink)"
            fmt={(v) => v.toFixed(1)}
            startTick={fmtDM(s.startDate)}
            endTick={`${fmtDM(s.targetDate)} · ${fmtWeight(s.targetWeightKg, s.units)}`}
            ariaLabel={`Daily weigh-ins and 7-day average since ${fmtDM(s.startDate)}: now ${fmtWeight(w.current, s.units)}, against a dashed target line to ${fmtWeight(s.targetWeightKg, s.units)} on ${fmtDM(s.targetDate)}.`}
          />
        </section>

        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Your rate" value={w.pace === null ? '—' : `${w.pace < 0 ? '+' : ''}${fmtRate(w.pace, s.units)}`} unit={rateUnit(s.units)} />
          <StatTile label="Needed" value={w.needed === null ? '—' : fmtRate(w.needed, s.units)} unit={rateUnit(s.units)} />
          <StatTile label="Projected" value={w.remaining === 0 ? 'Done' : w.projected ? fmtDM(w.projected) : 'Off pace'} />
        </div>
        {w.pace !== null && w.pace < 0 && (
          <p className="text-[14px] text-muted">Your 7-day average has gone up over the last two weeks, so there’s no projected finish yet.</p>
        )}

        {entries}
      </div>
    </div>
  );
}
