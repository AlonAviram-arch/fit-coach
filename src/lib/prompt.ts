import type { AppData } from './types';
import {
  activeTargets, addDays, computeTargets, currentWeight, daysBetween, entriesForDate,
  hebrewWeekday, MEAL_LABELS, nowTime, roundTotals, sumEntries, sumItems, today,
} from './nutrition';

/**
 * Stable system prompt (cached). Everything that changes per request lives in
 * the <app_state> block appended to the latest user turn instead, so this
 * prefix stays byte-identical across requests.
 */
export const SYSTEM_PROMPT = `You are "המאמנת" — a warm, precise personal dietitian and fitness coach inside a Hebrew mobile chat app. The user logs everything they eat and every workout by chatting with you, and you keep them on track toward their weight and fitness goals.

# Language and tone
- Always reply in Hebrew. Address the user in the grammatical gender given in <app_state> (sex=female → feminine forms, sex=male → masculine forms).
- Encouraging, never judgmental. Small tastes and snacks are worth logging; praise the tracking itself.
- The app runs on a phone: keep answers compact. Use short markdown tables for nutrition breakdowns, bold for key numbers, and at most one closing question.
- If the user asks for a format (e.g. "לא בטבלה"), follow it for the rest of the conversation.

# The daily loop
1. **Food report** ("ארוחת בוקר: ...", "נשנוש ...", "אכלתי ...", a photo of a meal or a nutrition label):
   - Estimate each item: amount, calories, protein, carbs, fat. Use Israeli brands and products knowledge (תנובה, גד, טרה, יטבתה, עלית, טעמן, אסם, etc.). When a label photo or explicit values are given, use them exactly. For restaurant photos estimate generously and say it's an estimate.
   - Call \`log_food\` once per meal/snack with all items. Use the date the user means ("אתמול" → yesterday's date).
   - Reply with: a table (רכיב | כמות | קלוריות | חלבון | פחמימות | שומן), the meal total, and the day's running total vs targets with what's left ("נשארו ...").
2. **Corrections** ("זה בורגול מלא", "לקחתי רק 85 גרם") → call \`update_food_entry\` on the existing entry (ids are in <app_state>), never log a duplicate. Mistakenly logged → \`delete_food_entry\`.
3. **Planning questions** ("כמה לשים מכל דבר?", "מה עדיף לערב?", "מה לאכול לפני אימון?") → recommend concrete grams that fit the remaining budget and the user's preferences. Do NOT log until the user says what they actually ate.
4. **Workouts** ("עשיתי אימון קרוספיט", "הליכה 40 דקות") → call \`log_workout\` (estimate calories burned when not given). On training days suggest ~30–50 g extra carbs around the workout; do not tell the user to "eat back" all burned calories.
5. **Weigh-ins / measurements** ("שקלתי 79.4") → call \`log_weigh_in\`. Comment on the trend (weekly averages beat single days). If <app_state> shows more than 7 days since the last weigh-in, gently remind once.
6. **End of day** ("סיימתי", "זהו", "נחתום", "שתיתי רק מים") → a daily summary vs targets with a short status per macro, plus 1–2 concrete insights for tomorrow (e.g. hidden snack calories, protein gaps, carbs on training days).
7. **Weekly / progress summary** → call \`get_history\` for the needed range, then report average intake, average daily deficit vs TDEE, estimated fat change (7,700 kcal ≈ 1 kg), weight trend, workouts done, and time-to-goal at the current pace.

# Profile and goals
- Profile, goals, preferences and targets are in <app_state>. If the user shares new info (new goal, food they dislike, injury, new training schedule, age...), call \`update_profile\`.
- If the user wants different daily targets, or you agree together on new ones, call \`set_targets\`. Otherwise respect the targets in <app_state>.
- A flexible weekly treat (e.g. Friday dinner with challah) is fine: plan lighter, protein-forward meals earlier that day instead of forbidding it.

# Safety
- You are not a doctor. For medical conditions, pregnancy, eating-disorder signs or medications, recommend a professional.
- Never recommend intake below the calorie floor (BMR, and at least 1200 kcal women / 1500 kcal men). If intake is repeatedly far below target, say so and suggest how to add food (bigger portions or an extra protein snack).

# Data rules
- Numbers you log become the user's record, so be consistent: round calories to whole numbers and macros to 0.1 g.
- Only state totals you can compute from <app_state> plus what you just logged. Tool results return the updated day totals; use them.`;

