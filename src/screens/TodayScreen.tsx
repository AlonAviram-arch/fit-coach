import { useState } from 'react';
import FavoritesSheet from '../components/FavoritesSheet';
import LifestyleCard from '../components/LifestyleCard';
import MacroBars from '../components/MacroBars';
import {
  activeTargets, addDays, entriesForDate, formatDate, MEAL_LABELS, MEAL_ORDER, nowTime, r1, sumEntries, sumItems, today,
} from '../lib/nutrition';
import { addFood, deleteFood, saveFavorite, useData } from '../lib/store';
import type { FoodItem, MealType } from '../lib/types';
import { ask, confirmThen } from '../lib/dialog';

const emptyItem = { name: '', amount: '', calories: '', protein: '', carbs: '', fat: '' };

export default function TodayScreen() {
  const data = useData();
  const [date, setDate] = useState(today());
  const [adding, setAdding] = useState(false);
  const [meal, setMeal] = useState<MealType>('snack');
  const [item, setItem] = useState(emptyItem);
  const [showFavorites, setShowFavorites] = useState(false);

  const entries = entriesForDate(data, date);
  const totals = sumEntries(entries);
  const targets = activeTargets(data);
  const workouts = data.workouts.filter((w) => w.date === date);
  const remaining = targets ? Math.round(targets.calories - totals.calories) : null;

  function saveManual(e: React.FormEvent) {
    e.preventDefault();
    const food: FoodItem = {
      name: item.name.trim(),
      amount: item.amount.trim(),
      calories: Number(item.calories) || 0,
      protein: Number(item.protein) || 0,
      carbs: Number(item.carbs) || 0,
      fat: Number(item.fat) || 0,
    };
    if (!food.name) return;
    addFood({ date, time: date === today() ? nowTime() : '12:00', meal, items: [food] });
    setItem(emptyItem);
    setAdding(false);
  }

  return (
    <div className="page">
      <div className="date-nav">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="יום קודם">→</button>
        <div className="date-label">
          <strong>{date === today() ? 'היום' : formatDate(date)}</strong>
          {date !== today() && <button className="link" onClick={() => setDate(today())}>חזרה להיום</button>}
        </div>
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} disabled={date >= today()} aria-label="יום הבא">←</button>
      </div>

      <section className="card">
        <MacroBars totals={totals} targets={targets} />
        {remaining !== null && (
          <p className="summary-line">
            {remaining >= 0 ? <>נשארו <strong>{remaining}</strong> קלוריות</> : <>חריגה של <strong>{-remaining}</strong> קלוריות</>}
            {workouts.length > 0 && <> · 🏋️ {workouts.map((w) => w.type).join(', ')}</>}
          </p>
        )}
      </section>

      <LifestyleCard date={date} />

      {entries.length === 0 && <p className="muted center">עוד לא נרשם אוכל ביום הזה. אפשר לספר בצ׳אט או להוסיף ידנית.</p>}

      {MEAL_ORDER.map((m) => {
        const mealEntries = entries.filter((e) => e.meal === m);
        if (!mealEntries.length) return null;
        return (
          <section key={m} className="card">
            <h3 className="card-title">
              {MEAL_LABELS[m]}
              <span className="muted"> · {Math.round(sumEntries(mealEntries).calories)} קק״ל</span>
            </h3>
            {mealEntries.map((e) => {
              const s = sumItems(e.items);
              return (
                <div key={e.id} className="entry">
                  <div className="entry-head">
                    <span className="muted">{e.time}</span>
                    <span className="muted small">
                      ח {r1(s.protein)} · פ {r1(s.carbs)} · ש {r1(s.fat)}
                    </span>
                    <button
                      className="link"
                      onClick={async () => {
                        const name = await ask.prompt('שם למועדף:', e.items.length === 1 ? e.items[0].name : MEAL_LABELS[e.meal]);
                        if (name?.trim()) saveFavorite(name, e.items, e.meal);
                      }}
                      aria-label="שמירה במועדפים"
                      title="שמירה במועדפים"
                    >
                      ☆
                    </button>
                    <button className="link danger" onClick={() => confirmThen('למחוק את הרישום?', () => deleteFood(e.id))}>מחיקה</button>
                  </div>
                  <ul className="items">
                    {e.items.map((i, idx) => (
                      <li key={idx}>
                        <span>{i.name} <span className="muted">{i.amount}</span></span>
                        <span className="num">{Math.round(i.calories)}</span>
                      </li>
                    ))}
                  </ul>
                  {e.note && <p className="muted small">{e.note}</p>}
                </div>
              );
            })}
          </section>
        );
      })}

      {adding ? (
        <form className="card form" onSubmit={saveManual}>
          <h3 className="card-title">הוספה ידנית</h3>
          <label>ארוחה
            <select value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>
              {MEAL_ORDER.map((m) => <option key={m} value={m}>{MEAL_LABELS[m]}</option>)}
            </select>
          </label>
          <label>מה אכלת<input value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} required /></label>
          <label>כמות<input value={item.amount} onChange={(e) => setItem({ ...item, amount: e.target.value })} placeholder="למשל 150 ג׳" /></label>
          <div className="grid4">
            {(['calories', 'protein', 'carbs', 'fat'] as const).map((k) => (
              <label key={k}>{{ calories: 'קלוריות', protein: 'חלבון', carbs: 'פחמ׳', fat: 'שומן' }[k]}
                <input inputMode="decimal" value={item[k]} onChange={(e) => setItem({ ...item, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="row">
            <button type="submit" className="btn primary">שמירה</button>
            <button type="button" className="btn" onClick={() => setAdding(false)}>ביטול</button>
          </div>
        </form>
      ) : (
        <div className="row two">
          <button className="btn" onClick={() => setShowFavorites(true)}>⭐ מהמועדפים</button>
          <button className="btn" onClick={() => setAdding(true)}>+ הוספה ידנית</button>
        </div>
      )}
      {showFavorites && <FavoritesSheet date={date} onClose={() => setShowFavorites(false)} />}
    </div>
  );
}
