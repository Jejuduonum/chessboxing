import type { Session, Settings, WeightEntry } from '../db';
import { addDays, daysBetween, mondayOf } from './format';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function planDays(s: Settings, today: string) {
  const total = Math.max(1, daysBetween(s.startDate, s.targetDate));
  const elapsed = clamp(daysBetween(s.startDate, today), 0, total);
  const left = Math.max(0, daysBetween(today, s.targetDate));
  return { total, elapsed, left, dayNumber: Math.min(total, elapsed + 1) };
}

/** Straight target line from (startDate, from) to (targetDate, to). */
export function lineAt(s: Settings, date: string, from: number, to: number): number {
  const total = Math.max(1, daysBetween(s.startDate, s.targetDate));
  return from + (to - from) * clamp(daysBetween(s.startDate, date) / total, 0, 1);
}

/* ---------------- Weight ---------------- */

/** Mean of entries within the 7 days ending on `date`. */
export function maAt(sorted: WeightEntry[], date: string): number | null {
  const from = addDays(date, -6);
  const w = sorted.filter((e) => e.date >= from && e.date <= date);
  if (!w.length) return null;
  return w.reduce((a, e) => a + e.weightKg, 0) / w.length;
}

export interface WeightStats {
  count: number;
  hasTrend: boolean;
  latest: WeightEntry | null;
  current: number; // 7-day average (or latest reading before a trend exists)
  soFar: number; // current − start (negative = lost)
  targetToday: number;
  ahead: number; // > 0 means ahead of the target line, in kg
  remaining: number; // kg still to go (0 when reached)
  pace: number | null; // kg/wk toward the goal (negative = wrong direction)
  needed: number | null; // kg/wk required to hit the target date
  projected: string | null; // projected finish date
  maSeries: { date: string; v: number }[];
}

export function weightStats(s: Settings, entries: WeightEntry[], today: string): WeightStats {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const count = sorted.length;
  const latest = count ? sorted[count - 1] : null;
  const hasTrend = count >= 3;
  const dir = s.targetWeightKg < s.startWeightKg ? -1 : 1;
  const current = latest ? (hasTrend ? maAt(sorted, latest.date) ?? latest.weightKg : latest.weightKg) : s.startWeightKg;
  const targetToday = lineAt(s, today, s.startWeightKg, s.targetWeightKg);
  // ahead > 0 when current is past the line in the goal's direction
  const aheadKg = dir === -1 ? targetToday - current : current - targetToday;
  const remaining = Math.max(0, dir === -1 ? current - s.targetWeightKg : s.targetWeightKg - current);
  const { left } = planDays(s, today);

  // Weekly rate = change in the moving average over the last 14 days, per week.
  let pace: number | null = null;
  if (hasTrend && latest) {
    const base = sorted.find((e) => e.date >= addDays(latest.date, -14));
    if (base) {
      const span = daysBetween(base.date, latest.date);
      const maNow = maAt(sorted, latest.date);
      const maThen = maAt(sorted, base.date);
      if (span >= 3 && maNow !== null && maThen !== null) pace = ((maNow - maThen) / span) * 7 * dir;
    }
  }
  const needed = hasTrend ? (remaining / Math.max(left, 1)) * 7 : null;
  const projected =
    latest && pace !== null && pace > 0 && remaining > 0
      ? addDays(latest.date, Math.ceil((remaining / pace) * 7))
      : null;
  const maSeries = sorted.map((e) => ({ date: e.date, v: maAt(sorted, e.date) ?? e.weightKg }));
  return {
    count, hasTrend, latest, current,
    soFar: current - s.startWeightKg,
    targetToday, ahead: aheadKg, remaining, pace, needed, projected, maSeries,
  };
}

/* ---------------- Chess ---------------- */

export interface ChessStats {
  hasData: boolean;
  current: number;
  weekChange: number;
  targetToday: number;
  ahead: number;
  toGo: number;
  pace: number;
  needed: number;
  series: { date: string; v: number }[];
}

export function chessStats(s: Settings, points: [string, number][] | undefined, today: string): ChessStats {
  const pts = [...(points ?? [])].sort((a, b) => a[0].localeCompare(b[0]));
  const hasData = pts.length > 0;
  const current = hasData ? pts[pts.length - 1][1] : s.startRating;
  const weekAgo = addDays(today, -7);
  const before = [...pts].reverse().find((p) => p[0] <= weekAgo);
  const inWeek = pts.find((p) => p[0] > weekAgo);
  const weekChange = before ? current - before[1] : inWeek ? current - inWeek[1] : 0;
  const { elapsed, left } = planDays(s, today);
  const targetToday = lineAt(s, today, s.startRating, s.targetRating);
  const toGo = Math.max(0, s.targetRating - current);

  // Chart series from the plan start; anchor with the last rating before it.
  const inPlan = pts.filter((p) => p[0] >= s.startDate && p[0] <= today);
  const anchor = [...pts].reverse().find((p) => p[0] < s.startDate);
  const series = [
    ...(anchor ? [{ date: s.startDate, v: anchor[1] }] : []),
    ...inPlan.map(([date, v]) => ({ date, v })),
  ];
  if (hasData && (!series.length || series[series.length - 1].date !== today)) {
    // extend the line to today at the latest known rating
    if (series.length) series.push({ date: today, v: current });
  }
  return {
    hasData,
    current,
    weekChange,
    targetToday,
    ahead: current - targetToday,
    toGo,
    pace: ((current - s.startRating) / Math.max(elapsed, 1)) * 7,
    needed: (toGo / Math.max(left, 1)) * 7,
    series,
  };
}

/* ---------------- Sessions ---------------- */

export function weekSummary(sessions: Session[], monday: string) {
  const end = addDays(monday, 6);
  const list = sessions.filter((x) => x.date >= monday && x.date <= end);
  const chess = list.filter((x) => x.category === 'chess').reduce((a, x) => a + x.durationMin, 0);
  const fitness = list.filter((x) => x.category === 'fitness').reduce((a, x) => a + x.durationMin, 0);
  const perDay = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return { date: d, count: list.filter((x) => x.date === d).length };
  });
  return { list, chess, fitness, total: chess + fitness, count: list.length, perDay };
}

export const thisMonday = (today: string) => mondayOf(today);
