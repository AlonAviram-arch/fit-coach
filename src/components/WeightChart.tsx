import type { WeighIn } from '../lib/types';

const W = 320;
const H = 160;
const PAD = { top: 12, right: 12, bottom: 22, left: 34 };

/** Simple line chart of weigh-ins with a dashed goal line. */
export default function WeightChart({ weighIns, target }: { weighIns: WeighIn[]; target?: number }) {
  const values = weighIns.map((w) => w.weightKg);
  const lo = Math.floor(Math.min(...values, target ?? Infinity) - 0.5);
  const hi = Math.ceil(Math.max(...values, target ?? -Infinity) + 0.5);
  const t0 = new Date(weighIns[0].date).getTime();
  const t1 = new Date(weighIns[weighIns.length - 1].date).getTime();
  const span = Math.max(1, t1 - t0);

  const x = (date: string) => PAD.left + ((new Date(date).getTime() - t0) / span) * (W - PAD.left - PAD.right);
  const y = (kg: number) => PAD.top + ((hi - kg) / (hi - lo)) * (H - PAD.top - PAD.bottom);

  const path = weighIns.map((w, i) => `${i ? 'L' : 'M'}${x(w.date).toFixed(1)},${y(w.weightKg).toFixed(1)}`).join(' ');
  const ticks = [lo, (lo + hi) / 2, hi];
  const fmt = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="גרף משקל" style={{ direction: 'ltr' }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
          <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="axis">{Math.round(t * 10) / 10}</text>
        </g>
      ))}
      {target !== undefined && (
        <g>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(target)} y2={y(target)} className="goal" />
          <text x={W - PAD.right} y={y(target) - 4} textAnchor="end" className="axis goal-label">יעד {target}</text>
        </g>
      )}
      <path d={path} className="line" />
      {weighIns.map((w) => (
        <circle key={w.id} cx={x(w.date)} cy={y(w.weightKg)} r={3.5} className="dot">
          <title>{`${fmt(w.date)}: ${w.weightKg} ק״ג`}</title>
        </circle>
      ))}
      <text x={PAD.left} y={H - 6} className="axis">{fmt(weighIns[0].date)}</text>
      <text x={W - PAD.right} y={H - 6} textAnchor="end" className="axis">{fmt(weighIns[weighIns.length - 1].date)}</text>
    </svg>
  );
}
