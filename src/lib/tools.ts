import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  addFood, addWeighIn, addWorkout, deleteFood, getData, saveProfile, updateFood,
} from './store';
import { activeTargets, addDays, entriesForDate, MEAL_LABELS, nowTime, roundTotals, sumEntries, sumItems, today } from './nutrition';
import type { ActionChip, Profile } from './types';

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const num = z.number().finite();

const FoodItemSchema = z.object({
  name: z.string().min(1),
  amount: z.string(),
  calories: num.min(0),
  protein: num.min(0),
  carbs: num.min(0),
  fat: num.min(0),
});
const MealSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'drink']);

const schemas = {
  log_food: z.object({
    date: DateStr.optional(),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    meal: MealSchema,
    items: z.array(FoodItemSchema).min(1),
    note: z.string().optional(),
  }),
  update_food_entry: z.object({
    id: z.string(),
    meal: MealSchema.optional(),
    date: DateStr.optional(),
    items: z.array(FoodItemSchema).min(1).optional(),
    note: z.string().optional(),
  }),
  delete_food_entry: z.object({ id: z.string() }),
  log_workout: z.object({
    date: DateStr.optional(),
    type: z.string().min(1),
    duration_min: num.min(0),
    intensity: z.enum(['low', 'medium', 'high']).optional(),
    calories_burned: num.min(0).optional(),
    exercises: z
      .array(z.object({ name: z.string(), sets: num.optional(), reps: z.string().optional(), weight_kg: num.optional() }))
      .optional(),
    notes: z.string().optional(),
  }),
  log_weigh_in: z.object({
    date: DateStr.optional(),
    weight_kg: num.min(20).max(400),
    body_fat_pct: num.optional(),
    waist_cm: num.optional(),
    hips_cm: num.optional(),
    chest_cm: num.optional(),
    arm_cm: num.optional(),
    thigh_cm: num.optional(),
    note: z.string().optional(),
  }),
  update_profile: z.object({
    age: num.optional(),
    height_cm: num.optional(),
    activity_level: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']).optional(),
    training_days_per_week: num.optional(),
    training_types: z.string().optional(),
    goal_type: z.enum(['lose', 'maintain', 'gain']).optional(),
    target_weight_kg: num.optional(),
    target_date: DateStr.optional(),
    fitness_goals: z.string().optional(),
    food_preferences: z.string().optional(),
    restrictions: z.string().optional(),
  }),
  set_targets: z.object({
    calories: num.min(800),
    protein: num.min(0),
    carbs: num.min(0),
    fat: num.min(0),
    reset_to_computed: z.boolean().optional(),
  }),
  get_history: z.object({ from: DateStr, to: DateStr }),
};

type ToolName = keyof typeof schemas;

