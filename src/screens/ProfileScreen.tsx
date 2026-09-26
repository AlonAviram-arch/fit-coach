import { useState } from 'react';
import { MODELS } from '../lib/models';
import { ACTIVITY_LABELS, addDays, computeTargets, currentWeight, today } from '../lib/nutrition';
import {
  addWeighIn, exportJson, getData, importJson, resetAll, saveProfile, saveSettings, useData,
} from '../lib/store';
import type { ActivityLevel, GoalType, Profile, Sex, Targets } from '../lib/types';

type Form = Record<string, string>;

function toForm(p: Profile | null, weight: number | null): Form {
  return {
    name: p?.name ?? '',
    sex: p?.sex ?? 'female',
    age: p?.age ? String(p.age) : '',
    heightCm: p?.heightCm ? String(p.heightCm) : '',
    weightKg: weight ? String(weight) : '',
    bodyFatPct: p?.bodyFatPct ? String(p.bodyFatPct) : '',
    waistCm: p?.waistCm ? String(p.waistCm) : '',
    hipsCm: p?.hipsCm ? String(p.hipsCm) : '',
    chestCm: p?.chestCm ? String(p.chestCm) : '',
    armCm: p?.armCm ? String(p.armCm) : '',
    thighCm: p?.thighCm ? String(p.thighCm) : '',
    activityLevel: p?.activityLevel ?? 'moderate',
    trainingDaysPerWeek: p ? String(p.trainingDaysPerWeek) : '3',
    trainingTypes: p?.trainingTypes ?? '',
    goalType: p?.goalType ?? 'lose',
    targetWeightKg: p?.targetWeightKg ? String(p.targetWeightKg) : '',
    targetDate: p?.targetDate ?? addDays(today(), 182),
    fitnessGoals: p?.fitnessGoals ?? '',
    foodPreferences: p?.foodPreferences ?? '',
    restrictions: p?.restrictions ?? '',
  };
}

const optNum = (v: string) => (v.trim() ? Number(v) : undefined);

