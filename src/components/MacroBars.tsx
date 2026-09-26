import type { Targets } from '../lib/types';

const ROWS: { key: keyof Targets; label: string; unit: string }[] = [
  { key: 'calories', label: 'קלוריות', unit: '' },
  { key: 'protein', label: 'חלבון', unit: 'ג׳' },
  { key: 'carbs', label: 'פחמימות', unit: 'ג׳' },
  { key: 'fat', label: 'שומן', unit: 'ג׳' },
];

export default function MacroBars({ totals, targets, compact }: { totals: Targets; targets: Targets | null; compact?: boolean }) {
  return (
    <div className={compact ? 'macros compact' : 'macros'}>
      {ROWS.map(({ key, label, unit }) => {
        const value = Math.round(totals[key]);
        const target = targets?.[key] ?? 0;
        const pct = target ? Math.min(100, (value / target) * 100) : 0;
        const over = target > 0 && value > target * 1.05;
        return (
          <div className="macro" key={key}>
            <div className="macro-head">
              <span>{label}</span>
              <span className="num">
                {value}
                {target ? <span className="muted"> / {target}{unit}</span> : null}
              </span>
            </div>
            <div className="bar">
              <div className={`bar-fill ${key}${over ? ' over' : ''}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
