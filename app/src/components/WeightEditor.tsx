import { useEffect, useMemo, useState } from 'react';
import { db, type WeightEntry } from '../db';
import { cn, fmtDay, fromInputUnit, inputUnitLabel, stLb, toInputUnit, todayISO } from '../lib/format';
import { useData, useSettings } from '../state/data';
import { useToast } from '../state/toast';
import { Icon, inputClass } from './ui';

/**
 * Weigh-in editor used by the quick-add sheet and the Weight tab.
 * One entry per day: saving a day that already has an entry replaces it.
 */
export function WeightEditor({ date: initialDate, titleSlot, onDone }: {
  date?: string;
  titleSlot: React.ReactNode;
  onDone: () => void;
}) {
  const { weights, today } = useData();
  const { units } = useSettings();
  const toast = useToast();
  const [date, setDate] = useState(initialDate ?? today);
  const existing = weights.find((w) => w.date === date);
  const last = weights.length ? weights[weights.length - 1] : undefined;
  const prefillKg = existing?.weightKg ?? last?.weightKg ?? 80;

  const [raw, setRaw] = useState(() => toInputUnit(prefillKg, units).toFixed(1));
  const [fresh, setFresh] = useState(true); // first key press replaces the prefilled value
  const [showWaist, setShowWaist] = useState(!!existing?.waistCm);
  const [waist, setWaist] = useState(existing?.waistCm ? String(existing.waistCm) : '');
  const [changingDate, setChangingDate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // When the date changes, prefill from that day's entry if it has one.
  useEffect(() => {
    const e = weights.find((w) => w.date === date);
    if (e) {
      setRaw(toInputUnit(e.weightKg, units).toFixed(1));
      setWaist(e.waistCm ? String(e.waistCm) : '');
      setShowWaist(!!e.waistCm);
      setFresh(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const value = parseFloat(raw);
  const kg = Number.isFinite(value) ? fromInputUnit(value, units) : NaN;
  const valid = Number.isFinite(kg) && kg >= 30 && kg <= 300;
  const waistNum = waist.trim() === '' ? undefined : parseFloat(waist);
  const waistValid = waistNum === undefined || (Number.isFinite(waistNum) && waistNum >= 40 && waistNum <= 200);

  const press = (key: string) => {
    let next = fresh && key !== 'back' ? '' : raw;
    setFresh(false);
    if (key === 'back') next = next.slice(0, -1);
    else if (key === '.') { if (!next.includes('.')) next = (next || '0') + '.'; }
    else {
      const [int, dec] = next.split('.');
      if (dec !== undefined && dec.length >= 1) return setRaw(next);
      if (dec === undefined && int.length >= 3) return setRaw(next);
      next += key;
    }
    setRaw(next);
  };
  const step = (delta: number) => {
    const base = Number.isFinite(value) ? value : toInputUnit(prefillKg, units);
    setRaw(Math.max(0, base + delta).toFixed(1));
    setFresh(true);
  };

  // Physical keyboard support on desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === '.' || e.key === ',') { e.preventDefault(); press('.'); }
      else if (e.key === 'Backspace') { e.preventDefault(); press('back'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const save = async () => {
    if (!valid || !waistValid) return;
    const prev = await db.weights.get(date);
    const entry: WeightEntry = { date, weightKg: Math.round(kg * 100) / 100, ...(waistNum !== undefined ? { waistCm: waistNum } : {}) };
    await db.weights.put(entry);
    onDone();
    toast.show(`Weigh-in saved · ${value.toFixed(1)} ${inputUnitLabel(units)}`, async () => {
      if (prev) await db.weights.put(prev);
      else await db.weights.delete(date);
    });
  };

  const remove = async () => {
    const prev = await db.weights.get(date);
    await db.weights.delete(date);
    onDone();
    toast.show(`Weigh-in for ${fmtDay(date)} deleted`, async () => { if (prev) await db.weights.put(prev); });
  };

  const subtitle = useMemo(() => {
    const day = date === todayISO() || date === today ? 'Today' : fmtDay(date);
    if (existing) return `${day} · replaces this day’s entry`;
    return `${day} · prefilled from last entry`;
  }, [date, today, existing]);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

  return (
    <div>
      {titleSlot}
      <div className="mt-5 flex items-center justify-between gap-2">
        <button onClick={() => step(-0.1)} aria-label="Decrease by 0.1" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-line text-ink hover:bg-raised">
          <Icon name="minus" size={24} />
        </button>
        <p className="min-w-0 text-center" aria-live="polite">
          <output aria-label={`Weight ${raw || '0'} ${inputUnitLabel(units)}`} className="whitespace-nowrap font-display text-[84px] font-bold leading-none">
            {raw || '0'}
          </output>
          <span className="ml-1 font-display text-[28px] font-semibold text-muted">{inputUnitLabel(units)}</span>
        </p>
        <button onClick={() => step(0.1)} aria-label="Increase by 0.1" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-line text-ink hover:bg-raised">
          <Icon name="plus" size={24} />
        </button>
      </div>
      <div className="mt-1 text-center">
        {changingDate ? (
          <label className="inline-flex items-center gap-3 text-[15px] text-muted">
            Date
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="min-h-[44px] rounded-xl border border-line bg-bg px-3 text-ink" />
          </label>
        ) : (
          <button onClick={() => setChangingDate(true)} className="min-h-[44px] px-2 text-[16px] text-muted underline-offset-4 hover:underline">
            {subtitle}
          </button>
        )}
        {units === 'stlb' && valid && <p className="text-[14px] text-muted">= {stLb(kg)} lb</p>}
        {!valid && raw !== '' && !fresh && (
          <p className="mt-1 text-[14px] font-medium text-warn">Enter a weight between {units === 'kg' ? '30 and 300 kg' : '66 and 661 lb'}.</p>
        )}
      </div>

      {showWaist ? (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line px-4 py-2">
          <label htmlFor="waist" className="flex-1 text-[16px] text-muted">Waist (cm)</label>
          <input
            id="waist"
            inputMode="decimal"
            value={waist}
            onChange={(e) => setWaist(e.target.value.replace(',', '.'))}
            aria-invalid={!waistValid}
            className={cn(inputClass, 'min-h-[44px] w-28 text-right')}
          />
        </div>
      ) : (
        <button onClick={() => setShowWaist(true)} className="mt-3 flex min-h-[52px] w-full items-center justify-between rounded-2xl border border-dashed border-line px-5 text-[16px] text-muted hover:text-ink">
          <span>Add waist measurement</span>
          <span>optional</span>
        </button>
      )}
      {!waistValid && <p className="mt-1 text-[14px] font-medium text-warn">Waist should be between 40 and 200 cm.</p>}

      <div className="mt-3 grid grid-cols-3 gap-3" role="group" aria-label="Number pad">
        {keys.map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            aria-label={k === 'back' ? 'Delete last digit' : k === '.' ? 'Decimal point' : k}
            className="flex min-h-[52px] items-center justify-center rounded-2xl bg-raised text-[26px] font-medium text-ink transition-colors duration-100 active:bg-line"
          >
            {k === 'back' ? <Icon name="backspace" size={26} /> : k}
          </button>
        ))}
      </div>

      <button
        onClick={() => void save()}
        disabled={!valid || !waistValid}
        data-autofocus
        className="mt-4 flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-ink text-[18px] font-semibold text-bg transition-opacity duration-150 hover:opacity-90 disabled:bg-raised disabled:text-muted"
      >
        Save weigh-in
      </button>

      {existing && (
        confirmDelete ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button onClick={() => setConfirmDelete(false)} className="min-h-[48px] rounded-2xl bg-raised font-semibold">Keep</button>
            <button onClick={() => void remove()} className="min-h-[48px] rounded-2xl bg-fit font-semibold text-on-accent">Delete weigh-in</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="mt-2 min-h-[44px] w-full text-[16px] font-medium text-fit-ink">Delete this weigh-in</button>
        )
      )}
    </div>
  );
}