export default function ProfileScreen({ onDone }: { onDone: () => void }) {
  const data = useData();
  const [form, setForm] = useState<Form>(() => toForm(data.profile, currentWeight(data)));
  const [custom, setCustom] = useState<Targets | null>(data.profile?.customTargets ?? null);
  const [apiKey, setApiKey] = useState(data.settings.apiKey);
  const [saved, setSaved] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  function buildProfile(): Profile | null {
    const age = Number(form.age), heightCm = Number(form.heightCm), weightKg = Number(form.weightKg);
    if (!age || !heightCm || !weightKg) return null;
    const now = new Date().toISOString();
    return {
      name: form.name.trim(),
      sex: form.sex as Sex,
      age,
      heightCm,
      weightKg,
      bodyFatPct: optNum(form.bodyFatPct),
      waistCm: optNum(form.waistCm),
      hipsCm: optNum(form.hipsCm),
      chestCm: optNum(form.chestCm),
      armCm: optNum(form.armCm),
      thighCm: optNum(form.thighCm),
      activityLevel: form.activityLevel as ActivityLevel,
      trainingDaysPerWeek: Number(form.trainingDaysPerWeek) || 0,
      trainingTypes: form.trainingTypes.trim(),
      goalType: form.goalType as GoalType,
      targetWeightKg: Number(form.targetWeightKg) || weightKg,
      targetDate: form.targetDate,
      fitnessGoals: form.fitnessGoals.trim(),
      foodPreferences: form.foodPreferences.trim(),
      restrictions: form.restrictions.trim(),
      customTargets: custom ?? undefined,
      createdAt: data.profile?.createdAt ?? now,
      updatedAt: now,
    };
  }

  const preview = buildProfile();
  const computed = preview ? computeTargets(preview, preview.weightKg) : null;

  function save(e: React.FormEvent) {
    e.preventDefault();
    const p = buildProfile();
    if (!p) return;
    const isNew = !data.profile;
    saveProfile(p);
    // The profile's weight + measurements become the first weigh-in, so progress has a starting point.
    if (isNew && getData().weighIns.length === 0) {
      addWeighIn({
        date: today(), weightKg: p.weightKg, bodyFatPct: p.bodyFatPct, waistCm: p.waistCm,
        hipsCm: p.hipsCm, chestCm: p.chestCm, armCm: p.armCm, thighCm: p.thighCm, note: 'מדידת פתיחה',
      });
    }
    saveSettings({ apiKey: apiKey.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    if (isNew && apiKey.trim()) onDone();
  }

  function download() {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fit-coach-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    try {
      importJson(await file.text());
      setForm(toForm(getData().profile, currentWeight(getData())));
      alert('הגיבוי שוחזר בהצלחה');
    } catch (err) {
      alert('שחזור נכשל: ' + (err instanceof Error ? err.message : err));
    }
  }

  const f = form.sex === 'female';

  return (
    <div className="page">
      <h1 className="page-title">{data.profile ? 'הפרופיל שלי' : 'ברוכים הבאים 👋'}</h1>
      {!data.profile && (
        <p className="muted">כמה פרטים כדי שהמאמנת תוכל לחשב עבורך יעדי קלוריות וחלבון, ולבנות תוכנית שמתאימה לך.</p>
      )}

      <form className="form" onSubmit={save}>
        <section className="card form">
          <h3 className="card-title">פרטים אישיים ומדדי גוף</h3>
          <label>שם<input value={form.name} onChange={set('name')} placeholder="איך לקרוא לך?" /></label>
          <div className="grid2">
            <label>מין (לחישוב ולפנייה)
              <select value={form.sex} onChange={set('sex')}>
                <option value="female">אישה</option>
                <option value="male">גבר</option>
              </select>
            </label>
            <label>גיל<input inputMode="numeric" value={form.age} onChange={set('age')} required /></label>
            <label>גובה (ס״מ)<input inputMode="numeric" value={form.heightCm} onChange={set('heightCm')} placeholder="182" required /></label>
            <label>משקל נוכחי (ק״ג)<input inputMode="decimal" value={form.weightKg} onChange={set('weightKg')} placeholder="81" required /></label>
          </div>
          <details>
            <summary>היקפים ואחוז שומן (לא חובה)</summary>
            <div className="grid2">
              <label>מותניים (ס״מ)<input inputMode="decimal" value={form.waistCm} onChange={set('waistCm')} /></label>
              <label>ירכיים/אגן (ס״מ)<input inputMode="decimal" value={form.hipsCm} onChange={set('hipsCm')} /></label>
              <label>חזה (ס״מ)<input inputMode="decimal" value={form.chestCm} onChange={set('chestCm')} /></label>
              <label>זרוע (ס״מ)<input inputMode="decimal" value={form.armCm} onChange={set('armCm')} /></label>
              <label>ירך (ס״מ)<input inputMode="decimal" value={form.thighCm} onChange={set('thighCm')} /></label>
              <label>אחוז שומן<input inputMode="decimal" value={form.bodyFatPct} onChange={set('bodyFatPct')} /></label>
            </div>
          </details>
        </section>

        <section className="card form">
          <h3 className="card-title">פעילות ואימונים</h3>
          <label>רמת פעילות יומיומית
            <select value={form.activityLevel} onChange={set('activityLevel')}>
              {Object.entries(ACTIVITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <div className="grid2">
            <label>אימונים בשבוע<input inputMode="numeric" value={form.trainingDaysPerWeek} onChange={set('trainingDaysPerWeek')} /></label>
            <label>סוגי אימון<input value={form.trainingTypes} onChange={set('trainingTypes')} placeholder="קרוספיט, ריצה…" /></label>
          </div>
        </section>

        <section className="card form">
          <h3 className="card-title">יעדים</h3>
          <div className="grid2">
            <label>מטרה
              <select value={form.goalType} onChange={set('goalType')}>
                <option value="lose">ירידה במשקל / חיטוב</option>
                <option value="maintain">שמירה על משקל</option>
                <option value="gain">עלייה במסה</option>
              </select>
            </label>
            <label>משקל יעד (ק״ג)<input inputMode="decimal" value={form.targetWeightKg} onChange={set('targetWeightKg')} placeholder="74" /></label>
          </div>
          <label>תאריך יעד<input type="date" value={form.targetDate} min={today()} onChange={set('targetDate')} /></label>
          <label>יעדי כושר<textarea rows={2} value={form.fitnessGoals} onChange={set('fitnessGoals')} placeholder="למשל: 3 אימוני קרוספיט בשבוע, מתח ראשון, לרוץ 5 ק״מ" /></label>
        </section>

        <section className="card form">
          <h3 className="card-title">העדפות תזונה</h3>
          <label>{f ? 'מה את אוהבת לאכול' : 'מה אתה אוהב לאכול'}<textarea rows={3} value={form.foodPreferences} onChange={set('foodPreferences')} placeholder="יוגורט עם אבקת חלבון, פייבר וואן וצ׳יה; חזה עוף בנינג׳ה; ירקות ופירות…" /></label>
          <label>הגבלות / רגישויות<input value={form.restrictions} onChange={set('restrictions')} placeholder="ללא גלוטן, בלי בצל חי, צמחוני…" /></label>
        </section>

        {computed && (
          <section className="card">
            <h3 className="card-title">היעדים היומיים</h3>
            <p className="muted small">
              BMR {computed.bmr} · TDEE {computed.tdee} ·{' '}
              {computed.dailyDelta < 0 ? `גירעון ${-computed.dailyDelta}` : computed.dailyDelta > 0 ? `עודף ${computed.dailyDelta}` : 'איזון'} קק״ל ביום
              {computed.weeklyRateKg !== 0 && ` · ${computed.weeklyRateKg > 0 ? '+' : ''}${computed.weeklyRateKg} ק״ג/שבוע`}
            </p>
            {computed.clamped && (
              <p className="warn small">הקצב שביקשת מהיר מדי, אז הגבלתי את הגירעון לטווח בטוח. כדאי לשקול תאריך יעד מאוחר יותר.</p>
            )}
            <div className="targets">
              {(['calories', 'protein', 'carbs', 'fat'] as const).map((k) => (
                <label key={k} className="target">
                  <span>{{ calories: 'קלוריות', protein: 'חלבון (ג׳)', carbs: 'פחמימות (ג׳)', fat: 'שומן (ג׳)' }[k]}</span>
                  <input
                    inputMode="numeric"
                    value={custom ? custom[k] : computed[k]}
                    disabled={!custom}
                    onChange={(e) => custom && setCustom({ ...custom, [k]: Number(e.target.value) || 0 })}
                  />
                </label>
              ))}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={!!custom}
                onChange={(e) => setCustom(e.target.checked ? { calories: computed.calories, protein: computed.protein, carbs: computed.carbs, fat: computed.fat } : null)}
              />
              יעדים מותאמים אישית (למשל מדיאטנית)
            </label>
          </section>
        )}

        <section className="card form">
          <h3 className="card-title">חיבור ל-Claude</h3>
          <label>מפתח API
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" dir="ltr" />
          </label>
          <p className="muted small">
            יוצרים מפתח ב-<a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
            המפתח נשמר רק במכשיר הזה ונשלח ישירות ל-Anthropic.
          </p>
          <label>מודל
            <select value={data.settings.model} onChange={(e) => saveSettings({ model: e.target.value })}>
              {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.note}</option>)}
            </select>
          </label>
        </section>

        <button type="submit" className="btn primary wide sticky-save" disabled={!preview}>
          {saved ? 'נשמר ✓' : data.profile ? 'שמירה' : 'שמירה והתחלה'}
        </button>
      </form>

      <section className="card form">
        <h3 className="card-title">גיבוי ונתונים</h3>
        <p className="muted small">כל הנתונים נשמרים רק בדפדפן במכשיר הזה. מומלץ לגבות מדי פעם.</p>
        <div className="row">
          <button className="btn" onClick={download}>ייצוא גיבוי</button>
          <label className="btn">ייבוא גיבוי<input type="file" accept="application/json" hidden onChange={(e) => upload(e.target.files?.[0])} /></label>
        </div>
        <button className="link danger" onClick={() => confirm('למחוק את כל הנתונים? אי אפשר לבטל.') && resetAll()}>מחיקת כל הנתונים</button>
      </section>
    </div>
  );
}