const foodItemJson = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Food name in Hebrew, including brand when known' },
    amount: { type: 'string', description: 'Amount as the user would say it, e.g. "200 ג\'", "סקופ (25 ג\')", "5 יחידות (~25 ג\')"' },
    calories: { type: 'number' },
    protein: { type: 'number', description: 'grams' },
    carbs: { type: 'number', description: 'grams' },
    fat: { type: 'number', description: 'grams' },
  },
  required: ['name', 'amount', 'calories', 'protein', 'carbs', 'fat'],
};
const mealJson = { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack', 'drink'] };
const dateJson = { type: 'string', description: 'YYYY-MM-DD; omit for today' };

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'log_food',
    description: 'Record a meal, snack or drink the user actually consumed, with per-item nutrition estimates. Returns the updated day totals.',
    input_schema: {
      type: 'object',
      properties: {
        date: dateJson,
        time: { type: 'string', description: 'HH:MM; omit for now' },
        meal: mealJson,
        items: { type: 'array', items: foodItemJson },
        note: { type: 'string' },
      },
      required: ['meal', 'items'],
    },
  },
  {
    name: 'update_food_entry',
    description: 'Correct an existing food entry (by id from app_state). Pass the full corrected items list to replace the items.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' }, meal: mealJson, date: dateJson, items: { type: 'array', items: foodItemJson }, note: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'delete_food_entry',
    description: 'Delete a food entry that was logged by mistake.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'log_workout',
    description: 'Record a completed workout or activity.',
    input_schema: {
      type: 'object',
      properties: {
        date: dateJson,
        type: { type: 'string', description: 'e.g. "קרוספיט", "ריצה", "הליכה מהירה", "ריקוד היפ הופ"' },
        duration_min: { type: 'number' },
        intensity: { type: 'string', enum: ['low', 'medium', 'high'] },
        calories_burned: { type: 'number', description: 'Estimated kcal burned' },
        exercises: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' }, sets: { type: 'number' }, reps: { type: 'string' }, weight_kg: { type: 'number' } },
            required: ['name'],
          },
        },
        notes: { type: 'string' },
      },
      required: ['type', 'duration_min'],
    },
  },
  {
    name: 'log_weigh_in',
    description: 'Record a body weight measurement, optionally with body circumferences (cm) and body-fat %.',
    input_schema: {
      type: 'object',
      properties: {
        date: dateJson,
        weight_kg: { type: 'number' },
        body_fat_pct: { type: 'number' },
        waist_cm: { type: 'number' },
        hips_cm: { type: 'number' },
        chest_cm: { type: 'number' },
        arm_cm: { type: 'number' },
        thigh_cm: { type: 'number' },
        note: { type: 'string' },
      },
      required: ['weight_kg'],
    },
  },
  {
    name: 'update_profile',
    description: 'Update the user profile, goals or preferences when the user shares new information. Only pass fields that changed.',
    input_schema: {
      type: 'object',
      properties: {
        age: { type: 'number' },
        height_cm: { type: 'number' },
        activity_level: { type: 'string', enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'] },
        training_days_per_week: { type: 'number' },
        training_types: { type: 'string' },
        goal_type: { type: 'string', enum: ['lose', 'maintain', 'gain'] },
        target_weight_kg: { type: 'number' },
        target_date: dateJson,
        fitness_goals: { type: 'string' },
        food_preferences: { type: 'string' },
        restrictions: { type: 'string' },
      },
    },
  },
  {
    name: 'set_targets',
    description: 'Set custom daily nutrition targets agreed with the user. Pass reset_to_computed=true to go back to the automatically computed targets.',
    input_schema: {
      type: 'object',
      properties: {
        calories: { type: 'number' },
        protein: { type: 'number' },
        carbs: { type: 'number' },
        fat: { type: 'number' },
        reset_to_computed: { type: 'boolean' },
      },
      required: ['calories', 'protein', 'carbs', 'fat'],
    },
  },
  {
    name: 'get_history',
    description: 'Get per-day food totals, workouts and weigh-ins for a date range (for weekly/monthly summaries).',
    input_schema: {
      type: 'object',
      properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } },
      required: ['from', 'to'],
    },
  },
].map((t) => ({ ...t, eager_input_streaming: true }) as Anthropic.Beta.BetaTool);

export interface ToolOutcome {
  content: string;
  isError: boolean;
  chip?: ActionChip;
}

function dayStatus(date: string) {
  const data = getData();
  const totals = roundTotals(sumEntries(entriesForDate(data, date)));
  const targets = activeTargets(data);
  return { date, day_totals: totals, targets };
}

