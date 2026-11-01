import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TabBar } from './components/TabBar';
import { Sheet } from './components/Sheet';
import { WeightEditor } from './components/WeightEditor';
import { Icon, IconButton, Segmented } from './components/ui';
import { Onboarding } from './screens/Onboarding';
import { Home } from './screens/Home';
import { Chess } from './screens/Chess';
import { Weight } from './screens/Weight';
import { Log } from './screens/Log';
import { SessionForm } from './screens/SessionForm';
import { Settings } from './screens/Settings';
import { GameReview } from './screens/GameReview';
import { DataProvider, useData } from './state/data';
import { NavCtx, type Nav, type SessionPrefill, type Tab } from './state/nav';
import { SyncProvider } from './state/sync';
import { ToastProvider } from './state/toast';
import { CloudProvider, useCloud } from './state/cloud';
import { Restoring, SignIn } from './screens/SignIn';

export default function App() {
  return (
    <DataProvider>
      <ToastProvider>
        <CloudProvider>
          <SyncProvider>
            <Shell />
          </SyncProvider>
        </CloudProvider>
      </ToastProvider>
    </DataProvider>
  );
}

function Shell() {
  const { settings } = useData();
  const cloud = useCloud();
  const theme = settings?.theme ?? 'dark';
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#F4F5F7' : '#0E0E10');
  }, [theme]);

  if (settings === null || !cloud.ready) return <div className="min-h-dvh bg-bg" />; // loading
  if (cloud.enabled && !cloud.session && !cloud.localOnly) return <SignIn />;
  if (cloud.restoring && !settings?.onboarded) return <Restoring />;
  if (!settings || !settings.onboarded) return <Onboarding />;
  return <Main />;
}

type Overlay =
  | null
  | { kind: 'settings' }
  | { kind: 'session'; id?: number; prefill?: SessionPrefill; returnTo: Tab }
  | { kind: 'review'; gameId: string };
type SheetState = null | { kind: 'quick' } | { kind: 'weight'; date?: string; returnTo: Tab };

function Main() {
  const [tab, setTab] = useState<Tab>('home');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const scroll = useRef<Record<string, number>>({});
  const viewKey = overlay ? overlay.kind : tab;
  const prevKey = useRef(viewKey);

  // Restore each tab's scroll position when coming back to it.
  useLayoutEffect(() => {
    if (prevKey.current !== viewKey) {
      window.scrollTo(0, overlay ? 0 : scroll.current[viewKey] ?? 0);
      prevKey.current = viewKey;
    }
  }, [viewKey, overlay]);
  const remember = () => { if (!overlay) scroll.current[tab] = window.scrollY; };

  const goTab = useCallback((t: Tab) => { remember(); setOverlay(null); setTab(t); }, // eslint-disable-line react-hooks/exhaustive-deps
    [tab, overlay]);

  const nav: Nav = useMemo(() => ({
    tab,
    goTab,
    openSettings: () => { remember(); setOverlay({ kind: 'settings' }); },
    openQuickAdd: () => setSheet({ kind: 'quick' }),
    openWeight: (date?: string) => setSheet({ kind: 'weight', date, returnTo: tab }),
    openSession: (id?: number, prefill?: SessionPrefill) => { remember(); setSheet(null); setOverlay({ kind: 'session', id, prefill, returnTo: tab }); },
    openReview: (gameId: string) => { remember(); setOverlay({ kind: 'review', gameId }); },
  }), [tab, goTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeSheet = useCallback(() => setSheet(null), []);

  // Keep toasts clear of the tab bar and the Home + button; lower when neither is shown.
  // Toasts sit above the bottom chrome, and move to the top while a sheet is open. Only Undo takes taps.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.toast = sheet ? 'top' : 'bottom';
    root.style.setProperty('--toast-offset', overlay ? '24px' : tab === 'home' ? '172px' : '92px');
  }, [overlay, sheet, tab]);

  return (
    <NavCtx.Provider value={nav}>
      <div className="mx-auto min-h-dvh max-w-app">
        {overlay?.kind === 'settings' && <Settings onBack={() => setOverlay(null)} />}
        {overlay?.kind === 'review' && <GameReview gameId={overlay.gameId} onClose={() => { setOverlay(null); setTab('chess'); }} />}
        {overlay?.kind === 'session' && (
          <SessionForm
            id={overlay.id}
            prefill={overlay.prefill}
            onClose={() => { setOverlay(null); setTab(overlay.returnTo); }}
          />
        )}
        {!overlay && (
          <>
            <main>
              {tab === 'home' && <Home />}
              {tab === 'chess' && <Chess />}
              {tab === 'weight' && <Weight />}
              {tab === 'log' && <Log />}
            </main>
            {tab === 'home' && (
              <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-30 mx-auto flex max-w-app justify-end px-4">
                <button
                  id="primary-action"
                  onClick={nav.openQuickAdd}
                  aria-label="Quick add: weight or session"
                  aria-haspopup="dialog"
                  className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-ink text-bg shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-transform duration-150 hover:scale-105 active:scale-95"
                >
                  <Icon name="plus" size={30} />
                </button>
              </div>
            )}
            <TabBar tab={tab} onChange={goTab} />
          </>
        )}
      </div>

      {/* Quick add: Weight / Session switch, weigh-in inline. Saving returns to Home. */}
      <Sheet open={sheet?.kind === 'quick'} onClose={closeSheet} labelledBy="quick-title">
        <WeightEditor
          titleSlot={
            <div className="flex items-center gap-3">
              <h2 id="quick-title" className="sr-only">Quick add</h2>
              <Segmented
                label="What to log"
                size="sm"
                className="w-[200px]"
                value="weight"
                onChange={(v) => { if (v === 'session') nav.openSession(); }}
                options={[{ value: 'weight', label: 'Weight', tone: 'fit' }, { value: 'session', label: 'Session', tone: 'fit' }]}
              />
              <span className="flex-1" />
              <IconButton icon="x" label="Close" onClick={closeSheet} />
            </div>
          }
          onDone={() => { closeSheet(); goTab('home'); }}
        />
      </Sheet>

      {/* Weigh-in from the Weight tab or a list row (edit). */}
      <Sheet open={sheet?.kind === 'weight'} onClose={closeSheet} labelledBy="weight-title">
        {sheet?.kind === 'weight' && (
          <WeightEditor
            date={sheet.date}
            titleSlot={
              <div className="flex items-center gap-3">
                <h2 id="weight-title" className="flex-1 font-display text-[30px] font-bold uppercase leading-tight">{sheet.date ? 'Edit weigh-in' : 'Log weight'}</h2>
                <IconButton icon="x" label="Close" onClick={closeSheet} />
              </div>
            }
            onDone={closeSheet}
          />
        )}
      </Sheet>
    </NavCtx.Provider>
  );
}
