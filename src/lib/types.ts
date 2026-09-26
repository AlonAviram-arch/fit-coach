export type Sex = 'female' | 'male';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type GoalType = 'lose' | 'maintain' | 'gain';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';

/** Daily macro targets. */
export interface Targets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Profile {
  name: string;
  sex: Sex;
  age: number;
  heightCm: number;
  /** Current weight at the time the profile was saved. Latest weigh-in takes precedence. */
  weightKg: number;
  bodyFatPct?: number;
  waistCm?: number;
  hipsCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
  activityLevel: ActivityLevel;
  trainingDaysPerWeek: number;
  trainingTypes: string;
  goalType: GoalType;
  targetWeightKg: number;
  targetDate: string; // YYYY-MM-DD
  fitnessGoals: string;
  foodPreferences: string;
  restrictions: string;
  /** Manual targets override; when absent the computed targets are used. */
  customTargets?: Targets;
  createdAt: string;
  updatedAt: string;
}

export interface FoodItem {
  name: string;
  amount: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FoodEntry {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  meal: MealType;
  items: FoodItem[];
  note?: string;
}

export interface Exercise {
  name: string;
  sets?: number;
  reps?: string;
  weightKg?: number;
}

export interface Workout {
  id: string;
  date: string;
  type: string;
  durationMin: number;
  intensity?: 'low' | 'medium' | 'high';
  caloriesBurned?: number;
  exercises?: Exercise[];
  notes?: string;
}

export interface WeighIn {
  id: string;
  date: string;
  weightKg: number;
  bodyFatPct?: number;
  waistCm?: number;
  hipsCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
  note?: string;
}

/** A logged action shown as a chip under an assistant message. */
export interface ActionChip {
  label: string;
  ok: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Number of images attached (images themselves are not persisted). */
  images?: number;
  actions?: ActionChip[];
  error?: boolean;
  ts: string;
}

export interface Settings {
  apiKey: string;
  model: string;
}

export interface AppData {
  version: 1;
  profile: Profile | null;
  food: FoodEntry[];
  workouts: Workout[];
  weighIns: WeighIn[];
  chat: ChatMessage[];
  settings: Settings;
}