/** Validates model-supplied input and applies it to the local store. */
export function runTool(name: string, rawInput: unknown): ToolOutcome {
  const schema = schemas[name as ToolName];
  if (!schema) return { content: `Unknown tool ${name}`, isError: true };
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) {
    return { content: JSON.stringify({ INVALID_INPUT: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }), isError: true };
  }
  const input = parsed.data as never;
  switch (name as ToolName) {
    case 'log_food': {
      const i = input as z.infer<typeof schemas.log_food>;
      const date = i.date ?? today();
      const entry = addFood({ date, time: i.time ?? nowTime(), meal: i.meal, items: i.items, note: i.note });
      const kcal = Math.round(sumItems(entry.items).calories);
      return {
        content: JSON.stringify({ ok: true, id: entry.id, ...dayStatus(date) }),
        isError: false,
        chip: { ok: true, label: `נרשם: ${MEAL_LABELS[entry.meal]} · ${kcal} קק״ל` },
      };
    }
    case 'update_food_entry': {
      const i = input as z.infer<typeof schemas.update_food_entry>;
      const { id, ...patch } = i;
      const updated = updateFood(id, patch);
      if (!updated) return { content: `No food entry with id ${id}`, isError: true };
      return {
        content: JSON.stringify({ ok: true, id, ...dayStatus(updated.date) }),
        isError: false,
        chip: { ok: true, label: `עודכן: ${MEAL_LABELS[updated.meal]}` },
      };
    }
    case 'delete_food_entry': {
      const { id } = input as z.infer<typeof schemas.delete_food_entry>;
      const entry = getData().food.find((f) => f.id === id);
      if (!entry || !deleteFood(id)) return { content: `No food entry with id ${id}`, isError: true };
      return { content: JSON.stringify({ ok: true, ...dayStatus(entry.date) }), isError: false, chip: { ok: true, label: 'נמחק רישום' } };
    }
    case 'log_workout': {
      const i = input as z.infer<typeof schemas.log_workout>;
      const w = addWorkout({
        date: i.date ?? today(),
        type: i.type,
        durationMin: i.duration_min,
        intensity: i.intensity,
        caloriesBurned: i.calories_burned,
        exercises: i.exercises?.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps, weightKg: e.weight_kg })),
        notes: i.notes,
      });
      return { content: JSON.stringify({ ok: true, id: w.id }), isError: false, chip: { ok: true, label: `אימון נרשם: ${w.type} · ${w.durationMin} דק׳` } };
    }
    case 'log_weigh_in': {
      const i = input as z.infer<typeof schemas.log_weigh_in>;
      const w = addWeighIn({
        date: i.date ?? today(),
        weightKg: i.weight_kg,
        bodyFatPct: i.body_fat_pct,
        waistCm: i.waist_cm,
        hipsCm: i.hips_cm,
        chestCm: i.chest_cm,
        armCm: i.arm_cm,
        thighCm: i.thigh_cm,
        note: i.note,
      });
      const all = getData().weighIns;
      return {
        content: JSON.stringify({ ok: true, id: w.id, recent: all.slice(-8).map((x) => ({ date: x.date, kg: x.weightKg })) }),
        isError: false,
        chip: { ok: true, label: `שקילה נרשמה: ${w.weightKg} ק״ג` },
      };
    }
    case 'update_profile': {
      const i = input as z.infer<typeof schemas.update_profile>;
      const p = getData().profile;
      if (!p) return { content: 'Profile not set yet; ask the user to fill in the profile screen first.', isError: true };
      const next: Profile = {
        ...p,
        age: i.age ?? p.age,
        heightCm: i.height_cm ?? p.heightCm,
        activityLevel: i.activity_level ?? p.activityLevel,
        trainingDaysPerWeek: i.training_days_per_week ?? p.trainingDaysPerWeek,
        trainingTypes: i.training_types ?? p.trainingTypes,
        goalType: i.goal_type ?? p.goalType,
        targetWeightKg: i.target_weight_kg ?? p.targetWeightKg,
        targetDate: i.target_date ?? p.targetDate,
        fitnessGoals: i.fitness_goals ?? p.fitnessGoals,
        foodPreferences: i.food_preferences ?? p.foodPreferences,
        restrictions: i.restrictions ?? p.restrictions,
        updatedAt: new Date().toISOString(),
      };
      saveProfile(next);
      return { content: JSON.stringify({ ok: true, targets: activeTargets(getData()) }), isError: false, chip: { ok: true, label: 'הפרופיל עודכן' } };
    }
    case 'set_targets': {
      const i = input as z.infer<typeof schemas.set_targets>;
      const p = getData().profile;
      if (!p) return { content: 'Profile not set yet.', isError: true };
      const customTargets = i.reset_to_computed
        ? undefined
        : { calories: Math.round(i.calories), protein: Math.round(i.protein), carbs: Math.round(i.carbs), fat: Math.round(i.fat) };
      saveProfile({ ...p, customTargets, updatedAt: new Date().toISOString() });
      const t = activeTargets(getData())!;
      return { content: JSON.stringify({ ok: true, targets: t }), isError: false, chip: { ok: true, label: `יעדים: ${t.calories} קק״ל · ${t.protein}ג׳ חלבון` } };
    }
    case 'get_history': {
      const { from, to } = input as z.infer<typeof schemas.get_history>;
      const data = getData();
      const days = [];
      for (let d = from, n = 0; d <= to && n < 120; d = addDays(d, 1), n++) {
        const entries = entriesForDate(data, d);
        days.push({ date: d, entries: entries.length, ...roundTotals(sumEntries(entries)) });
      }
      const workouts = data.workouts
        .filter((w) => w.date >= from && w.date <= to)
        .map((w) => ({ date: w.date, type: w.type, min: w.durationMin, kcal: w.caloriesBurned }));
      const weighIns = data.weighIns.filter((w) => w.date >= from && w.date <= to).map((w) => ({ date: w.date, kg: w.weightKg, waist: w.waistCm }));
      return { content: JSON.stringify({ days, workouts, weighIns }), isError: false };
    }
  }
}
