import { addDays, today } from '../lib/nutrition';
import { cacheHitRate, sumDays, useUsageLog, type DayUsage } from '../lib/usage';

const usd = (n: number) => (n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`);
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Claude API usage recorded on this device: today and the last 7 days. */
export default function UsagePanel() {
  const log = useUsageLog();
  const day = log[today()];
  const week = sumDays(Array.from({ length: 7 }, (_, i) => log[addDays(today(), -i)]).filter((d): d is DayUsage => !!d));

  if (!week.requests) {
    return <p className="muted small">כאן יופיעו השימוש והעלות המשוערת אחרי ההודעה הראשונה.</p>;
  }
  return (
    <div className="usage">
      <div className="usage-row">
        <span>היום</span>
        <span className="num">{day ? `${day.requests} בקשות · ${usd(day.costUsd)} · ${pct(cacheHitRate(day))} מהמטמון` : 'אין שימוש'}</span>
      </div>
      <div className="usage-row">
        <span>7 ימים</span>
        <span className="num">{week.requests} בקשות · {usd(week.costUsd)} · {pct(cacheHitRate(week))} מהמטמון</span>
      </div>
      <p className="muted small">
        עלות משוערת לפי מחירון Claude. „מהמטמון” הוא החלק מהקלט שנקרא מהמטמון (עולה 10% מהמחיר הרגיל). אחרי הפסקה של יותר מ-5 דקות המטמון מתרוקן, ולכן השיעור נמוך יותר בהודעה הראשונה של כל ארוחה.
      </p>
    </div>
  );
}
