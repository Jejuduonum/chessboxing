import { useState } from 'react';
import { db, TC_LABEL, type Settings, type TimeControl } from '../db';
import { addDays, cn, daysBetween, fmtDMY, fmtInt, todayISO } from '../lib/format';
import { saveHistory, latestRating, type RatingHistory } from '../lib/lichess';
import { LichessConnect } from '../components/LichessConnect';
import { BigButton, Dot, Field, Icon, IconButton, inputClass } from '../components/ui';

type Step = 'welcome' | 'goals' | 'lichess';

interface Draft {
  primaryTimeControl: TimeControl;
  startRating: string;
  targetRating: string;
  startWeightKg: string;
  targetWeightKg: string;
  targetDate: string;
}

export function Onboarding() {
  const today = todayISO();
  const [step, setStep] = useState<Step>('welcome');
  const [draft, setDraft] = useState<Draft>({
    primaryTimeControl: 'rapid',
    startRating: '1100',
    targetRating: '1500',
    startWeightKg: '',
    targetWeightKg: '',
    targetDate: addDays(today, 56),
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [username, setUsername] = useState('');
  const [history, setHistory] = useState<RatingHistory | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const num = (v: string) => parseFloat(v.replace(',', '.'));

  const errors: Partial<Record<keyof Draft, string>> = {};
  const sr = num(draft.startRating), tr = num(draft.targetRating), sw = num(draft.startWeightKg), tw = num(draft.targetWeightKg);
  if (!(sr >= 400 && sr <= 3500)) errors.startRating = 'Enter a rating between 400 and 3500.';
  if (!(tr >= 400 && tr <= 3500)) errors.targetRating = 'Enter a rating between 400 and 3500.';
  else if (!errors.startRating && tr <= sr) errors.targetRating = 'Target should be above your current rating.';
  if (!(sw >= 30 && sw <= 300)) errors.startWeightKg = 'Enter your weight in kg (30–300).';
  if (!(tw >= 30 && tw <= 300)) errors.targetWeightKg = 'Enter a target in kg (30–300).';
  if (!draft.targetDate || daysBetween(today, draft.targetDate) < 7) errors.targetDate = 'Pick a date at least a week from today.';
  const goalsValid = Object.keys(errors).length === 0;
  const showErr = (k: keyof Draft) => (touched[k] ? errors[k] : undefined);

  const finish = async (withLichess: boolean) => {
    setSaving(true);
    const settings: Settings = {
      id: 'me',
      lichessUsername: withLichess ? username : '',
      primaryTimeControl: draft.primaryTimeControl,
      startRating: Math.round(sr),
      targetRating: Math.round(tr),
      startDate: today,
      targetDate: draft.targetDate,
      startWeightKg: Math.round(sw * 10) / 10,
      targetWeightKg: Math.round(tw * 10) / 10,
      units: 'kg',
      theme: 'dark',
      onboarded: true,
    };
    if (withLichess && history) await saveHistory(history, { replace: true });
    await db.weights.put({ date: today, weightKg: settings.startWeightKg });
    await db.settings.put(settings);
  };

  if (step === 'welcome') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-app flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+48px)]">
        <div className="flex gap-2" aria-hidden="true">
          <span className="h-2 w-7 rounded-full bg-chess" />
          <span className="h-2 w-7 rounded-full bg-fit" />
        </div>
        <h1 className="mt-12 font-display text-[clamp(80px,26vw,112px)] font-bold uppercase leading-[0.88]">
          <span className="block text-chess">Chess</span>
          <span className="block text-fit">Boxing</span>
          <span className="block">Tracker</span>
        </h1>
        <p className="mt-8 text-[19px] leading-relaxed text-muted">
          Two goals, one countdown. Track your Lichess rating and your weight cut side by side.
        </p>
        <ul className="mt-10 space-y-3">
          <li className="flex items-center gap-4 rounded-3xl bg-surface p-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-chess-soft text-chess-ink"><Icon name="pawn" size={24} /></span>
            <span>
              <span className="block text-[17px] font-semibold">Rating synced from Lichess</span>
              <span className="block text-[15px] text-muted">Charted against your target line</span>
            </span>
          </li>
          <li className="flex items-center gap-4 rounded-3xl bg-surface p-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-fit-soft text-fit-ink"><Icon name="scale" size={24} /></span>
            <span>
              <span className="block text-[17px] font-semibold">Weigh-ins in seconds</span>
              <span className="block text-[15px] text-muted">7-day trend, not daily noise</span>
            </span>
          </li>
        </ul>
        <div className="mt-auto pt-10">
          <BigButton onClick={() => setStep('goals')} data-autofocus>Get started</BigButton>
          <p className="mt-4 text-center text-[15px] text-muted">Your data stays on this device.</p>
        </div>
      </main>
    );
  }

  const stepNo = step === 'goals' ? 1 : 2;
  const header = (
    <div className="pt-[calc(env(safe-area-inset-top)+12px)]">
      <div className="flex items-center justify-between">
        <IconButton icon="left" label="Back" size={26} onClick={() => setStep(step === 'goals' ? 'welcome' : 'goals')} className="-ml-2" />
        <p className="text-[16px] text-muted">Step {stepNo} of 2</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2" aria-hidden="true">
        <span className="h-1 rounded-full bg-ink" />
        <span className={cn('h-1 rounded-full', stepNo === 2 ? 'bg-ink' : 'bg-line')} />
      </div>
    </div>
  );

  if (step === 'goals') {
    const days = daysBetween(today, draft.targetDate);
    const pts = !errors.startRating && !errors.targetRating ? tr - sr : null;
    const kg = !errors.startWeightKg && !errors.targetWeightKg ? tw - sw : null;
    const tcs: TimeControl[] = ['rapid', 'blitz', 'classical'];
    return (
      <main className="mx-auto flex min-h-dvh max-w-app flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        {header}
        <h1 className="h-page mt-6">Set your goals</h1>
        <p className="mt-1 text-[17px] text-muted">You can change these any time in Settings.</p>

        <h2 className="mt-6 flex items-center gap-2 text-[15px] font-semibold uppercase tracking-[0.08em] text-muted"><Dot tone="chess" />Chess</h2>
        <div role="radiogroup" aria-label="Goal time control" className="mt-3 grid grid-cols-3 gap-3">
          {tcs.map((tc) => {
            const on = draft.primaryTimeControl === tc;
            return (
              <button
                key={tc}
                role="radio"
                aria-checked={on}
                onClick={() => set('primaryTimeControl', tc)}
                className={cn('min-h-[52px] rounded-2xl border text-[17px] font-medium transition-colors duration-150', on ? 'border-chess bg-chess-soft text-ink' : 'border-line bg-surface text-muted hover:text-ink')}
              >
                {TC_LABEL[tc]}
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Field id="sr" label="Current rating" error={showErr('startRating')}>
            <input id="sr" inputMode="numeric" className={inputClass} value={draft.startRating} onChange={(e) => set('startRating', e.target.value)} onBlur={() => setTouched((t) => ({ ...t, startRating: true }))} aria-invalid={!!showErr('startRating')} />
          </Field>
          <Field id="tr" label="Target rating" error={showErr('targetRating')}>
            <input id="tr" inputMode="numeric" className={inputClass} value={draft.targetRating} onChange={(e) => set('targetRating', e.target.value)} onBlur={() => setTouched((t) => ({ ...t, targetRating: true }))} aria-invalid={!!showErr('targetRating')} />
          </Field>
        </div>

        <h2 className="mt-7 flex items-center gap-2 text-[15px] font-semibold uppercase tracking-[0.08em] text-muted"><Dot tone="fit" />Weight</h2>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Field id="sw" label="Current weight (kg)" error={showErr('startWeightKg')}>
            <input id="sw" inputMode="decimal" placeholder="e.g. 100.0" className={inputClass} value={draft.startWeightKg} onChange={(e) => set('startWeightKg', e.target.value)} onBlur={() => setTouched((t) => ({ ...t, startWeightKg: true }))} aria-invalid={!!showErr('startWeightKg')} />
          </Field>
          <Field id="tw" label="Target weight (kg)" error={showErr('targetWeightKg')}>
            <input id="tw" inputMode="decimal" placeholder="e.g. 80.0" className={inputClass} value={draft.targetWeightKg} onChange={(e) => set('targetWeightKg', e.target.value)} onBlur={() => setTouched((t) => ({ ...t, targetWeightKg: true }))} aria-invalid={!!showErr('targetWeightKg')} />
          </Field>
        </div>
        <div className="mt-5">
          <Field id="td" label="Target date" error={showErr('targetDate')} hint={!showErr('targetDate') && draft.targetDate ? fmtDMY(draft.targetDate) : undefined}>
            <input id="td" type="date" min={addDays(today, 7)} className={inputClass} value={draft.targetDate} onChange={(e) => set('targetDate', e.target.value)} onBlur={() => setTouched((t) => ({ ...t, targetDate: true }))} aria-invalid={!!showErr('targetDate')} />
          </Field>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-2xl bg-surface px-5 py-4 text-[17px]" aria-live="polite">
          <span className="text-muted">{days > 0 ? `${days} days` : '— days'}</span>
          <span className="font-semibold text-chess-ink">{pts !== null ? `${pts >= 0 ? '+' : '−'}${fmtInt(Math.abs(pts))} pts` : '— pts'}</span>
          <span className="font-semibold text-fit-ink">{kg !== null ? `${kg <= 0 ? '−' : '+'}${Math.abs(kg).toFixed(Math.abs(kg) % 1 ? 1 : 0)} kg` : '— kg'}</span>
        </div>

        <div className="mt-auto pt-8">
          <BigButton
            onClick={() => {
              if (!goalsValid) {
                setTouched({ startRating: true, targetRating: true, startWeightKg: true, targetWeightKg: true, targetDate: true });
                const first = (['startRating', 'targetRating', 'startWeightKg', 'targetWeightKg', 'targetDate'] as const).find((k) => errors[k]);
                const ids: Record<string, string> = { startRating: 'sr', targetRating: 'tr', startWeightKg: 'sw', targetWeightKg: 'tw', targetDate: 'td' };
                if (first) document.getElementById(ids[first])?.focus();
                return;
              }
              setStep('lichess');
            }}
          >
            Continue
          </BigButton>
        </div>
      </main>
    );
  }

  const goalRating = history ? latestRating(history[draft.primaryTimeControl]) : null;
  return (
    <main className="mx-auto flex min-h-dvh max-w-app flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+24px)]">
      {header}
      <h1 className="h-page mt-6">Connect Lichess</h1>
      <p className="mt-1 text-[17px] leading-snug text-muted">We read your public rating history. No password or login needed.</p>
      <div className="mt-6">
        <LichessConnect
          initial={username}
          goal={draft.primaryTimeControl}
          onChange={(u) => { setUsername(u); setHistory(null); }}
          onFound={(u, h) => { setUsername(u); setHistory(h); }}
        />
        {goalRating !== null && Math.round(goalRating) !== Math.round(sr) && (
          <button onClick={() => set('startRating', String(goalRating))} className="mt-3 min-h-[44px] text-left text-[16px] font-medium text-chess-ink underline underline-offset-4">
            Use {fmtInt(goalRating)} as your starting {TC_LABEL[draft.primaryTimeControl].toLowerCase()} rating (you entered {fmtInt(sr)})
          </button>
        )}
      </div>
      <div className="mt-auto pt-8">
        <BigButton disabled={!history || saving} onClick={() => void finish(true)}>Finish setup</BigButton>
        <button disabled={saving} onClick={() => void finish(false)} className="mt-2 min-h-[48px] w-full text-[17px] text-muted hover:text-ink">
          Skip for now
        </button>
      </div>
    </main>
  );
}
