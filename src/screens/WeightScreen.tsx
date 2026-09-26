import { useState } from 'react';
import WeightChart from '../components/WeightChart';
import { daysBetween, formatDate, r1, today } from '../lib/nutrition';
import { addWeighIn, deleteWeighIn, useData } from '../lib/store';
import type { WeighIn } from '../lib/types';

const MEASURES: { key: keyof WeighIn; label: string }[] = [
  { key: 'waistCm', label: 'מותניים (ס״מ)' },
  { key: 'hipsCm', label: 'ירכיים/אגן (ס״מ)' },
  { key: 'chestCm', label: 'חזה (ס״מ)' },
  { key: 'armCm', label: 'זרוע (ס״מ)' },
  { key: 'thighCm', label: 'ירך (ס״מ)' },
  { key: 'bodyFatPct', label: 'אחוז שומן' },
];

export default function WeightScreen() {
  const data = useData();
  const p = data.profile;
  const list = data.weighIns;
  const last = list[list.length - 1];
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(today());
  const [showMeasures, setShowMeasures] = useState(false);
  const [measures, setMeasures] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  const start = list[0]?.weightKg ?? p?.weightKg;
  const current = last?.weightKg ?? p?.weightKg;
  const target = p?.targetWeightKg;
  const daysSince = last ? daysBetween(last.date, today()) : null;
  const due = daysSince === null || daysSince >= 7;

  let progressPct = 0;
  if (start && current && target && start !== target) {
    progressPct = Math.max(0, Math.min(100, ((start - current) / (start - target)) * 100));
  }
  let weeklyChange: number | null = null;
  if (list.length >= 2) {
    const first = list[0];
    const weeks = daysBetween(first.date, last.date) / 7;
    if (weeks >= 1) weeklyChange = r1((last.weightKg - first.weightKg) / weeks);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const w = Number(weight);
    if (!w) return;
    const extra: Partial<WeighIn> = {};
    for (const { key } of MEASURES) {
      const v = Number(measures[key]);
      if (v) (extra as Record<string, number>)[key] = v;
    }
    addWeighIn({ date, weightKg: w, ...extra, note: note.trim() || undefined });
    setWeight('');
    setMeasures({});
    setNote('');
    setShowMeasures(false);
  }

  return (
    <div className="page">
      <h1 className="page-title">משקל ומדידות</h1>

      {due && (
        <div className="banner">
          {daysSince === null ? 'עוד לא נרשמה שקילה. ' : `עברו ${daysSince} ימים מהשקילה האחרונה. `}
          מומלץ להישקל פעם בשבוע, באותו יום, בבוקר אחרי שירותים ולפני אוכל.
        </div>
      )}

      {p && current && target ? (
        <section className="card">
          <div className="stat-row">
            <div><div className="stat">{start}</div><div className="muted small">התחלה</div></div>
            <div><div className="stat accent">{current}</div><div className="muted small">עכשיו</div></div>
            <div><div className="stat">{target}</div><div className="muted small">יעד</div></div>
          </div>
          <div className="bar big"><div className="bar-fill protein" style={{ width: `${progressPct}%` }} /></div>
          <p className="summary-line">
            {start && <>שינוי: <strong>{r1(current - start) > 0 ? '+' : ''}{r1(current - start)} ק״ג</strong> · </>}
            נשארו <strong>{r1(Math.abs(current - target))} ק״ג</strong> · יעד עד {formatDate(p.targetDate)}
            {weeklyChange !== null && <> · קצב ממוצע {weeklyChange > 0 ? '+' : ''}{weeklyChange} ק״ג/שבוע</>}
          </p>
        </section>
      ) : null}

      {list.length >= 2 && (
        <section className="card">
          <WeightChart weighIns={list} target={target} />
        </section>
      )}

      <form className="card form" onSubmit={save}>
        <h3 className="card-title">שקילה שבועית</h3>
        <div className="grid2">
          <label>משקל (ק״ג)<input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={current ? String(current) : ''} required /></label>
          <label>תאריך<input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        {showMeasures ? (
          <div className="grid2">
            {MEASURES.map(({ key, label }) => (
              <label key={key}>{label}<input inputMode="decimal" value={measures[key] ?? ''} onChange={(e) => setMeasures({ ...measures, [key]: e.target.value })} /></label>
            ))}
          </div>
        ) : (
          <button type="button" className="link" onClick={() => setShowMeasures(true)}>+ הוספת היקפים / אחוז שומן</button>
        )}
        <label>הערה<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="לא חובה" /></label>
        <button type="submit" className="btn primary">שמירה</button>
      </form>

      {list.length > 0 && (
        <section className="card">
          <h3 className="card-title">היסטוריה</h3>
          <table className="table">
            <thead><tr><th>תאריך</th><th>משקל</th><th>שינוי</th><th>מותניים</th><th /></tr></thead>
            <tbody>
              {[...list].reverse().map((w, i, arr) => {
                const prev = arr[i + 1];
                const diff = prev ? r1(w.weightKg - prev.weightKg) : null;
                return (
                  <tr key={w.id}>
                    <td>{w.date.split('-').reverse().join('/')}</td>
                    <td className="num">{w.weightKg}</td>
                    <td className={diff !== null ? (diff <= 0 ? 'good' : 'bad') : ''}>{diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff}`}</td>
                    <td>{w.waistCm ?? '—'}</td>
                    <td><button className="link danger" onClick={() => confirm('למחוק את השקילה?') && deleteWeighIn(w.id)} aria-label="מחיקה">×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
