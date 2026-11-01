import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type RatingCache, type Session, type Settings, type TimeControl, type WeightEntry } from '../db';
import { todayISO } from '../lib/format';

interface Data {
  /** null while loading, undefined when the app has never been set up */
  settings: Settings | undefined | null;
  weights: WeightEntry[];
  sessions: Session[];
  ratings: Partial<Record<TimeControl, RatingCache>>;
  lastFetchedAt: number | null;
  today: string;
}

const Ctx = createContext<Data | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const settings = useLiveQuery(() => db.settings.get('me'), [], null as Settings | undefined | null);
  const weights = useLiveQuery(() => db.weights.orderBy('date').toArray(), [], [] as WeightEntry[]);
  const sessions = useLiveQuery(
    async () =>
      (await db.sessions.toArray()).sort((a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0)),
    [],
    [] as Session[],
  );
  const rows = useLiveQuery(() => db.ratingCache.toArray(), [], [] as RatingCache[]);
  const ratings = Object.fromEntries(rows.map((r) => [r.timeControl, r])) as Data['ratings'];
  const lastFetchedAt = rows.length ? Math.max(...rows.map((r) => r.fetchedAt)) : null;

  // Keep "today" fresh when the app comes back from the background.
  const [today, setToday] = useState(todayISO());
  useEffect(() => {
    const tick = () => setToday(todayISO());
    document.addEventListener('visibilitychange', tick);
    const id = window.setInterval(tick, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', tick);
      window.clearInterval(id);
    };
  }, []);

  return <Ctx.Provider value={{ settings, weights, sessions, ratings, lastFetchedAt, today }}>{children}</Ctx.Provider>;
}

export function useData(): Data {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData outside DataProvider');
  return v;
}

/** Settings are guaranteed once the app is set up. */
export function useSettings(): Settings {
  const { settings } = useData();
  if (!settings) throw new Error('Settings not loaded');
  return settings;
}

export const saveSettings = (patch: Partial<Settings>) => db.settings.update('me', patch);
