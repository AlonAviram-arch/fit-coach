import type { ActivityLevel, AppData, FoodEntry, FoodItem, MealType, Profile, Targets } from './types';

export const KCAL_PER_KG_FAT = 7700;

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'יושבני (כמעט בלי פעילות)',
  light: 'קל (1–2 אימונים בשבוע)',
  moderate: 'בינוני (3–4 אימונים בשבוע)',
  active: 'גבוה (5–6 אימונים בשבוע)',
  very_active: 'גבוה מאוד (אימונים יומיים / עבודה פיזית)',
};

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'ארוחת בוקר',
  lunch: 'ארוחת צהריים',
  dinner: 'ארוחת ערב',
  snack: 'נשנוש',
  drink: 'שתייה',
};

export const MEAL_ORDER: MealType[] = ['breakfast', 'snack', 'lunch', 'dinner', 'drink'];

// ---- Dates (local time, YYYY-MM-DD) ----

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today(): string {
  return toISODate(new Date());
}

export function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T12:00:00').getTime();
  const b = new Date(to + 'T12:00:00').getTime();
  return Math.round((b - a) / 86_400_000);
}

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export function hebrewWeekday(date: string): string {
  return WEEKDAYS[new Date(date + 'T12:00:00').getDay()];
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `יום ${hebrewWeekday(date)}, ${d}/${m}/${y.slice(2)}`;
}

// ---- Body & targets ----

/** Latest known weight: most recent weigh-in, else the profile weight. */
export function currentWeight(data: AppData): number | null {
  const last = data.weighIns[data.weighIns.length - 1];
  return last?.weightKg ?? data.profile?.weightKg ?? null;
}

/** Mifflin-St Jeor basal metabolic rate. */
export function bmr(p: Profile, weightKg: number): number {
  const base = 10 * weightKg + 6.25 * p.heightCm - 5 * p.age;
  return base + (p.sex === 'male' ? 5 : -161);
}

export function tdee(p: Profile, weightKg: number): number {
  return bmr(p, weightKg) * ACTIVITY_FACTORS[p.activityLevel];
}

export interface TargetBreakdown extends Targets {
  bmr: number;
  tdee: number;
  dailyDelta: number; // negative = deficit
  weeklyRateKg: number; // planned weekly change (negative = loss)
  weeksToGoal: number;
  clamped: boolean; // true when the requested pace was unsafe and got limited
}

/**
 * Computes daily targets from the profile and goal:
 * - calories: TDEE +/- the delta needed to reach the goal weight by the target date,
 *   capped at 25% of TDEE for loss (and never below BMR or 1200/1500 kcal), +10% max for gain.
 * - protein: 1.6–2.0 g/kg depending on goal; fat: ~27% of calories; carbs: the rest.
 */
export function computeTargets(p: Profile, weightKg: number, fromDate = today()): TargetBreakdown {
  const b = bmr(p, weightKg);
  const t = tdee(p, weightKg);
  const weeks = Math.max(1, daysBetween(fromDate, p.targetDate) / 7);
  const kgToGo = p.targetWeightKg - weightKg;

  let delta = 0;
  let clamped = false;
  if (p.goalType !== 'maintain' && Math.abs(kgToGo) > 0.2) {
    delta = (kgToGo * KCAL_PER_KG_FAT) / (weeks * 7);
    const maxDeficit = -0.25 * t;
    const maxSurplus = 0.12 * t;
    if (delta < maxDeficit) { delta = maxDeficit; clamped = true; }
    if (delta > maxSurplus) { delta = maxSurplus; clamped = true; }
  }

  const floor = Math.max(b, p.sex === 'male' ? 1500 : 1200);
  let calories = t + delta;
  if (calories < floor) { calories = floor; clamped = true; }
  delta = calories - t;

  const proteinPerKg = p.goalType === 'lose' ? 1.9 : p.goalType === 'gain' ? 1.8 : 1.6;
  const protein = proteinPerKg * weightKg;
  const fat = Math.max((calories * 0.27) / 9, 0.7 * weightKg);
  const carbs = Math.max(0, (calories - protein * 4 - fat * 9) / 4);

  const weeklyRateKg = (delta * 7) / KCAL_PER_KG_FAT;
  const weeksToGoal = weeklyRateKg !== 0 && Math.sign(weeklyRateKg) === Math.sign(kgToGo) ? kgToGo / weeklyRateKg : 0;

  return {
    calories: round(calories, 10),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    bmr: Math.round(b),
    tdee: Math.round(t),
    dailyDelta: Math.round(delta),
    weeklyRateKg: Math.round(weeklyRateKg * 100) / 100,
    weeksToGoal: Math.round(weeksToGoal * 10) / 10,
    clamped,
  };
}

/** The targets actually in use: manual override if set, else computed. */
export function activeTargets(data: AppData): Targets | null {
  const p = data.profile;
  if (!p) return null;
  if (p.customTargets) return p.customTargets;
  const w = currentWeight(data) ?? p.weightKg;
  const { calories, protein, carbs, fat } = computeTargets(p, w);
  return { calories, protein, carbs, fat };
}

// ---- Totals ----

export function sumItems(items: FoodItem[]): Targets {
  return items.reduce(
    (acc, i) => ({
      calories: acc.calories + (i.calories || 0),
      protein: acc.protein + (i.protein || 0),
      carbs: acc.carbs + (i.carbs || 0),
      fat: acc.fat + (i.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function sumEntries(entries: FoodEntry[]): Targets {
  return sumItems(entries.flatMap((e) => e.items));
}

export function entriesForDate(data: AppData, date: string): FoodEntry[] {
  return data.food
    .filter((f) => f.date === date)
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function roundTotals(t: Targets): Targets {
  return { calories: Math.round(t.calories), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat) };
}

export function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round(n: number, step: number): number {
  return Math.round(n / step) * step;
}
