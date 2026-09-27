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
  /** Daily steps goal (default 8000). */
  stepsGoal?: number;
  goalType: GoalType;
  targetWeightKg: number;
  targetDate: string; // YYYY-MM-DD
  fitnessGoals: string;
  foodPreferences: string;
  restrictions: string;
  /** Manual targets override; when absent the computed targets are used. */
  customTargets?: Targets;
  /** Date (YYYY-MM-DD) the custom targets were last changed. */
  targetsSetAt?: string;
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

/** A meal Claude suggested, shown as a card the user can log with one tap. */
export interface MealSuggestion {
  id: string;
  title: string;
  meal: MealType;
  items: FoodItem[];
  note?: string;
  /** Set once the user logged it. */
  loggedEntryId?: string;
}

/** A saved meal the user eats often, loggable with one tap. */
export interface FavoriteMeal {
  id: string;
  name: string;
  meal?: MealType;
  items: FoodItem[];
  uses: number;
  lastUsed?: string;
  createdAt: string;
}

/** Per-day lifestyle metrics. */
export interface DailyMetric {
  date: string;
  waterMl?: number;
  steps?: number;
  /** Sleep of the night before this date. */
  sleepHours?: number;
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
  suggestions?: MealSuggestion[];
  /** 'event' = an app-generated note (e.g. one-tap log), sent to Claude as context. */
  kind?: 'event';
  error?: boolean;
  ts: string;
}

export interface Settings {
  /** Which AI the standalone app uses (inside claude.ai the subscription is always used). */
  provider?: 'claude' | 'gemini';
  /** Claude API key. */
  apiKey: string;
  /** Claude model id. */
  model: string;
  geminiKey?: string;
  geminiModel?: string;
  /** Model tier when running inside claude.ai on the user's subscription. */
  tier?: 'default' | 'complex' | 'quick';
}

export interface AppData {
  version: 1;
  profile: Profile | null;
  food: FoodEntry[];
  workouts: Workout[];
  weighIns: WeighIn[];
  favorites: FavoriteMeal[];
  metrics: DailyMetric[];
  chat: ChatMessage[];
  settings: Settings;
}
