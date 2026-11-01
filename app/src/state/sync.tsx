import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { fetchRatingHistory, LichessError, saveHistory, type LichessErrorKind } from '../lib/lichess';
import { useData } from './data';

interface Sync {
  status: 'idle' | 'syncing' | 'error';
  error: LichessErrorKind | null;
  sync: () => Promise<void>;
}

const Ctx = createContext<Sync>({ status: 'idle', error: null, sync: async () => {} });

export function SyncProvider({ children }: { children: ReactNode }) {
  const { settings, lastFetchedAt } = useData();
  const username = settings?.onboarded ? settings.lichessUsername : '';
  const [status, setStatus] = useState<Sync['status']>('idle');
  const [error, setError] = useState<LichessErrorKind | null>(null);
  const busy = useRef(false);

  const sync = useCallback(async () => {
    if (!username || busy.current) return;
    busy.current = true;
    setStatus('syncing');
    try {
      await saveHistory(await fetchRatingHistory(username));
      setError(null);
      setStatus('idle');
    } catch (e) {
      setError(e instanceof LichessError ? e.kind : 'error');
      setStatus('error');
    } finally {
      busy.current = false;
    }
  }, [username]);

  // Sync on app open, whenever the username changes, and when the cache is empty (e.g. after an import).
  const cacheEmpty = lastFetchedAt === null;
  useEffect(() => {
    if (username) void sync();
  }, [username, sync]);
  useEffect(() => {
    if (username && cacheEmpty) void sync();
  }, [username, cacheEmpty, sync]);

  // Retry when the connection comes back.
  useEffect(() => {
    const onOnline = () => { if (status === 'error') void sync(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [status, sync]);

  return <Ctx.Provider value={{ status, error, sync }}>{children}</Ctx.Provider>;
}

export const useSync = () => useContext(Ctx);
