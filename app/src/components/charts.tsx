import { ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, XAxis, YAxis } from 'recharts';
import { timeOf } from '../lib/format';

type Pt = { date: string; v: number };

/* ---------- Sparkline (Home goal cards): plan start → today ---------- */
export function Sparkline({ series, start, today, from, to, targetDate, color }: {
  series: Pt[]; start: string; today: string; from: number; to: number; targetDate: string; color: string;
}) {
  const W = 150, H = 48, P = 4;
  const t0 = timeOf(start);
  const t1 = Math.max(timeOf(today), t0 + 864e5);
  const tEnd = timeOf(targetDate);
  const lineAt = (t: number) => from + (to - from) * Math.min(1, Math.max(0, (t - t0) / Math.max(1, tEnd - t0)));
  const vals = [...series.map((p) => p.v), lineAt(t0), lineAt(t1)];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = Math.max(hi - lo, Math.abs(to - from) * 0.08, 1);
  const X = (t: number) => P + ((W - 2 * P) * (t - t0)) / (t1 - t0);
  const Y = (v: number) => P + (H - 2 * P) * (1 - (v - (lo - span * 0.1)) / (span * 1.2));
  const d = series.map((p, i) => `${i ? 'L' : 'M'}${X(timeOf(p.date)).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-12 w-full" preserveAspectRatio="none" aria-hidden="true">
      <line x1={X(t0)} y1={Y(lineAt(t0))} x2={X(t1)} y2={Y(lineAt(t1))} stroke="var(--target)" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      {series.length > 1 && <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/* ---------- Goal chart: fixed axis start → target date ---------- */
interface GoalChartProps {
  start: string;
  target: string;
  today: string;
  from: number;
  to: number;
  line: Pt[];
  dots?: Pt[];
  color: string;
  labelColor: string;
  fmt: (v: number) => string;
  startTick: string;
  endTick: string;
  ariaLabel: string;
}

export function GoalChart({ start, target, today, from, to, line, dots = [], color, labelColor, fmt, startTick, endTick, ariaLabel }: GoalChartProps) {
  const t0 = timeOf(start), t1 = Math.max(timeOf(target), t0 + 864e5), tT = Math.min(Math.max(timeOf(today), t0), t1);
  const lineData = line.map((p) => ({ t: timeOf(p.date), v: p.v }));
  const dotData = dots.map((p) => ({ t: timeOf(p.date), v: p.v }));
  const targetData = [{ t: t0, v: from }, { t: t1, v: to }];
  const all = [from, to, ...lineData.map((p) => p.v), ...dotData.map((p) => p.v)];
  const lo = Math.min(...all), hi = Math.max(...all);
  const pad = Math.max((hi - lo) * 0.12, 1);
  const showToday = (tT - t0) / (t1 - t0) > 0.3 && (t1 - tT) / (t1 - t0) > 0.3;
  const ticks = showToday ? [t0, tT, t1] : [t0, t1];
  const last = lineData.length - 1;

  const Tick = (props: { x?: number; y?: number; payload?: { value: number } }) => {
    const v = props.payload?.value;
    const anchor = v === t0 ? 'start' : v === t1 ? 'end' : 'middle';
    const text = v === t0 ? startTick : v === t1 ? endTick : 'Today';
    return (
      <text x={props.x} y={(props.y ?? 0) + 16} textAnchor={anchor} fill="var(--muted)" fontSize={14} fontFamily="Inter, sans-serif">
        {text}
      </text>
    );
  };

  return (
    <div role="img" aria-label={ariaLabel} className="h-[230px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 16, right: 4, bottom: 4, left: 4 }}>
          <XAxis type="number" dataKey="t" domain={[t0, t1]} ticks={ticks} tick={<Tick />} axisLine={false} tickLine={false} interval={0} allowDataOverflow height={28} />
          <YAxis type="number" dataKey="v" domain={[lo - pad, hi + pad]} hide />
          <ReferenceLine y={from} stroke="var(--line)" />
          <ReferenceLine y={to} stroke="var(--line)" />
          <ReferenceLine x={tT} stroke="var(--target)" strokeDasharray="2 4" label={showToday ? undefined : { value: 'Today', position: 'insideBottomLeft', fill: 'var(--muted)', fontSize: 13, offset: 6 }} />
          <Line data={targetData} dataKey="v" stroke="var(--target)" strokeWidth={2} strokeDasharray="7 7" dot={false} activeDot={false} isAnimationActive={false} />
          {dotData.length > 0 && (
            <Scatter
              data={dotData}
              dataKey="v"
              isAnimationActive={false}
              shape={(p: { cx?: number; cy?: number }) => <circle cx={p.cx} cy={p.cy} r={4} fill={color} fillOpacity={0.32} />}
            />
          )}
          {lineData.length > 0 && (
            <Line
              data={lineData}
              dataKey="v"
              stroke={color}
              strokeWidth={3.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              isAnimationActive={false}
              activeDot={false}
              dot={(p: { cx?: number; cy?: number; index?: number; key?: string }) =>
                p.index === last ? (
                  <g key={p.key ?? 'last'}>
                    <circle cx={p.cx} cy={p.cy} r={7} fill={color} stroke="var(--surface)" strokeWidth={2} />
                    <text x={(p.cx ?? 0) + 14} y={(p.cy ?? 0) - 10} fill={labelColor} fontSize={18} fontWeight={700} fontFamily="Inter, sans-serif">
                      {fmt(lineData[last].v)}
                    </text>
                  </g>
                ) : (
                  <g key={p.key ?? `d${p.index}`} />
                )
              }
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
