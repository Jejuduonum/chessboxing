import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { authHeader, cloudEnabled, supabase } from '../lib/supabase';
import { clearLocal, hasSyncedBefore, installSyncHooks, pendingChanges, replaceRemoteWithLocal, syncNow } from '../lib/cloudSync';

type Status = 'idle' | 'syncing' | 'error' | 'offline';

interface Cloud {
  enabled: boolean;
  /** Auth state has been read from storage (avoid flashing the sign-in screen). */
  ready: boolean;
  session: Session | null;
  email: string | null;
  /** User chose "Continue without an account" on this device. */
  localOnly: boolean;
  status: Status;
  lastSyncedAt: number | null;
  /** True while a brand-new device is downloading the user's data for the first time. */
  restoring: boolean;
  /** Redirects to the provider (Google). No email is sent, so no email rate limit applies. */
  signInWithProvider: (provider: 'github' | 'google') => Promise<void>;
  continueWithoutAccount: () => void;
  startSignIn: () => void;
  sync: () => Promise<void>;
  hasPendingChanges: () => Promise<boolean>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  /** After reset/import: make the cloud copy match this device. */
  replaceRemote: () => Promise<void>;
}

const LOCAL_ONLY = 'cbt-local-only';
const Ctx = createContext<Cloud | null>(null);

export function CloudProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!cloudEnabled);
  const [session, setSession] = useState<Session | null>(null);
  const [localOnly, setLocalOnly] = useState(() => localStorage.getItem(LOCAL_ONLY) === '1');
  const [status, setStatus] = useState<Status>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const running = useRef<Promise<void> | null>(null);
  const timer = useRef<number>();
  const userId = session?.user.id ?? null;

  const sync = useCallback(async () => {
    if (!supabase || !userId) return;
    if (navigator.onLine === false) { setStatus('offline'); return; }
    if (running.current) return running.current;
    setStatus('syncing');
    running.current = (async () => {
      try {
        await syncNow(supabase, userId);
        setLastSyncedAt(Date.now());
        setStatus('idle');
      } catch {
        setStatus(navigator.onLine === false ? 'offline' : 'error');
      } finally {
        running.current = null;
      }
    })();
    return running.current;
  }, [userId]);

  // Auth state
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => { setSession(s); setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  // Local changes → debounced push
  useEffect(() => {
    installSyncHooks(() => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { void sync(); }, 1500);
    });
  }, [sync]);

  // First sync after sign-in (blocking only on a device that has never synced this account)
  useEffect(() => {
    if (!userId) return;
    localStorage.removeItem(LOCAL_ONLY);
    setLocalOnly(false);
    const fresh = !hasSyncedBefore(userId);
    if (fresh) setRestoring(true);
    void sync().finally(() => setRestoring(false));
  }, [userId, sync]);

  // Keep in step: when the app comes back to the foreground, every 2 minutes, and when back online
  useEffect(() => {
    if (!userId) return;
    const onVisible = () => { if (document.visibilityState === 'visible') void sync(); };
    const onOnline = () => void sync();
    const onOffline = () => setStatus('offline');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const id = window.setInterval(() => void sync(), 120_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearInterval(id);
    };
  }, [userId, sync]);

  const signInWithProvider = useCallback(async (provider: 'github' | 'google') => {
    if (!supabase) throw new Error('Accounts are not set up for this app.');
    // origin (no trailing slash) matches the redirect allow-list entry exactly, so Google never
    // bounces to the Site URL fallback.
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
    if (error) throw error;
  }, []);

  const value: Cloud = {
    enabled: cloudEnabled,
    ready,
    session,
    email: session?.user.email ?? null,
    localOnly,
    status,
    lastSyncedAt,
    restoring,
    signInWithProvider,
    continueWithoutAccount: () => { localStorage.setItem(LOCAL_ONLY, '1'); setLocalOnly(true); },
    startSignIn: () => { localStorage.removeItem(LOCAL_ONLY); setLocalOnly(false); },
    sync,
    hasPendingChanges: async () => (userId ? pendingChanges(userId) : false),
    signOut: async () => {
      if (!supabase) return;
      const uid = userId;
      await supabase.auth.signOut({ scope: 'local' });
      await clearLocal(uid ?? undefined);
      setLastSyncedAt(null);
    },
    deleteAccount: async () => {
      if (!supabase) return;
      const res = await fetch(new URL('api/delete-account', document.baseURI), { method: 'POST', headers: await authHeader() });
      if (!res.ok) throw new Error(res.status === 404 || res.status === 503 ? 'Account deletion isn’t set up on the server yet.' : 'Couldn’t delete your account. Try again.');
      const uid = userId;
      await supabase.auth.signOut({ scope: 'local' });
      await clearLocal(uid ?? undefined);
    },
    replaceRemote: async () => {
      if (!supabase || !userId) return;
      await replaceRemoteWithLocal(supabase, userId);
      await sync();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCloud(): Cloud {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCloud outside CloudProvider');
  return v;
}
