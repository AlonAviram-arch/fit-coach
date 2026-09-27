import { useSyncExternalStore } from 'react';
import type {
  AppData, ChatMessage, DailyMetric, FavoriteMeal, FoodEntry, FoodItem, MealType, Profile, Settings, WeighIn, Workout,
} from './types';

const STORAGE_KEY = 'fit-coach-data-v1';
export const DEFAULT_MODEL = 'claude-opus-5';

function emptyData(): AppData {
  return {
    version: 1,
    profile: null,
    food: [],
    workouts: [],
    weighIns: [],
    favorites: [],
    metrics: [],
    chat: [],
    settings: { apiKey: '', model: DEFAULT_MODEL },
  };
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    return { ...emptyData(), ...JSON.parse(raw) } as AppData;
  } catch {
    return emptyData();
  }
}

let data: AppData = load();
const listeners = new Set<() => void>();

function commit(next: AppData) {
  data = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.error('Failed to persist data', err);
  }
  listeners.forEach((l) => l());
}

/** Replaces all data (used when loading from the cloud). */
export function hydrate(next: AppData) {
  commit(next);
}

export function getData(): AppData {
  return data;
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useData(): AppData {
  return useSyncExternalStore(subscribe, getData);
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const byDate = <T extends { date: string }>(a: T, b: T) => a.date.localeCompare(b.date);

// ---- Profile & settings ----

export function saveProfile(profile: Profile) {
  commit({ ...data, profile });
}

export function saveSettings(settings: Partial<Settings>) {
  commit({ ...data, settings: { ...data.settings, ...settings } });
}

// ---- Food ----

export function addFood(entry: Omit<FoodEntry, 'id'>): FoodEntry {
  const full = { ...entry, id: uid() };
  commit({ ...data, food: [...data.food, full] });
  return full;
}

export function updateFood(id: string, patch: Partial<Omit<FoodEntry, 'id'>>): FoodEntry | null {
  const existing = data.food.find((f) => f.id === id);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  commit({ ...data, food: data.food.map((f) => (f.id === id ? updated : f)) });
  return updated;
}

export function deleteFood(id: string): boolean {
  if (!data.food.some((f) => f.id === id)) return false;
  commit({ ...data, food: data.food.filter((f) => f.id !== id) });
  return true;
}

// ---- Workouts ----

export function addWorkout(w: Omit<Workout, 'id'>): Workout {
  const full = { ...w, id: uid() };
  commit({ ...data, workouts: [...data.workouts, full].sort(byDate) });
  return full;
}

export function updateWorkout(id: string, patch: Partial<Omit<Workout, 'id'>>): Workout | null {
  const existing = data.workouts.find((w) => w.id === id);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  commit({ ...data, workouts: data.workouts.map((w) => (w.id === id ? updated : w)).sort(byDate) });
  return updated;
}

export function deleteWorkout(id: string): boolean {
  if (!data.workouts.some((w) => w.id === id)) return false;
  commit({ ...data, workouts: data.workouts.filter((w) => w.id !== id) });
  return true;
}

// ---- Weigh-ins ----

export function addWeighIn(w: Omit<WeighIn, 'id'>): WeighIn {
  const full = { ...w, id: uid() };
  commit({ ...data, weighIns: [...data.weighIns, full].sort(byDate) });
  return full;
}

export function deleteWeighIn(id: string): boolean {
  if (!data.weighIns.some((w) => w.id === id)) return false;
  commit({ ...data, weighIns: data.weighIns.filter((w) => w.id !== id) });
  return true;
}

// ---- Favorites ----

export function findFavorite(idOrName: string): FavoriteMeal | undefined {
  const key = idOrName.trim();
  return data.favorites.find((f) => f.id === key) ?? data.favorites.find((f) => f.name.trim() === key);
}

/** Adds a favorite, or replaces the items of an existing one with the same name. */
export function saveFavorite(name: string, items: FoodItem[], meal?: MealType): FavoriteMeal {
  const existing = data.favorites.find((f) => f.name.trim() === name.trim());
  if (existing) {
    const updated = { ...existing, items, meal: meal ?? existing.meal };
    commit({ ...data, favorites: data.favorites.map((f) => (f.id === existing.id ? updated : f)) });
    return updated;
  }
  const fav: FavoriteMeal = { id: uid(), name: name.trim(), meal, items, uses: 0, createdAt: new Date().toISOString() };
  commit({ ...data, favorites: [...data.favorites, fav] });
  return fav;
}

export function markFavoriteUsed(id: string, date: string) {
  commit({ ...data, favorites: data.favorites.map((f) => (f.id === id ? { ...f, uses: f.uses + 1, lastUsed: date } : f)) });
}

export function deleteFavorite(id: string): boolean {
  if (!data.favorites.some((f) => f.id === id)) return false;
  commit({ ...data, favorites: data.favorites.filter((f) => f.id !== id) });
  return true;
}

// ---- Daily metrics (water / steps / sleep) ----

export function getMetric(date: string): DailyMetric {
  return data.metrics.find((m) => m.date === date) ?? { date };
}

export function setMetric(date: string, patch: Partial<Omit<DailyMetric, 'date'>>): DailyMetric {
  const next = { ...getMetric(date), ...patch };
  const others = data.metrics.filter((m) => m.date !== date);
  commit({ ...data, metrics: [...others, next].sort(byDate) });
  return next;
}

// ---- Chat ----

export function addChatMessage(msg: Omit<ChatMessage, 'id' | 'ts'>): ChatMessage {
  const full = { ...msg, id: uid(), ts: new Date().toISOString() };
  commit({ ...data, chat: [...data.chat, full] });
  return full;
}

export function updateChatMessage(id: string, patch: Partial<ChatMessage>) {
  commit({ ...data, chat: data.chat.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
}

export function markSuggestionLogged(messageId: string, suggestionId: string, entryId: string) {
  commit({
    ...data,
    chat: data.chat.map((m) =>
      m.id === messageId
        ? { ...m, suggestions: m.suggestions?.map((s) => (s.id === suggestionId ? { ...s, loggedEntryId: entryId } : s)) }
        : m,
    ),
  });
}

export function clearChat() {
  commit({ ...data, chat: [] });
}

// ---- Backup ----

export function exportJson(): string {
  // API keys never leave the device in a backup file.
  return JSON.stringify({ ...data, settings: { ...data.settings, apiKey: '', geminiKey: '' } }, null, 2);
}

export function importJson(json: string) {
  const parsed = JSON.parse(json) as Partial<AppData>;
  if (parsed.version !== 1) throw new Error('קובץ גיבוי לא נתמך');
  commit({
    ...emptyData(),
    ...parsed,
    settings: {
      ...data.settings,
      model: parsed.settings?.model || data.settings.model,
      geminiModel: parsed.settings?.geminiModel || data.settings.geminiModel,
    },
  });
}

export function resetAll() {
  commit({ ...emptyData(), settings: data.settings });
}

/** Ask the browser not to evict our storage (important on mobile). */
export function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {});
}
