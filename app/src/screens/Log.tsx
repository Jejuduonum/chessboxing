import { useState } from 'react';
import { sessionType, type Category, type Session } from '../db';
import { weekSummary } from '../lib/calc';
import { cn, fmtDay, fmtDM, mondayOf, weekdayLetter } from '../lib/format';
import { BigButton, Dot, PageHeader, Pill } from '../components/ui';
import { useData } from '../state/data';
import { useNav } from '../state/nav';

type Filter = 'all' | Category;

export function Log() {
  const { sessions, today } = useData();
  const nav = useNav();
  const [filter, setFilter] = useState<Filter>('all');

  const shown = sessions.filter((x) => filter === 'all' || x.category === filter);
  const weeks = [...new Set(shown.map((x) => mondayOf(x.date)))].sort((a, b) => b.localeCompare(a));

  const filterBtn = (id: Filter, label: string, tone?: 'chess' | 'fit') => (
    <button
      key={id}
      aria-pressed={filter === id}
      onClick={() => setFilter(id)}
      className={cn(
        'inline-flex min-h-[48px] items-center gap-2 rounded-full border px-5 text-[17px] font-medium transition-colors duration-150',
        filter === id ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink hover:border-muted',
      )}
    >
      {tone && <Dot tone={tone} />}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="pb-32">
      <PageHeader title="Log" action={<Pill id="primary-action" tone="ink" icon="plus" onClick={() => nav.openSession()}>Add session</Pill>} />
      <div className="px-4">
        <div className="flex gap-3" role="group" aria-label="Filter by category">
          {filterBtn('all', 'All')}
          {filterBtn('chess', 'Chess', 'chess')}
          {filterBtn('fitness', 'Fitness', 'fit')}
        </div>

        {sessions.length === 0 ? (
          <div className="mt-6 rounded-3xl bg-surface p-6">
            <h2 className="text-[19px] font-semibold">No sessions yet</h2>
            <p className="mt-1 text-[16px] text-muted">Log training and chess study here. Type, minutes and intensity — about 10 seconds.</p>
            <BigButton className="mt-5" onClick={() => nav.openSession()}>Log your first session</BigButton>
          </div>
        ) : shown.length === 0 ? (
          <p className="mt-8 text-center text-[16px] text-muted">No {filter} sessions logged yet.</p>
        ) : (
          weeks.map((monday) => <WeekGroup key={monday} monday={monday} all={sessions} shown={shown} today={today} onOpen={(id) => nav.openSession(id)} />)
        )}
      </div>
    </div>
  );
}

function WeekGroup({ monday, all, shown, today, onOpen }: { monday: string; all: Session[]; shown: Session[]; today: string; onOpen: (id?: number) => void }) {
  const sum = weekSummary(all, monday);
  const inWeek = weekSummary(shown, monday).list;
  const days = [...new Set(inWeek.map((x) => x.date))].sort((a, b) => b.localeCompare(a));
  const isCurrent = monday === mondayOf(today);
  return (
    <section className="mt-5" aria-label={`Week of ${fmtDM(monday)}`}>
      <div className="rounded-3xl bg-surface p-5">
        <div className="flex items-baseline text-[17px]">
          <h2 className="flex-1">{isCurrent ? 'This week' : `Week of ${fmtDM(monday)}`}</h2>
          <span className="text-muted">{sum.count} {sum.count === 1 ? 'session' : 'sessions'}</span>
        </div>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="whitespace-nowrap"><span className="font-display text-[44px] font-bold leading-none text-chess-ink">{sum.chess}</span><span className="ml-1.5 font-display text-[20px] font-semibold text-muted">min chess</span></span>
          <span className="whitespace-nowrap"><span className="font-display text-[44px] font-bold leading-none text-fit-ink">{sum.fitness}</span><span className="ml-1.5 font-display text-[20px] font-semibold text-muted">min fitness</span></span>
        </p>
        <ol className="mt-4 grid grid-cols-7 gap-1" aria-label="Sessions per day">
          {sum.perDay.map((d) => (
            <li key={d.date} className="text-center" aria-label={`${fmtDay(d.date)}: ${d.count} ${d.count === 1 ? 'session' : 'sessions'}`}>
              <span className="block text-[13px] text-muted">{weekdayLetter(d.date)}</span>
              <span className={cn('mt-1 block rounded-lg py-1 text-[15px] font-semibold', d.count ? 'bg-raised text-ink' : 'text-muted', d.date > today && 'opacity-40')}>{d.count || '·'}</span>
            </li>
          ))}
        </ol>
      </div>

      {days.map((date) => (
        <div key={date} className="mt-5">
          <h3 className="mb-2 text-[16px] text-muted">{date === today ? `Today · ${fmtDay(date)}` : fmtDay(date)}</h3>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
            {inWeek.filter((x) => x.date === date).map((x) => {
              const t = sessionType(x.category, x.type);
              const meta = [`Intensity ${x.intensity} of 5`, x.result, x.notes].filter(Boolean).join(' · ');
              return (
                <li key={x.id}>
                  <button onClick={() => onOpen(x.id)} className="flex min-h-[72px] w-full items-center gap-4 px-4 py-3 text-left hover:bg-raised">
                    <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-display text-[20px] font-bold', x.category === 'chess' ? 'bg-chess-soft text-chess-ink' : 'bg-fit-soft text-fit-ink')} aria-hidden="true">
                      {t.code}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[18px] font-medium leading-snug">{t.label}</span>
                      <span className="block truncate text-[15px] text-muted">{meta}</span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-[18px]">{x.durationMin} min</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
