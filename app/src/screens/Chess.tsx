import { useState } from 'react';
import { sessionType, TC_LABEL, TIME_CONTROLS, type TimeControl } from '../db';
import { chessStats } from '../lib/calc';
import { cn, fmtDM, fmtInt, relDay, timeAgo } from '../lib/format';
import { lichessErrorText, saveHistory } from '../lib/lichess';
import { GoalChart } from '../components/charts';
import { LichessConnect } from '../components/LichessConnect';
import { GameList } from '../components/GameList';
import { BigButton, Icon, PageHeader, SectionLabel, Segmented, StatTile, Status } from '../components/ui';
import { saveSettings, useData, useSettings } from '../state/data';
import { useNav } from '../state/nav';
import { useSync } from '../state/sync';

export function Chess() {
  const s = useSettings();
  const { ratings, sessions, today, lastFetchedAt } = useData();
  const sync = useSync();
  const nav = useNav();
  const [tc, setTc] = useState<TimeControl>(s.primaryTimeControl);
  const stats = chessStats(s, ratings[tc]?.points, today);
  const recent = sessions.filter((x) => x.category === 'chess').slice(0, 3);

  if (!s.lichessUsername) {
    return (
      <div className="pb-32">
        <PageHeader title="Chess" />
        <div className="px-4">
          <section className="rounded-3xl bg-surface p-5" aria-labelledby="connect-title">
            <h2 id="connect-title" className="text-[19px] font-semibold">Connect Lichess to see your rating</h2>
            <p className="mb-4 mt-1 text-[16px] text-muted">We read your public rating history. No password or login needed.</p>
            <LichessConnect
              goal={s.primaryTimeControl}
              onFound={async (username, history) => {
                await saveHistory(history, { replace: true });
                await saveSettings({ lichessUsername: username });
              }}
            />
          </section>
        </div>
      </div>
    );
  }

  const syncLabel =
    sync.status === 'syncing' ? 'Syncing…' : sync.status === 'error' ? 'Sync failed · retry' : lastFetchedAt ? `Synced ${timeAgo(lastFetchedAt)}` : 'Sync now';
  const isGoal = tc === s.primaryTimeControl;

  return (
    <div className="pb-32">
      <PageHeader
        title="Chess"
        action={
          <button
            onClick={() => void sync.sync()}
            aria-busy={sync.status === 'syncing'}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-surface px-5 text-[16px] font-medium text-ink hover:bg-raised"
          >
            <Icon name="refresh" size={20} className={cn(sync.status === 'syncing' && 'animate-spin motion-reduce:animate-none')} />
            <span>{syncLabel}</span>
          </button>
        }
      />
      <div className="space-y-4 px-4">
        {sync.status === 'error' && sync.error && (
          <p role="alert" className="flex items-start gap-3 rounded-2xl border border-warn px-4 py-3 text-[15px] text-ink">
            <Icon name={sync.error === 'offline' ? 'wifiOff' : 'alert'} size={20} className="mt-0.5 text-warn" />
            <span>
              {lichessErrorText(sync.error)}
              {lastFetchedAt && <span className="text-muted"> Showing ratings saved {timeAgo(lastFetchedAt)}.</span>}
            </span>
          </p>
        )}

        <Segmented
          label="Time control"
          tone="chess"
          value={tc}
          onChange={setTc}
          options={TIME_CONTROLS.map((t) => ({ value: t, label: TC_LABEL[t] }))}
        />

        <section aria-label="Current rating">
          <p className="flex flex-wrap items-end gap-x-3">
            <span className="font-display text-[clamp(80px,26vw,104px)] font-bold leading-[0.9] text-chess-ink">{stats.hasData ? fmtInt(stats.current) : '—'}</span>
            <span className="pb-2 text-[20px] text-muted">target {fmtInt(s.targetRating)}</span>
          </p>
          <div className="mt-2">
            {!stats.hasData ? (
              <Status kind="neutral">No {TC_LABEL[tc].toLowerCase()} games on Lichess yet</Status>
            ) : stats.toGo === 0 ? (
              <Status kind="good">Target reached</Status>
            ) : stats.ahead >= 0 ? (
              <Status kind="good">{fmtInt(stats.ahead)} ahead of the target line</Status>
            ) : (
              <Status kind="warn">{fmtInt(-stats.ahead)} behind the target line</Status>
            )}
            {!isGoal && <p className="mt-1 text-[14px] text-muted">Your goal tracks {TC_LABEL[s.primaryTimeControl].toLowerCase()} — change it in Settings.</p>}
          </div>
        </section>

        <section className="rounded-3xl bg-surface px-4 pb-3 pt-4" aria-label="Rating chart">
          <div className="flex justify-between px-1 text-[15px] text-muted">
            <span>{fmtInt(s.targetRating)}</span>
            <span>Target line dashed</span>
          </div>
          {stats.series.length > 0 ? (
            <GoalChart
              start={s.startDate}
              target={s.targetDate}
              today={today}
              from={s.startRating}
              to={s.targetRating}
              line={stats.series}
              color="var(--chess)"
              labelColor="var(--ink)"
              fmt={fmtInt}
              startTick={`${fmtDM(s.startDate)} · ${fmtInt(s.startRating)}`}
              endTick={fmtDM(s.targetDate)}
              ariaLabel={`${TC_LABEL[tc]} rating since ${fmtDM(s.startDate)}: now ${fmtInt(stats.current)}, against a dashed target line to ${fmtInt(s.targetRating)} on ${fmtDM(s.targetDate)}.`}
            />
          ) : (
            <p className="py-16 text-center text-[16px] text-muted">Play a rated {TC_LABEL[tc].toLowerCase()} game on Lichess and it will appear here.</p>
          )}
        </section>

        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Your pace" value={`${stats.pace >= 0 ? '' : '−'}${fmtInt(Math.abs(stats.pace))}`} unit="/wk" />
          <StatTile label="Needed" value={fmtInt(stats.needed)} unit="/wk" />
          <StatTile label="To go" value={fmtInt(stats.toGo)} />
        </div>

        <GameList username={s.lichessUsername} tc={tc} today={today} />

        <section aria-labelledby="recent-chess">
          <SectionLabel className="mt-2"><span id="recent-chess">Recent chess sessions</span></SectionLabel>
          {recent.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
              {recent.map((x) => (
                <li key={x.id}>
                  <button onClick={() => nav.openSession(x.id)} className="flex min-h-[60px] w-full items-center gap-3 px-5 text-left hover:bg-raised">
                    <span className="min-w-0 flex-1 truncate text-[17px]">{sessionType('chess', x.type).label}</span>
                    <span className="shrink-0 whitespace-nowrap text-[16px] text-muted">{x.durationMin} min · {relDay(x.date, today).toLowerCase() === 'today' ? 'today' : relDay(x.date, today)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl bg-surface p-5">
              <p className="text-[16px] text-muted">No chess study logged yet.</p>
              <BigButton tone="surface" className="mt-3 bg-raised" onClick={() => nav.openSession()}>Log a session</BigButton>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
