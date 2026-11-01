import { useEffect, useRef, useState, type ReactNode } from 'react';
import { db, TC_LABEL, TIME_CONTROLS, type RatingCache, type Session, type Settings as S, type TimeControl, type WeightEntry } from '../db';
import { addDays, cn, fmtDMY, fmtInt, fromInputUnit, inputUnitLabel, todayISO, toInputUnit, weightParts } from '../lib/format';
import { saveHistory } from '../lib/lichess';
import { LichessConnect } from '../components/LichessConnect';
import { Sheet } from '../components/Sheet';
import { BigButton, Dot, Field, Icon, IconButton, inputClass } from '../components/ui';
import { saveSettings, useSettings } from '../state/data';
import { useToast } from '../state/toast';
import { useCloud } from '../state/cloud';
import { timeAgo } from '../lib/format';

type Editor = null | 'rating' | 'weight' | 'date' | 'username' | 'tc' | 'reset' | 'import' | 'signout' | 'delete-account';

interface Backup {
  app: 'chess-boxing-tracker';
  version: 1;
  exportedAt: string;
  settings: S;
  weights: WeightEntry[];
  sessions: Session[];
  ratingCache: RatingCache[];
}

export function Settings({ onBack }: { onBack: () => void }) {
  const s = useSettings();
  const toast = useToast();
  const cloud = useCloud();
  const [editor, setEditor] = useState<Editor>(null);
  const [unsynced, setUnsynced] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const close = () => setEditor(null);
  const w = (kg: number) => weightParts(kg, s.units);

  useEffect(() => { titleRef.current?.focus(); window.scrollTo(0, 0); }, []);

  const exportBackup = async () => {
    const data: Backup = {
      app: 'chess-boxing-tracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: s,
      weights: await db.weights.toArray(),
      sessions: await db.sessions.toArray(),
      ratingCache: await db.ratingCache.toArray(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chess-boxing-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.show('Backup exported');
  };

  const pickFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Backup;
      if (parsed.app !== 'chess-boxing-tracker' || !parsed.settings || !Array.isArray(parsed.weights) || !Array.isArray(parsed.sessions)) throw new Error('bad');
      setPending(parsed);
      setEditor('import');
    } catch {
      toast.show('That file isn’t a Chess Boxing Tracker backup');
    }
  };

  const doImport = async () => {
    if (!pending) return;
    await db.transaction('rw', [db.settings, db.weights, db.sessions, db.ratingCache], async () => {
      await Promise.all([db.weights.clear(), db.sessions.clear(), db.ratingCache.clear()]);
      await db.weights.bulkPut(pending.weights);
      await db.sessions.bulkPut(pending.sessions);
      await db.ratingCache.bulkPut(pending.ratingCache ?? []);
      await db.settings.put({ ...pending.settings, id: 'me', onboarded: true });
    });
    setPending(null);
    close();
    toast.show(`Backup restored · ${pending.weights.length} weigh-ins, ${pending.sessions.length} sessions`);
    if (cloud.session) void cloud.replaceRemote();
  };

  const doReset = async () => {
    await db.transaction('rw', [db.settings, db.weights, db.sessions, db.ratingCache, db.gameReviews], async () => {
      await Promise.all([db.settings.clear(), db.weights.clear(), db.sessions.clear(), db.ratingCache.clear(), db.gameReviews.clear()]);
    });
    // Signed in: the reset applies to every device.
    if (cloud.session) await cloud.replaceRemote().catch(() => undefined);
  };

  const openSignOut = async () => {
    setAccountError(null);
    if (cloud.status !== 'offline') await cloud.sync();
    setUnsynced(await cloud.hasPendingChanges());
    setEditor('signout');
  };

  const syncLabel =
    cloud.status === 'syncing' ? 'Syncing…'
    : cloud.status === 'offline' ? 'Offline — changes will sync later'
    : cloud.status === 'error' ? 'Couldn’t sync — will retry'
    : cloud.lastSyncedAt ? `Synced ${timeAgo(cloud.lastSyncedAt)}` : 'Not synced yet';

  return (
    <main className="mx-auto min-h-dvh max-w-app px-4 pb-[calc(env(safe-area-inset-bottom)+32px)]">
      <header className="flex items-center gap-4 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <IconButton icon="left" label="Back to Home" size={28} onClick={onBack} className="-ml-2" />
        <h1 ref={titleRef} tabIndex={-1} className="h-page outline-none">Settings</h1>
      </header>

      {cloud.enabled && (
        <Group title="Account">
          {cloud.session ? (
            <>
              <div className="flex min-h-[64px] items-center gap-3 px-5">
                <span className="flex-1 text-[17px]">Signed in</span>
                <span className="min-w-0 truncate text-muted">{cloud.email}</span>
              </div>
              <Row onClick={() => void cloud.sync()} label={<><Icon name="refresh" size={20} className={cn('text-muted', cloud.status === 'syncing' && 'animate-spin motion-reduce:animate-none')} />Sync now</>} value={syncLabel} icon="none" />
              <Row onClick={() => void openSignOut()} label="Sign out" icon="none" />
              <Row onClick={() => { setAccountError(null); setEditor('delete-account'); }} label={<span className="text-fit-ink">Delete account</span>} icon="none" />
            </>
          ) : (
            <Row onClick={cloud.startSignIn} label="Sign in to back up & sync" value="Not signed in" />
          )}
        </Group>
      )}

      <Group title="Goals">
        <Row onClick={() => setEditor('rating')} label={<><Dot tone="chess" />{TC_LABEL[s.primaryTimeControl]} rating</>} value={`${fmtInt(s.startRating)} → ${fmtInt(s.targetRating)}`} />
        <Row onClick={() => setEditor('weight')} label={<><Dot tone="fit" />Weight</>} value={`${w(s.startWeightKg).value} → ${w(s.targetWeightKg).value} ${w(s.targetWeightKg).unit}`} />
        <Row onClick={() => setEditor('date')} label="Target date" value={fmtDMY(s.targetDate)} />
      </Group>

      <Group title="Lichess">
        <Row onClick={() => setEditor('username')} label="Username" value={s.lichessUsername || 'Not connected'} />
        <Row onClick={() => setEditor('tc')} label="Goal time control" value={TC_LABEL[s.primaryTimeControl]} />
      </Group>

      <Group title="Preferences">
        <div className="flex min-h-[64px] items-center gap-3 px-5">
          <span id="units-label" className="flex-1 text-[17px]">Units</span>
          <Toggle labelledBy="units-label" value={s.units} onChange={(units) => saveSettings({ units })} options={[{ value: 'kg', label: 'kg' }, { value: 'stlb', label: 'st/lb' }]} />
        </div>
        <div className="flex min-h-[64px] items-center gap-3 px-5">
          <span id="theme-label" className="flex-1 text-[17px]">Theme</span>
          <Toggle labelledBy="theme-label" value={s.theme} onChange={(theme) => saveSettings({ theme })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
        </div>
      </Group>

      <Group title="Your data">
        <Row onClick={() => void exportBackup()} label="Export backup (JSON)" icon="download" />
        <Row onClick={() => fileRef.current?.click()} label="Import backup" icon="upload" />
        <Row onClick={() => setEditor('reset')} label={<span className="text-fit-ink">Reset all data</span>} icon="none" />
      </Group>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pickFile(f); }} />
      <p className="mt-5 text-[16px] text-muted">
        {cloud.session ? 'Stored on this device and backed up to your account. Works offline; changes sync when you’re online.' : 'Everything is stored on this device only.'}
      </p>

      {/* ---------- Editors ---------- */}
      <Sheet open={editor === 'signout'} onClose={close} labelledBy="ed-signout">
        <SheetTitle id="ed-signout" onClose={close}>Sign out?</SheetTitle>
        <p className="text-[17px] text-muted">
          {unsynced
            ? 'Some changes haven’t synced yet. If you sign out now they’ll be lost. Connect to the internet and sync first.'
            : 'Your data is safely backed up. Signing out removes it from this device; sign in again to get it back.'}
        </p>
        {accountError && <p role="alert" className="mt-3 text-[15px] font-medium text-warn">{accountError}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <BigButton tone="surface" className="bg-raised" onClick={close}>Cancel</BigButton>
          <BigButton tone={unsynced ? 'fit' : 'ink'} disabled={accountBusy} onClick={async () => {
            setAccountBusy(true);
            try { await cloud.signOut(); } catch { setAccountError('Couldn’t sign out. Try again.'); } finally { setAccountBusy(false); }
          }}>{unsynced ? 'Sign out anyway' : 'Sign out'}</BigButton>
        </div>
      </Sheet>
      <Sheet open={editor === 'delete-account'} onClose={close} labelledBy="ed-delacct">
        <SheetTitle id="ed-delacct" onClose={close}>Delete account?</SheetTitle>
        <p className="text-[17px] text-muted">This permanently deletes your account and everything in it — goals, weigh-ins, sessions and game reviews — on every device. It can’t be undone.</p>
        {accountError && <p role="alert" className="mt-3 text-[15px] font-medium text-warn">{accountError}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <BigButton tone="surface" className="bg-raised" onClick={close}>Cancel</BigButton>
          <BigButton tone="fit" disabled={accountBusy} onClick={async () => {
            setAccountBusy(true);
            setAccountError(null);
            try { await cloud.deleteAccount(); } catch (e) { setAccountError(e instanceof Error ? e.message : 'Couldn’t delete your account.'); } finally { setAccountBusy(false); }
          }}>{accountBusy ? 'Deleting…' : 'Delete forever'}</BigButton>
        </div>
      </Sheet>
      <Sheet open={editor === 'rating'} onClose={close} labelledBy="ed-rating">
        <RatingEditor s={s} onDone={close} />
      </Sheet>
      <Sheet open={editor === 'weight'} onClose={close} labelledBy="ed-weight">
        <WeightGoalEditor s={s} onDone={close} />
      </Sheet>
      <Sheet open={editor === 'date'} onClose={close} labelledBy="ed-date">
        <DateEditor s={s} onDone={close} />
      </Sheet>
      <Sheet open={editor === 'username'} onClose={close} labelledBy="ed-user">
        <SheetTitle id="ed-user" onClose={close}>Lichess username</SheetTitle>
        <LichessConnect
          initial={s.lichessUsername}
          goal={s.primaryTimeControl}
          onFound={async (username, history) => {
            await saveHistory(history, { replace: username.toLowerCase() !== s.lichessUsername.toLowerCase() });
            await saveSettings({ lichessUsername: username });
            toast.show(`Connected to ${username}`);
          }}
        />
        <BigButton className="mt-5" onClick={close}>Done</BigButton>
        {s.lichessUsername && (
          <button
            onClick={async () => { await saveSettings({ lichessUsername: '' }); await db.ratingCache.clear(); close(); toast.show('Lichess disconnected'); }}
            className="mt-2 min-h-[48px] w-full text-[16px] font-medium text-fit-ink"
          >
            Disconnect Lichess
          </button>
        )}
      </Sheet>
      <Sheet open={editor === 'tc'} onClose={close} labelledBy="ed-tc">
        <SheetTitle id="ed-tc" onClose={close}>Goal time control</SheetTitle>
        <div role="radiogroup" aria-labelledby="ed-tc" className="space-y-2">
          {TIME_CONTROLS.map((tc: TimeControl) => (
            <button
              key={tc}
              role="radio"
              aria-checked={s.primaryTimeControl === tc}
              onClick={async () => { await saveSettings({ primaryTimeControl: tc }); close(); }}
              className={cn('flex min-h-[60px] w-full items-center rounded-2xl border px-5 text-left text-[17px]', s.primaryTimeControl === tc ? 'border-chess bg-chess-soft' : 'border-line bg-bg hover:bg-raised')}
            >
              <span className="flex-1">{TC_LABEL[tc]}</span>
              {s.primaryTimeControl === tc && <Icon name="check" className="text-chess-ink" />}
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={editor === 'import'} onClose={() => { setPending(null); close(); }} labelledBy="ed-import">
        <SheetTitle id="ed-import" onClose={() => { setPending(null); close(); }}>Replace your data?</SheetTitle>
        {pending && (
          <p className="text-[17px] text-muted">
            This backup from {fmtDMY(pending.exportedAt.slice(0, 10))} has {pending.weights.length} weigh-ins and {pending.sessions.length} sessions. It replaces everything currently on this device.
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <BigButton tone="surface" className="bg-raised" onClick={() => { setPending(null); close(); }}>Cancel</BigButton>
          <BigButton onClick={() => void doImport()}>Replace</BigButton>
        </div>
      </Sheet>
      <Sheet open={editor === 'reset'} onClose={close} labelledBy="ed-reset">
        <SheetTitle id="ed-reset" onClose={close}>Reset all data?</SheetTitle>
        <p className="text-[17px] text-muted">Deletes every weigh-in, session, game review and cached rating{cloud.session ? ' on all your devices' : ''}, then returns to setup. This can’t be undone — export a backup first if you might want it.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <BigButton tone="surface" className="bg-raised" onClick={close}>Cancel</BigButton>
          <BigButton tone="fit" onClick={() => void doReset()}>Delete all</BigButton>
        </div>
      </Sheet>
    </main>
  );
}

/* ---------- Pieces ---------- */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 text-[15px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-3xl bg-surface">{children}</div>
    </section>
  );
}

function Row({ label, value, onClick, icon = 'right' }: { label: ReactNode; value?: string; onClick: () => void; icon?: string }) {
  return (
    <button onClick={onClick} className="flex min-h-[64px] w-full items-center gap-3 px-5 text-left text-[17px] hover:bg-raised">
      <span className="flex min-w-0 flex-1 items-center gap-3">{label}</span>
      {value && <span className="min-w-0 truncate text-muted">{value}</span>}
      {icon === 'right' && <Icon name="right" size={20} className="text-muted" />}
      {icon !== 'right' && icon !== 'none' && <Icon name={icon} size={20} className="text-muted" />}
    </button>
  );
}

function Toggle<T extends string>({ value, onChange, options, labelledBy }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; labelledBy: string }) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex gap-1 rounded-xl bg-bg p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('min-h-[44px] rounded-lg px-4 text-[16px] font-semibold transition-colors duration-150', value === o.value ? 'bg-ink text-bg' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SheetTitle({ id, children, onClose }: { id: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <h2 id={id} className="flex-1 font-display text-[30px] font-bold uppercase leading-tight">{children}</h2>
      <IconButton icon="x" label="Close" onClick={onClose} />
    </div>
  );
}

function RatingEditor({ s, onDone }: { s: S; onDone: () => void }) {
  const [start, setStart] = useState(String(s.startRating));
  const [target, setTarget] = useState(String(s.targetRating));
  const a = parseInt(start, 10), b = parseInt(target, 10);
  const err = !(a >= 400 && a <= 3500) ? 'Starting rating should be 400–3500.' : !(b > a && b <= 3500) ? 'Target should be above your starting rating.' : null;
  return (
    <>
      <SheetTitle id="ed-rating" onClose={onDone}>{TC_LABEL[s.primaryTimeControl]} rating goal</SheetTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field id="er-start" label="Starting rating"><input id="er-start" inputMode="numeric" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field id="er-target" label="Target rating"><input id="er-target" inputMode="numeric" className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
      </div>
      {err && <p className="mt-2 text-[14px] font-medium text-warn">{err}</p>}
      <BigButton className="mt-5" disabled={!!err} onClick={async () => { await saveSettings({ startRating: a, targetRating: b }); onDone(); }}>Save</BigButton>
    </>
  );
}

function WeightGoalEditor({ s, onDone }: { s: S; onDone: () => void }) {
  const u = inputUnitLabel(s.units);
  const [start, setStart] = useState(toInputUnit(s.startWeightKg, s.units).toFixed(1));
  const [target, setTarget] = useState(toInputUnit(s.targetWeightKg, s.units).toFixed(1));
  const a = fromInputUnit(parseFloat(start), s.units), b = fromInputUnit(parseFloat(target), s.units);
  const ok = (v: number) => Number.isFinite(v) && v >= 30 && v <= 300;
  const err = !ok(a) || !ok(b) ? `Enter weights between ${s.units === 'kg' ? '30 and 300 kg' : '66 and 661 lb'}.` : a === b ? 'Target should differ from your starting weight.' : null;
  return (
    <>
      <SheetTitle id="ed-weight" onClose={onDone}>Weight goal</SheetTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field id="ew-start" label={`Starting weight (${u})`}><input id="ew-start" inputMode="decimal" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field id="ew-target" label={`Target weight (${u})`}><input id="ew-target" inputMode="decimal" className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
      </div>
      {err && <p className="mt-2 text-[14px] font-medium text-warn">{err}</p>}
      <BigButton className="mt-5" disabled={!!err} onClick={async () => { await saveSettings({ startWeightKg: Math.round(a * 100) / 100, targetWeightKg: Math.round(b * 100) / 100 }); onDone(); }}>Save</BigButton>
    </>
  );
}

function DateEditor({ s, onDone }: { s: S; onDone: () => void }) {
  const [start, setStart] = useState(s.startDate);
  const [target, setTarget] = useState(s.targetDate);
  const err = !start || !target ? 'Pick both dates.' : target <= addDays(start, 6) ? 'The target date should be at least a week after the start.' : null;
  return (
    <>
      <SheetTitle id="ed-date" onClose={onDone}>Plan dates</SheetTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field id="ed-start" label="Start date"><input id="ed-start" type="date" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field id="ed-target" label="Target date"><input id="ed-target" type="date" className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
      </div>
      {err && <p className="mt-2 text-[14px] font-medium text-warn">{err}</p>}
      <BigButton className="mt-5" disabled={!!err} onClick={async () => { await saveSettings({ startDate: start, targetDate: target }); onDone(); }}>Save</BigButton>
    </>
  );
}
