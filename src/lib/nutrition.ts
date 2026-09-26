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

  const floor = calorieFloor(p, weightKg);
  let calories = t + delta;
  if (calories < floor) { calories = floor; clamped = true; }
  delta = calories - t;

  const macros = macrosFor(round(calories, 10), p, weightKg);
  const weeklyRateKg = (delta * 7) / KCAL_PER_KG_FAT;
  const weeksToGoal = weeklyRateKg !== 0 && Math.sign(weeklyRateKg) === Math.sign(kgToGo) ? kgToGo / weeklyRateKg : 0;

  return {
    ...macros,
    bmr: Math.round(b),
    tdee: Math.round(t),
    dailyDelta: Math.round(delta),
    weeklyRateKg: Math.round(weeklyRateKg * 100) / 100,
    weeksToGoal: Math.round(weeksToGoal * 10) / 10,
    clamped,
  };
}

/** Splits a calorie target into macros: protein by goal (g/kg), fat ~27% (min 0.7 g/kg), carbs the rest. */
export function macrosFor(calories: number, p: Profile, weightKg: number): Targets {
  const proteinPerKg = p.goalType === 'lose' ? 1.9 : p.goalType === 'gain' ? 1.8 : 1.6;
  const protein = proteinPerKg * weightKg;
  const fat = Math.max((calories * 0.27) / 9, 0.7 * weightKg);
  const carbs = Math.max(0, (calories - protein * 4 - fat * 9) / 4);
  return { calories: Math.round(calories), protein: Math.round(protein), carbs: Math.round(carbs), fat: Math.round(fat) };
}

export function calorieFloor(p: Profile, weightKg: number): number {
  return Math.max(bmr(p, weightKg), p.sex === 'male' ? 1500 : 1200);
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

// ---- Portions ----

/** Scales every number in an amount string: "5 יחידות (~25 ג׳)" ×0.5 → "2.5 יחידות (~12.5 ג׳)". */
function scaleAmount(amount: string, factor: number): string {
  return amount.replace(/\d+(?:\.\d+)?/g, (n) => String(Math.round(Number(n) * factor * 10) / 10));
}

export function scaleItems(items: FoodItem[], factor: number): FoodItem[] {
  if (factor === 1) return items;
  return items.map((i) => ({
    ...i,
    amount: scaleAmount(i.amount, factor),
    calories: Math.round(i.calories * factor),
    protein: r1(i.protein * factor),
    carbs: r1(i.carbs * factor),
    fat: r1(i.fat * factor),
  }));
}

/** Meal type by time of day, for one-tap logging. */
export function mealForNow(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h >= 12 && h < 15) return 'lunch';
  if (h >= 18 && h < 22) return 'dinner';
  return 'snack';
}

// ---- Lifestyle goals ----

/** ~35 ml per kg, rounded to a glass (250 ml), between 2 and 4 liters. */
export function waterGoalMl(data: AppData): number {
  const w = currentWeight(data) ?? 70;
  return Math.min(4000, Math.max(2000, Math.round((w * 35) / 250) * 250));
}

export function stepsGoal(data: AppData): number {
  return data.profile?.stepsGoal ?? 8000;
}

export const SLEEP_GOAL_HOURS = 7;

// ---- Adaptive targets ----

export interface AdaptiveEstimate {
  /** TDEE implied by logged intake and the actual weight trend. */
  tdee: number;
  /** Calories that would hit the planned weekly pace given the real TDEE. */
  recommended: Targets;
  avgIntake: number;
  /** Average logged intake minus the current calorie target (positive = eating above target). */
  intakeGap: number;
  weeklyChangeKg: number;
  loggedDays: number;
  windowDays: number;
  /** Losing goal but weight has barely moved for 3+ weeks. */
  plateau: boolean;
  /** Current targets differ meaningfully from the recommendation. */
  differs: boolean;
}

const ADAPTIVE_WINDOW_DAYS = 28;

/**
 * Energy balance from real data: TDEE ≈ average logged intake − (weight slope × 7700).
 * Uses the last 28 days (excluding today). Needs ≥3 weigh-ins spanning ≥14 days and
 * ≥10 "complete" logged days (≥2 entries and ≥800 kcal). Returns null otherwise.
 */
export function adaptiveEstimate(data: AppData): AdaptiveEstimate | null {
  const p = data.profile;
  if (!p) return null;
  const end = addDays(today(), -1);
  const start = addDays(today(), -ADAPTIVE_WINDOW_DAYS);

  const weighIns = data.weighIns.filter((w) => w.date >= start && w.date <= today());
  if (weighIns.length < 3) return null;
  const spanDays = daysBetween(weighIns[0].date, weighIns[weighIns.length - 1].date);
  if (spanDays < 14) return null;

  // Least-squares slope of weight over time (kg/day).
  const xs = weighIns.map((w) => daysBetween(start, w.date));
  const ys = weighIns.map((w) => w.weightKg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const num = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((acc, x) => acc + (x - mx) ** 2, 0);
  if (!den) return null;
  const slope = num / den;

  let total = 0;
  let loggedDays = 0;
  // Adherence is only measured against the current targets, i.e. since they were set.
  let sinceTotal = 0;
  let sinceDays = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const entries = entriesForDate(data, d);
    const kcal = sumEntries(entries).calories;
    if (entries.length >= 2 && kcal >= 800) {
      total += kcal;
      loggedDays++;
      if (!p.targetsSetAt || d >= p.targetsSetAt) {
        sinceTotal += kcal;
        sinceDays++;
      }
    }
  }
  if (loggedDays < 10) return null;

  const avgIntake = total / loggedDays;
  const tdeeEst = avgIntake - slope * KCAL_PER_KG_FAT;
  if (tdeeEst < 1200 || tdeeEst > 5000) return null;

  const weight = currentWeight(data) ?? p.weightKg;
  const planned = computeTargets(p, weight);
  const calories = round(Math.max(calorieFloor(p, weight), tdeeEst + planned.dailyDelta), 10);
  const recommended = macrosFor(calories, p, weight);
  const active = activeTargets(data);
  const weeklyChangeKg = Math.round(slope * 7 * 100) / 100;

  return {
    tdee: Math.round(tdeeEst),
    recommended,
    avgIntake: Math.round(avgIntake),
    intakeGap: active && sinceDays >= 7 ? Math.round(sinceTotal / sinceDays - active.calories) : 0,
    weeklyChangeKg,
    loggedDays,
    windowDays: ADAPTIVE_WINDOW_DAYS,
    plateau: p.goalType === 'lose' && spanDays >= 21 && weeklyChangeKg > -0.1,
    differs: !!active && Math.abs(active.calories - calories) >= 100,
  };
}
