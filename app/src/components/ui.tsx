import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/format';

/* ---------- Icons: one outlined family, 1.8 stroke ---------- */
const PATHS: Record<string, ReactNode> = {
  home: <path d="M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5A1.5 1.5 0 0 1 3.5 19z" />,
  pawn: (
    <>
      <circle cx="12" cy="6" r="2.5" />
      <path d="M10.2 9.5h3.6l1.2 7.5H9z" />
      <path d="M6.5 20.5h11" />
    </>
  ),
  scale: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <path d="M8.3 10.2a5 5 0 0 1 7.4 0" />
      <path d="m12 10.5 1.3-2.3" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" />
      <path d="M4.5 6h.01" /><path d="M4.5 12h.01" /><path d="M4.5 18h.01" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 8h9" /><path d="M19 8h1" /><circle cx="16" cy="8" r="2.5" />
      <path d="M4 16h1" /><path d="M11 16h9" /><circle cx="8" cy="16" r="2.5" />
    </>
  ),
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  minus: <path d="M5 12h14" />,
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  left: <path d="m15 18-6-6 6-6" />,
  right: <path d="m9 18 6-6-6-6" />,
  up: <path d="m6 15 6-6 6 6" />,
  check: <path d="M20 6 9 17l-5-5" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5" /><path d="M12 16.2h.01" /></>,
  refresh: <><path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" /><path d="M20.5 4v4.5H16" /></>,
  backspace: (
    <>
      <path d="M9.5 5H20a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H9.5L3 12z" />
      <path d="m12 9.5 5 5" /><path d="m17 9.5-5 5" />
    </>
  ),
  download: <><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>,
  upload: <><path d="M12 20V9" /><path d="m7 14 5-5 5 5" /><path d="M5 4h14" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4.5h6V7" /><path d="M6.5 7l1 13h9l1-13" /></>,
  wifiOff: <><path d="M2 2l20 20" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M5 12.6a10 10 0 0 1 5.2-2.6" /><path d="M12 20h.01" /></>,
};

export function Icon({ name, size = 22, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      {PATHS[name]}
    </svg>
  );
}

/* ---------- Page header ---------- */
export function PageHeader({ title, eyebrow, action, leading }: { title: string; eyebrow?: ReactNode; action?: ReactNode; leading?: ReactNode }) {
  return (
    <header className="flex items-start gap-3 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
      {leading}
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="text-[15px] leading-snug text-muted">{eyebrow}</p>}
        <h1 className="h-page">{title}</h1>
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </header>
  );
}

/* ---------- Buttons ---------- */
type Tone = 'ink' | 'chess' | 'fit' | 'surface';
const TONE: Record<Tone, string> = {
  ink: 'bg-ink text-bg hover:opacity-90',
  chess: 'bg-chess text-on-accent hover:opacity-90',
  fit: 'bg-fit text-on-accent hover:opacity-90',
  surface: 'bg-surface text-ink hover:bg-raised',
};

export function Pill({ tone = 'surface', icon, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; icon?: string }) {
  return (
    <button
      className={cn('inline-flex min-h-[48px] items-center gap-2 rounded-full px-5 text-[16px] font-semibold transition-colors duration-150 disabled:opacity-50', TONE[tone], className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={20} />}
      <span>{children}</span>
    </button>
  );
}

export function BigButton({ tone = 'ink', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      className={cn(
        'flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl px-5 text-[18px] font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted',
        TONE[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({ icon, label, className, size = 22, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; size?: number }) {
  return (
    <button aria-label={label} className={cn('inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors duration-150 hover:bg-raised', className)} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
}

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({
  options, value, onChange, label, tone = 'ink', size = 'md', className,
}: {
  options: { value: T; label: string; tone?: Tone }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  tone?: Tone;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex gap-1 rounded-2xl bg-surface p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        const t = o.tone ?? tone;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex flex-1 items-center justify-center rounded-xl font-semibold transition-colors duration-150',
              size === 'sm' ? 'min-h-[44px] px-4 text-[15px]' : 'min-h-[48px] px-3 text-[16px]',
              active ? TONE[t === 'surface' ? 'ink' : t] : 'text-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Chips ---------- */
export function Chip({ active, tone = 'ink', children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean; tone?: 'ink' | 'chess' | 'fit' | 'chessSoft' | 'fitSoft' }) {
  const on: Record<string, string> = {
    ink: 'bg-ink text-bg border-ink',
    chess: 'bg-chess text-on-accent border-chess',
    fit: 'bg-fit text-on-accent border-fit',
    chessSoft: 'bg-chess-soft text-ink border-chess',
    fitSoft: 'bg-fit-soft text-ink border-fit',
  };
  return (
    <button
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-2 whitespace-nowrap rounded-full border px-5 text-[16px] font-medium transition-colors duration-150',
        active ? on[tone] : 'border-line bg-surface text-ink hover:border-muted',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- Status (text + icon, never colour alone) ---------- */
export function Status({ kind, children }: { kind: 'good' | 'warn' | 'neutral'; children: ReactNode }) {
  return (
    <p className={cn('flex items-center gap-2 text-[16px] font-medium leading-snug', kind === 'good' ? 'text-good' : kind === 'warn' ? 'text-warn' : 'text-muted')}>
      <Icon name={kind === 'good' ? 'up' : kind === 'warn' ? 'alert' : 'right'} size={20} />
      <span className="[text-wrap:pretty]">{children}</span>
    </p>
  );
}

/* ---------- Stat tile ---------- */
export function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface px-4 py-3">
      <p className="text-[14px] text-muted">{label}</p>
      <p className="whitespace-nowrap font-display text-[30px] font-bold leading-tight">
        {value}
        {unit && <span className="ml-1 text-[16px] font-semibold text-muted">{unit}</span>}
      </p>
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('mb-2 text-[16px] text-muted', className)}>{children}</h2>;
}

export function Dot({ tone }: { tone: 'chess' | 'fit' }) {
  return <span aria-hidden="true" className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', tone === 'chess' ? 'bg-chess' : 'bg-fit')} />;
}

/* ---------- Labelled field ---------- */
export function Field({ id, label, error, children, hint }: { id: string; label: string; error?: string | null; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-[15px] text-muted">{label}</label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[14px] font-medium text-warn">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[14px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass =
  'block w-full min-h-[56px] rounded-2xl border border-line bg-surface px-5 text-[18px] text-ink placeholder:text-muted focus:border-chess focus:outline-none focus:ring-1 focus:ring-chess aria-[invalid=true]:border-warn';
