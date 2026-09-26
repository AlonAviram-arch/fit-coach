import { useState } from 'react';
import { MEAL_LABELS, MEAL_ORDER, r1, scaleItems, sumItems } from '../lib/nutrition';
import { quickLog } from '../lib/quicklog';
import { markSuggestionLogged, saveFavorite, useData } from '../lib/store';
import type { MealSuggestion, MealType } from '../lib/types';

const PORTIONS = [0.5, 0.75, 1, 1.25, 1.5];
const PORTION_LABELS: Record<number, string> = { 0.5: '½', 0.75: '¾', 1: '1', 1.25: '1¼', 1.5: '1½' };

/** A meal Claude suggested: adjust the portion or drop items, then log it with one tap. */
export default function SuggestionCard({ messageId, suggestion }: { messageId: string; suggestion: MealSuggestion }) {
  const data = useData();
  const [portion, setPortion] = useState(1);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [meal, setMeal] = useState<MealType>(suggestion.meal);
  const [editing, setEditing] = useState(false);

  const chosen = scaleItems(suggestion.items.filter((_, i) => !excluded.has(i)), portion);
  const t = sumItems(chosen);
  const logged = !!suggestion.loggedEntryId && data.food.some((f) => f.id === suggestion.loggedEntryId);
  const isFavorite = data.favorites.some((f) => f.name === suggestion.title);

  function toggle(i: number) {
    const next = new Set(excluded);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setExcluded(next);
  }

  function logIt() {
    if (!chosen.length) return;
    const label = portion === 1 ? suggestion.title : `${suggestion.title} (×${PORTION_LABELS[portion]})`;
    const entry = quickLog(chosen, meal, label);
    markSuggestionLogged(messageId, suggestion.id, entry.id);
  }

  return (
    <div className={logged ? 'suggestion logged' : 'suggestion'}>
      <div className="suggestion-head">
        <strong>{suggestion.title}</strong>
        <span className="muted small">{MEAL_LABELS[meal]}</span>
      </div>
      {suggestion.note && <p className="muted small suggestion-note">{suggestion.note}</p>}
      <ul className="items">
        {(editing ? scaleItems(suggestion.items, portion) : chosen).map((item, i) => (
          <li key={i} className={editing && excluded.has(i) ? 'excluded' : ''}>
            <span>
              {editing && <input type="checkbox" checked={!excluded.has(i)} onChange={() => toggle(i)} aria-label={`כולל ${item.name}`} />}
              {item.name} <span className="muted">{item.amount}</span>
            </span>
            <span className="num">{Math.round(item.calories)}</span>
          </li>
        ))}
      </ul>
      <div className="suggestion-totals">
        <strong>{Math.round(t.calories)} קק״ל</strong>
        <span className="muted small">ח {r1(t.protein)} · פ {r1(t.carbs)} · ש {r1(t.fat)}</span>
      </div>

      {editing && !logged && (
        <div className="suggestion-edit">
          <div className="segmented" role="group" aria-label="גודל מנה">
            {PORTIONS.map((p) => (
              <button key={p} type="button" className={p === portion ? 'active' : ''} onClick={() => setPortion(p)}>
                {PORTION_LABELS[p]}
              </button>
            ))}
          </div>
          <select value={meal} onChange={(e) => setMeal(e.target.value as MealType)} aria-label="ארוחה">
            {MEAL_ORDER.map((m) => <option key={m} value={m}>{MEAL_LABELS[m]}</option>)}
          </select>
        </div>
      )}

      {logged ? (
        <div className="suggestion-done">✓ נרשם ביומן</div>
      ) : (
        <div className="suggestion-actions">
          <button className="btn primary" onClick={logIt} disabled={!chosen.length}>✓ אכלתי את זה</button>
          <button className="btn" onClick={() => setEditing(!editing)}>{editing ? 'סיום' : 'התאמה'}</button>
          <button
            className="btn icon"
            onClick={() => saveFavorite(suggestion.title, suggestion.items, suggestion.meal)}
            disabled={isFavorite}
            aria-label="שמירה במועדפים"
            title="שמירה במועדפים"
          >
            {isFavorite ? '⭐' : '☆'}
          </button>
        </div>
      )}
    </div>
  );
}
