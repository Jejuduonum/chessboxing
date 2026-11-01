import { useEffect, useRef, useState } from 'react';
import { CHESS_TYPES, db, FITNESS_TYPES, INTENSITY_LABEL, sessionType, type Category, type GameResult, type Session } from '../db';
import { cn, fmtDay } from '../lib/format';
import { BigButton, Chip, IconButton, inputClass, Segmented } from '../components/ui';
import { useData } from '../state/data';
import { useToast } from '../state/toast';
import type { SessionPrefill } from '../state/nav';

const DURATIONS = [15, 30, 45, 60];

/** Full-screen "Log a session" form. Pass an id to edit or delete an existing session. */
export function SessionForm({ id, prefill, onClose }: { id?: number; prefill?: SessionPrefill; onClose: () => void }) {
  const { sessions, today } = useData();
  const toast = useToast();
  const editing = id !== undefined ? sessions.find((x) => x.id === id) : undefined;
  // New sessions start from the last one logged, so a repeat takes two taps.
  const last = sessions[0];
  const seed: Session = editing ?? (prefill ? {
    date: today,
    category: prefill.category,
    type: prefill.type,
    durationMin: prefill.durationMin ?? 30,
    intensity: prefill.intensity ?? 3,
    notes: prefill.notes,
  } : {
    date: today,
    category: last?.category ?? 'fitness',
    type: last?.type ?? 'boxing',
    durationMin: last?.durationMin ?? 60,
    intensity: last?.intensity ?? 3,
  });

  const [category, setCategory] = useState<Category>(seed.category);
  const [type, setType] = useState(seed.type);
  const [duration, setDuration] = useState<number | 'custom'>(DURATIONS.includes(seed.durationMin) ? seed.durationMin : 'custom');
  const [custom, setCustom] = useState(DURATIONS.includes(seed.durationMin) ? '' : String(seed.durationMin));
  const [intensity, setIntensity] = useState(seed.intensity);
  const [date, setDate] = useState(seed.date);
  const [notes, setNotes] = useState(editing?.notes ?? prefill?.notes ?? '');
  const [result, setResult] = useState<GameResult | undefined>(editing?.result);
  const [customTouched, setCustomTouched] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const customRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { titleRef.current?.focus(); window.scrollTo(0, 0); }, []);

  const types = category === 'chess' ? CHESS_TYPES : FITNESS_TYPES;
  const tone = category === 'chess' ? 'chess' : 'fit';
  const minutes = duration === 'custom' ? parseInt(custom, 10) : duration;
  const customError = duration === 'custom' && !(minutes >= 1 && minutes <= 600) ? 'Enter minutes between 1 and 600.' : null;

  const switchCategory = (c: Category) => {
    setCategory(c);
    const list = c === 'chess' ? CHESS_TYPES : FITNESS_TYPES;
    if (!list.some((t) => t.id === type)) setType(list[0].id);
    if (c !== 'chess') setResult(undefined);
  };

  const save = async () => {
    if (customError) { setCustomTouched(true); customRef.current?.focus(); return; }
    const record: Session = {
      ...(editing?.id !== undefined ? { id: editing.id } : {}),
      date,
      category,
      type,
      durationMin: minutes,
      intensity,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(category === 'chess' && type === 'rated' && result ? { result } : {}),
    };
    const prev = editing ? { ...editing } : null;
    const newId = await db.sessions.put(record);
    onClose();
    const label = `${sessionType(category, type).label} · ${minutes} min`;
    toast.show(editing ? `${label} updated` : `${label} saved`, async () => {
      if (prev) await db.sessions.put(prev);
      else await db.sessions.delete(newId);
    });
  };

  const remove = async () => {
    if (!editing?.id) return;
    const prev = { ...editing };
    await db.sessions.delete(editing.id);
    onClose();
    toast.show(`${sessionType(prev.category, prev.type).label} deleted`, async () => { await db.sessions.put(prev); });
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-app flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+20px)]">
      <header className="flex items-center gap-3 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <h1 ref={titleRef} tabIndex={-1} className="h-page flex-1 outline-none">{editing ? 'Edit session' : 'Log a session'}</h1>
        <IconButton icon="x" label="Close without saving" size={28} onClick={onClose} />
      </header>

      <Segmented
        label="Category"
        value={category}
        onChange={switchCategory}
        options={[
          { value: 'fitness', label: 'Fitness', tone: 'fit' },
          { value: 'chess', label: 'Chess', tone: 'chess' },
        ]}
      />

      <fieldset className="mt-6">
        <legend className="mb-3 text-[16px] text-muted">Type</legend>
        <div className="flex flex-wrap gap-3">
          {types.map((t) => (
            <Chip key={t.id} active={type === t.id} tone={tone === 'chess' ? 'chessSoft' : 'fitSoft'} onClick={() => setType(t.id)}>{t.chip}</Chip>
          ))}
        </div>
      </fieldset>

      {category === 'chess' && type === 'rated' && (
        <fieldset className="mt-6">
          <legend className="mb-3 text-[16px] text-muted">Result <span className="text-muted">(optional)</span></legend>
          <div className="flex gap-3">
            {(['won', 'draw', 'lost'] as GameResult[]).map((r) => (
              <Chip key={r} active={result === r} tone="chessSoft" onClick={() => setResult(result === r ? undefined : r)} className="capitalize">{r}</Chip>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="mt-6">
        <legend className="mb-3 text-[16px] text-muted">Duration (minutes)</legend>
        <div className="grid grid-cols-5 gap-2">
          {DURATIONS.map((d) => (
            <button key={d} aria-pressed={duration === d} onClick={() => setDuration(d)} className={cn('min-h-[56px] rounded-2xl border text-[18px] font-semibold transition-colors duration-150', duration === d ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink hover:border-muted')}>
              {d}
            </button>
          ))}
          <button aria-pressed={duration === 'custom'} onClick={() => { setDuration('custom'); setTimeout(() => customRef.current?.focus(), 0); }} className={cn('min-h-[56px] rounded-2xl border text-[16px] font-semibold transition-colors duration-150', duration === 'custom' ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink hover:border-muted')}>
            Custom
          </button>
        </div>
        {duration === 'custom' && (
          <div className="mt-3">
            <label htmlFor="custom-min" className="mb-1.5 block text-[15px] text-muted">Minutes</label>
            <input
              id="custom-min"
              ref={customRef}
              inputMode="numeric"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))}
              onBlur={() => setCustomTouched(true)}
              aria-invalid={customTouched && !!customError}
              aria-describedby={customTouched && customError ? 'custom-min-error' : undefined}
              className={cn(inputClass, 'max-w-[160px]')}
            />
            {customTouched && customError && <p id="custom-min-error" className="mt-1.5 text-[14px] font-medium text-warn">{customError}</p>}
          </div>
        )}
      </fieldset>

      <fieldset className="mt-6">
        <div className="mb-3 flex justify-between text-[16px] text-muted">
          <legend>Intensity</legend>
          <span aria-live="polite">{intensity} · {INTENSITY_LABEL[intensity]}</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              aria-pressed={intensity === n}
              aria-label={`Intensity ${n}, ${INTENSITY_LABEL[n]}`}
              onClick={() => setIntensity(n)}
              className={cn(
                'min-h-[56px] rounded-2xl border text-[18px] font-semibold transition-colors duration-150',
                n === intensity
                  ? tone === 'chess' ? 'border-chess bg-chess text-on-accent' : 'border-fit bg-fit text-on-accent'
                  : n < intensity
                    ? tone === 'chess' ? 'border-chess bg-chess-soft text-ink' : 'border-fit bg-fit-soft text-ink'
                    : 'border-line bg-surface text-muted hover:text-ink',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-6 flex min-h-[64px] items-center gap-3 rounded-2xl border border-line bg-surface px-5">
        <span className="text-[17px] text-muted">Date</span>
        <span className="flex-1 text-right text-[17px]">{date === today ? `Today, ${fmtDay(date)}` : fmtDay(date)}</span>
        <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Session date" className="w-[132px] rounded-xl bg-raised px-2 py-2 text-[15px] text-ink" />
      </label>

      <div className="mt-6">
        <label htmlFor="notes" className="mb-1.5 block text-[16px] text-muted">Notes (optional)</label>
        <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Pads, 6 rounds" className={cn(inputClass, 'min-h-[104px] py-4 leading-relaxed')} />
      </div>

      <div className="mt-auto pt-8">
        <BigButton onClick={() => void save()}>{editing ? 'Save changes' : 'Save session'}</BigButton>
        {editing && (
          confirmDelete ? (
            <div className="mt-3 rounded-2xl bg-surface p-4">
              <p className="text-[16px]">Delete this session? Its minutes come off the weekly totals.</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button onClick={() => setConfirmDelete(false)} className="min-h-[48px] rounded-2xl bg-raised font-semibold">Keep</button>
                <button onClick={() => void remove()} className="min-h-[48px] rounded-2xl bg-fit font-semibold text-on-accent">Delete</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="mt-2 min-h-[48px] w-full text-[17px] font-medium text-fit-ink">Delete session</button>
          )
        )}
      </div>
    </main>
  );
}
