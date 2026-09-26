import { MEAL_LABELS, nowTime, sumItems, today } from './nutrition';
import { addChatMessage, addFood, markFavoriteUsed } from './store';
import type { FavoriteMeal, FoodEntry, FoodItem, MealType } from './types';

/**
 * Logs food from a one-tap UI action (suggestion card, favorite) and leaves an
 * event note in the chat, so the coach sees it in the conversation history.
 */
export function quickLog(items: FoodItem[], meal: MealType, label: string, date = today()): FoodEntry {
  const entry = addFood({ date, time: date === today() ? nowTime() : '12:00', meal, items });
  const kcal = Math.round(sumItems(items).calories);
  addChatMessage({
    role: 'user',
    kind: 'event',
    text: `[נרשם בלחיצה: ${MEAL_LABELS[meal]} – ${label} · ${kcal} קק״ל${date !== today() ? ` · ${date}` : ''}]`,
  });
  return entry;
}

export function logFavorite(fav: FavoriteMeal, meal: MealType, items: FoodItem[] = fav.items, date = today()): FoodEntry {
  const entry = quickLog(items, meal, `⭐ ${fav.name}`, date);
  markFavoriteUsed(fav.id, date);
  return entry;
}