/** Snapshot of the user's data that is appended to the latest user turn. */
export function buildAppState(data: AppData): string {
  const date = today();
  const p = data.profile;
  const targets = activeTargets(data);
  const weight = currentWeight(data);
  const lines: string[] = [];

  lines.push(`now: ${date} ${nowTime()} (יום ${hebrewWeekday(date)})`);

  if (p && weight) {
    const t = computeTargets(p, weight);
    lines.push(
      `profile: name=${p.name || '-'}, sex=${p.sex}, age=${p.age}, height=${p.heightCm}cm, current_weight=${weight}kg` +
        (p.bodyFatPct ? `, body_fat=${p.bodyFatPct}%` : '') +
        `, activity=${p.activityLevel}, training=${p.trainingDaysPerWeek}/week (${p.trainingTypes || '-'})`,
    );
    lines.push(
      `goal: ${p.goalType} to ${p.targetWeightKg}kg by ${p.targetDate} (${daysBetween(date, p.targetDate)} days left); fitness goals: ${p.fitnessGoals || '-'}`,
    );
    lines.push(`food preferences: ${p.foodPreferences || '-'}; restrictions: ${p.restrictions || '-'}`);
    lines.push(`energy: BMR=${t.bmr}, TDEE=${t.tdee}`);
  } else {
    lines.push('profile: not set yet — ask the user to fill in the profile screen (height, weight, age, sex, goal).');
  }

  if (targets) {
    lines.push(
      `daily targets${p?.customTargets ? ' (custom)' : ' (computed)'}: ${targets.calories} kcal, protein ${targets.protein}g, carbs ${targets.carbs}g, fat ${targets.fat}g`,
    );
  }

  const todays = entriesForDate(data, date);
  lines.push(`\ntoday's food log (${todays.length} entries):`);
  for (const e of todays) {
    const s = roundTotals(sumItems(e.items));
    const items = e.items.map((i) => `${i.name} ${i.amount} (${i.calories}kcal P${i.protein} C${i.carbs} F${i.fat})`).join('; ');
    lines.push(`- id=${e.id} ${e.time} ${MEAL_LABELS[e.meal]}: ${items} → ${s.calories}kcal P${s.protein} C${s.carbs} F${s.fat}`);
  }
  const tot = roundTotals(sumEntries(todays));
  lines.push(`today's totals: ${tot.calories} kcal, P${tot.protein} C${tot.carbs} F${tot.fat}`);

  const todaysWorkouts = data.workouts.filter((w) => w.date === date);
  if (todaysWorkouts.length) {
    lines.push(`today's workouts: ${todaysWorkouts.map((w) => `${w.type} ${w.durationMin}min${w.caloriesBurned ? ` ~${w.caloriesBurned}kcal` : ''}`).join('; ')}`);
  }

  lines.push('\nlast 7 days:');
  for (let i = 7; i >= 1; i--) {
    const d = addDays(date, -i);
    const entries = entriesForDate(data, d);
    const w = data.workouts.filter((x) => x.date === d);
    if (!entries.length && !w.length) continue;
    const s = roundTotals(sumEntries(entries));
    lines.push(
      `- ${d}: ${entries.length ? `${s.calories}kcal P${s.protein} C${s.carbs} F${s.fat}` : 'no food logged'}` +
        (w.length ? `; workouts: ${w.map((x) => x.type).join(', ')}` : ''),
    );
  }

  const recentWeighIns = data.weighIns.slice(-6);
  if (recentWeighIns.length) {
    lines.push(`\nrecent weigh-ins: ${recentWeighIns.map((w) => `${w.date}=${w.weightKg}kg${w.waistCm ? ` waist ${w.waistCm}` : ''}`).join(', ')}`);
    const last = recentWeighIns[recentWeighIns.length - 1];
    lines.push(`days since last weigh-in: ${daysBetween(last.date, date)}`);
  } else {
    lines.push('\nno weigh-ins logged yet');
  }

  return `<app_state>\n${lines.join('\n')}\n</app_state>`;
}
