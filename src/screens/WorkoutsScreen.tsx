import { useState } from 'react';
import { addDays, formatDate, today } from '../lib/nutrition';
import { addWorkout, deleteWorkout, useData } from '../lib/store';
import type { Exercise, Workout } from '../lib/types';

const TYPES = ['קרוספיט', 'כוח / חדר כושר', 'ריצה', 'הליכה מהירה', 'אופניים', 'שחייה', 'יוגה / פילאטיס', 'ריקוד', 'HIIT'];
const INTENSITY: Record<NonNullable<Workout['intensity']>, string> = { low: 'קלה', medium: 'בינונית', high: 'גבוהה' };

interface ExerciseRow { name: string; sets: string; reps: string; weightKg: string }
const emptyRow: ExerciseRow = { name: '', sets: '', reps: '', weightKg: '' };

/** Sunday of the week containing `date` (Israeli week). */
function weekStart(date: string): string {
  const d = new Date(date + 'T12:00:00');
  return addDays(date, -d.getDay());
}

export default function WorkoutsScreen() {
  const data = useData();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: today(), type: 'קרוספיט', durationMin: '60', intensity: 'high' as Workout['intensity'], calories: '', notes: '' });
  const [rows, setRows] = useState<ExerciseRow[]>([]);

  const thisWeek = weekStart(today());
  const doneThisWeek = data.workouts.filter((w) => w.date >= thisWeek).length;
  const goal = data.profile?.trainingDaysPerWeek ?? 0;

  function save(e: React.FormEvent) {
    e.preventDefault();
    const exercises: Exercise[] = rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        sets: r.sets ? Number(r.sets) : undefined,
        reps: r.reps || undefined,
        weightKg: r.weightKg ? Number(r.weightKg) : undefined,
      }));
    addWorkout({
      date: form.date,
      type: form.type.trim() || 'אימון',
      durationMin: Number(form.durationMin) || 0,
      intensity: form.intensity,
      caloriesBurned: form.calories ? Number(form.calories) : undefined,
      exercises: exercises.length ? exercises : undefined,
      notes: form.notes.trim() || undefined,
    });
    setOpen(false);
    setRows([]);
    setForm({ ...form, calories: '', notes: '' });
  }

  // Group workouts by week, newest first.
  const weeks = new Map<string, Workout[]>();
  for (const w of [...data.workouts].sort((a, b) => b.date.localeCompare(a.date))) {
    const k = weekStart(w.date);
    weeks.set(k, [...(weeks.get(k) ?? []), w]);
  }

  return (
    <div className="page">
      <h1 className="page-title">אימונים</h1>

      <section className="card stat-row">
        <div>
          <div className="stat">{doneThisWeek}{goal ? <span className="muted"> / {goal}</span> : null}</div>
          <div className="muted small">אימונים השבוע</div>
        </div>
        <div>
          <div className="stat">{data.workouts.length}</div>
          <div className="muted small">סה״כ אימונים</div>
        </div>
      </section>

      {open ? (
        <form className="card form" onSubmit={save}>
          <h3 className="card-title">אימון חדש</h3>
          <label>תאריך<input type="date" value={form.date} max={today()} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label>סוג אימון
            <input list="workout-types" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
            <datalist id="workout-types">{TYPES.map((t) => <option key={t} value={t} />)}</datalist>
          </label>
          <div className="grid3">
            <label>משך (דק׳)<input inputMode="numeric" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} /></label>
            <label>עצימות
              <select value={form.intensity} onChange={(e) => setForm({ ...form, intensity: e.target.value as Workout['intensity'] })}>
                {Object.entries(INTENSITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>קלוריות<input inputMode="numeric" value={form.calories} placeholder="לא חובה" onChange={(e) => setForm({ ...form, calories: e.target.value })} /></label>
          </div>

          <div className="exercises">
            <div className="muted small">תרגילים (לא חובה)</div>
            {rows.map((r, i) => (
              <div key={i} className="exercise-row">
                <input placeholder="תרגיל" value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input placeholder="סטים" inputMode="numeric" value={r.sets} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, sets: e.target.value } : x)))} />
                <input placeholder="חזרות" value={r.reps} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, reps: e.target.value } : x)))} />
                <input placeholder="ק״ג" inputMode="decimal" value={r.weightKg} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, weightKg: e.target.value } : x)))} />
                <button type="button" className="link danger" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="הסרת תרגיל">×</button>
              </div>
            ))}
            <button type="button" className="link" onClick={() => setRows([...rows, emptyRow])}>+ תרגיל</button>
          </div>

          <label>הערות<textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="WOD, תחושה, שיאים…" /></label>
          <div className="row">
            <button type="submit" className="btn primary">שמירה</button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>ביטול</button>
          </div>
        </form>
      ) : (
        <button className="btn wide primary" onClick={() => setOpen(true)}>+ רישום אימון</button>
      )}

      {data.workouts.length === 0 && <p className="muted center">עוד אין אימונים. אפשר גם פשוט לכתוב בצ׳אט: "עשיתי קרוספיט 60 דקות".</p>}

      {[...weeks.entries()].map(([week, list]) => (
        <section key={week} className="card">
          <h3 className="card-title">שבוע מ-{week.split('-').reverse().slice(0, 2).join('/')} <span className="muted">· {list.length} אימונים</span></h3>
          {list.map((w) => (
            <div key={w.id} className="entry">
              <div className="entry-head">
                <strong>{w.type}</strong>
                <span className="muted small">
                  {formatDate(w.date)} · {w.durationMin} דק׳{w.intensity ? ` · ${INTENSITY[w.intensity]}` : ''}{w.caloriesBurned ? ` · ~${w.caloriesBurned} קק״ל` : ''}
                </span>
                <button className="link danger" onClick={() => confirm('למחוק את האימון?') && deleteWorkout(w.id)}>מחיקה</button>
              </div>
              {w.exercises?.length ? (
                <ul className="items">
                  {w.exercises.map((x, i) => (
                    <li key={i}>
                      <span>{x.name}</span>
                      <span className="muted">{[x.sets && `${x.sets}×`, x.reps, x.weightKg && `${x.weightKg} ק״ג`].filter(Boolean).join(' ')}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {w.notes && <p className="muted small">{w.notes}</p>}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
