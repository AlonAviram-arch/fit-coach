import { useState } from 'react';
import { SLEEP_GOAL_HOURS, stepsGoal, waterGoalMl } from '../lib/nutrition';
import { setMetric, useData } from '../lib/store';
import type { DailyMetric } from '../lib/types';

const GLASS_ML = 250;

/** Water (tap per glass), steps and last night's sleep for one day. */
export default function LifestyleCard({ date }: { date: string }) {
  const data = useData();
  const metric = data.metrics.find((m) => m.date === date) ?? { date };
  const water = metric.waterMl ?? 0;
  const waterGoal = waterGoalMl(data);
  const goalSteps = stepsGoal(data);
  const glasses = Math.round(water / GLASS_ML);
  const goalGlasses = Math.round(waterGoal / GLASS_ML);

  return (
    <section className="card lifestyle">
      <div className="life-row">
        <div className="life-label">
          <span>💧 מים</span>
          <span className="num muted small">{(water / 1000).toFixed(2).replace(/\.?0+$/, '')} / {waterGoal / 1000} ל׳</span>
        </div>
        <div className="glasses" aria-label={`${glasses} מתוך ${goalGlasses} כוסות`}>
          {Array.from({ length: Math.max(goalGlasses, glasses) }, (_, i) => (
            <span key={i} className={i < glasses ? 'glass full' : 'glass'} />
          ))}
        </div>
        <div className="row">
          <button className="icon-btn small" onClick={() => setMetric(date, { waterMl: Math.max(0, water - GLASS_ML) })} disabled={!water} aria-label="הורדת כוס">−</button>
          <button className="btn primary" onClick={() => setMetric(date, { waterMl: water + GLASS_ML })}>+ כוס</button>
        </div>
      </div>

      {/* Keyed on the stored values so the inputs reset on day change or when the coach logs from chat. */}
      <MetricInputs key={`${date}|${metric.steps}|${metric.sleepHours}`} metric={metric} goalSteps={goalSteps} />
      {metric.steps !== undefined && (
        <div className="bar"><div className="bar-fill carbs" style={{ width: `${Math.min(100, (metric.steps / goalSteps) * 100)}%` }} /></div>
      )}
      {metric.sleepHours !== undefined && metric.sleepHours < 6 && (
        <p className="warn small">שינה קצרה מגבירה רעב ותשוקה למתוקים. היום כדאי להקפיד על חלבון בבוקר ועל נשנושים מתוכננים.</p>
      )}
    </section>
  );
}

function MetricInputs({ metric, goalSteps }: { metric: DailyMetric; goalSteps: number }) {
  const [steps, setSteps] = useState(metric.steps?.toString() ?? '');
  const [sleep, setSleep] = useState(metric.sleepHours?.toString() ?? '');
  const saveSteps = () => setMetric(metric.date, { steps: steps.trim() ? Math.round(Number(steps)) || 0 : undefined });
  const saveSleep = () => setMetric(metric.date, { sleepHours: sleep.trim() ? Number(sleep) || 0 : undefined });

  return (
    <div className="grid2">
      <label>👣 צעדים (יעד {goalSteps.toLocaleString('he-IL')})
        <input inputMode="numeric" value={steps} onChange={(e) => setSteps(e.target.value)} onBlur={saveSteps} placeholder="0" />
      </label>
      <label>😴 שינה בלילה (שעות)
        <input inputMode="decimal" value={sleep} onChange={(e) => setSleep(e.target.value)} onBlur={saveSleep} placeholder={String(SLEEP_GOAL_HOURS)} />
      </label>
    </div>
  );
}
