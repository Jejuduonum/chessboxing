import type { Units } from '../db';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const todayISO = () => toISO(new Date());

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const timeOf = (s: string) => parseISO(s).getTime();

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 864e5);
}

export function mondayOf(s: string): string {
  const d = parseISO(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISO(d);
}

/** Tue 3 Nov */
export const fmtDay = (s: string) => {
  const d = parseISO(s);
  return `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}`;
};
/** 25 Oct */
export const fmtDM = (s: string) => {
  const d = parseISO(s);
  return `${d.getDate()} ${MO[d.getMonth()]}`;
};
/** 25 Dec 2026 */
export const fmtDMY = (s: string) => `${fmtDM(s)} ${parseISO(s).getFullYear()}`;
export const fmtWeekday = (s: string) => WD[parseISO(s).getDay()];
export const weekdayLetter = (s: string) => WD[parseISO(s).getDay()].slice(0, 1);

/** Today · Yesterday · Mon · 25 Oct */
export function relDay(s: string, today: string): string {
  const diff = daysBetween(s, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return fmtWeekday(s);
  return fmtDM(s);
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

export function timeAgo(ms: number, now = Date.now()): string {
  const min = Math.round((now - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return fmtDay(toISO(new Date(ms)));
}

/* ---------- Weight units ---------- */
export const KG_PER_LB = 0.45359237;
export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;

/** Value shown in the input unit: kg for metric, total pounds for st/lb. */
export const toInputUnit = (kg: number, units: Units) => (units === 'kg' ? kg : kgToLb(kg));
export const fromInputUnit = (v: number, units: Units) => (units === 'kg' ? v : lbToKg(v));
export const inputUnitLabel = (units: Units) => (units === 'kg' ? 'kg' : 'lb');

export function stLb(kg: number): string {
  const lb = kgToLb(kg);
  let st = Math.floor(lb / 14);
  let rem = Math.round((lb - st * 14) * 10) / 10;
  if (rem >= 14) { st += 1; rem = 0; }
  return `${st} st ${rem.toFixed(1)}`;
}

/** Big-numeral parts: {value, unit}. */
export function weightParts(kg: number, units: Units): { value: string; unit: string } {
  if (units === 'kg') return { value: kg.toFixed(1), unit: 'kg' };
  return { value: stLb(kg), unit: 'lb' };
}
export function fmtWeight(kg: number, units: Units): string {
  const p = weightParts(kg, units);
  return `${p.value} ${p.unit}`;
}
/** A difference in weight (no sign). */
export function fmtDelta(kg: number, units: Units): string {
  return units === 'kg' ? `${Math.abs(kg).toFixed(1)} kg` : `${kgToLb(Math.abs(kg)).toFixed(1)} lb`;
}
export const rateUnit = (units: Units) => (units === 'kg' ? 'kg/wk' : 'lb/wk');
export const fmtRate = (kgPerWk: number, units: Units) =>
  (units === 'kg' ? Math.abs(kgPerWk) : kgToLb(Math.abs(kgPerWk))).toFixed(1);

/** Big-numeral size that keeps long values (e.g. "15 st 6.4") inside a 375px screen. */
export const numeralSize = (value: string, size: 'hero' | 'card') =>
  value.length > 6
    ? size === 'hero' ? 'text-[clamp(56px,17vw,72px)]' : 'text-[clamp(48px,14vw,60px)]'
    : size === 'hero' ? 'text-[clamp(80px,26vw,104px)]' : 'text-[clamp(64px,20vw,88px)]';

export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
