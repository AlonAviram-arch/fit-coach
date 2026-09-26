import { useState } from 'react';
import { MEAL_LABELS, MEAL_ORDER, mealForNow, r1, sumItems, today } from '../lib/nutrition';
import { logFavorite } from '../lib/quicklog';
import { deleteFavorite, useData } from '../lib/store';
import type { MealType } from '../lib/types';

/** Bottom sheet listing saved meals; tap one to log it. */
export default function FavoritesSheet({ onClose, date = today() }: { onClose: () => void; date?: string }) {
  const data = useData();
  const [meal, setMeal] = useState<MealType | 'auto'>('auto');
  const [managing, setManaging] = useState(false);
  const favorites = [...data.favorites].sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="מועדפים" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>⭐ מועדפים</h3>
          <div className="row">
            {favorites.length > 0 && (
              <button className="link" onClick={() => setManaging(!managing)}>{managing ? 'סיום' : 'עריכה'}</button>
            )}
            <button className="link" onClick={onClose} aria-label="סגירה">✕</button>
          </div>
        </div>

        {favorites.length === 0 ? (
          <p className="muted">
            עוד אין מועדפים. אפשר לשמור ארוחה ביומן (☆), בכרטיס הצעה, או לבקש בצ׳אט: „תשמרי את ארוחת הבוקר כמועדף”.
          </p>
        ) : (
          <>
            <label className="sheet-meal">רישום בתור
              <select value={meal} onChange={(e) => setMeal(e.target.value as MealType | 'auto')}>
                <option value="auto">אוטומטי (לפי השעה / הארוחה השמורה)</option>
                {MEAL_ORDER.map((m) => <option key={m} value={m}>{MEAL_LABELS[m]}</option>)}
              </select>
            </label>
            <ul className="fav-list">
              {favorites.map((f) => {
                const t = sumItems(f.items);
                return (
                  <li key={f.id}>
                    <button
                      className="fav-item"
                      disabled={managing}
                      onClick={() => {
                        logFavorite(f, meal === 'auto' ? (f.meal ?? mealForNow()) : meal, f.items, date);
                        onClose();
                      }}
                    >
                      <span>
                        <strong>{f.name}</strong>
                        <span className="muted small block">{f.items.map((i) => i.name).join(' · ')}</span>
                      </span>
                      <span className="num">
                        {Math.round(t.calories)}
                        <span className="muted small block">ח {r1(t.protein)}</span>
                      </span>
                    </button>
                    {managing && (
                      <button className="link danger" onClick={() => confirm(`למחוק את „${f.name}”?`) && deleteFavorite(f.id)}>
                        מחיקה
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
