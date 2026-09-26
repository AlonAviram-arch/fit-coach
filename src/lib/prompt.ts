import type { AppData } from './types';
import {
  activeTargets, adaptiveEstimate, addDays, computeTargets, currentWeight, daysBetween, entriesForDate,
  hebrewWeekday, MEAL_LABELS, nowTime, roundTotals, SLEEP_GOAL_HOURS, stepsGoal, sumEntries, sumItems, today, waterGoalMl,
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
3. **Meal suggestions and planning** ("מה לאכול לערב?", "מה עדיף?", "כמה לשים מכל דבר?", "מה לאכול לפני אימון?", "יש לי בבית עוף, אורז וירקות"):
   - Call \`suggest_meal\` once per option (1–3 options). Each call shows a card with items, grams and macros and a one-tap "אכלתי את זה" button, so keep your text short: one line per option on why it fits. Don't repeat the card's table.
   - Fit the remaining budget for the day (especially protein), the user's preferences and restrictions, the time of day, and training (carbs before/after workouts).
   - Prefer the user's favorites and foods they often log. Adapt them before inventing something new.
   - Suggesting is not logging. Log only when the user says what they ate, or they tap the card (an event note "[נרשם בלחיצה: …]" appears in the chat and the entry shows up in <app_state>).
4. **Workouts** ("עשיתי אימון קרוספיט", "הליכה 40 דקות") → call \`log_workout\` (estimate calories burned when not given). On training days suggest ~30–50 g extra carbs around the workout; do not tell the user to "eat back" all burned calories.
5. **Weigh-ins / measurements** ("שקלתי 79.4") → call \`log_weigh_in\`. Comment on the trend (weekly averages beat single days). If <app_state> shows more than 7 days since the last weigh-in, gently remind once.
6. **End of day** ("סיימתי", "זהו", "נחתום", "שתיתי רק מים") → a daily summary vs targets with a short status per macro, plus 1–2 concrete insights for tomorrow (e.g. hidden snack calories, protein gaps, carbs on training days).
7. **Weekly / progress summary** → call \`get_history\` for the needed range, then report average intake, average daily deficit vs TDEE, estimated fat change (7,700 kcal ≈ 1 kg), weight trend, workouts done, and time-to-goal at the current pace.
8. **Water, steps, sleep** ("שתיתי 2 כוסות מים", "עשיתי 9,000 צעדים", "ישנתי 6 שעות") → call \`log_daily_metrics\`. Connect them to the plan when relevant: short sleep often means more hunger and cravings, so suggest a protein-rich breakfast; low water intake; more steps on rest days.

# Favorites
- Favorites (saved meals) are listed in <app_state> with ids. When the user names one ("הקערה הרגילה", "כמו אתמול בבוקר") call \`log_favorite\` (with portion for "חצי"/"כפול").
- When the user logs essentially the same meal for the third time, or asks to save a meal, offer to save it (or save it if asked) with \`save_favorite\`, using from_entry_id when it's already logged.

# Adaptive targets
- <app_state> may include "adaptive estimate": the TDEE implied by the user's actual logged intake and weight trend over the last 4 weeks.
- If it shows plateau=yes, or differs=yes by a meaningful amount, raise it once, gently: explain what the real data shows, check that logging has been complete (missing days or untracked snacks make the estimate too low), then offer the recommended targets. Apply them with \`set_targets\` only after the user agrees.
- If the plateau comes from eating above target (a large positive gap vs target), the target is fine and the gap is the issue: point to where the extra calories come from (snacks, weekends, drinks) instead of lowering the target.

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

  const m = data.metrics.find((x) => x.date === date);
  lines.push(
    `today's lifestyle: water ${m?.waterMl ?? 0}/${waterGoalMl(data)} ml, steps ${m?.steps ?? '-'}/${stepsGoal(data)}, ` +
      `sleep last night ${m?.sleepHours ?? '-'} h (goal ${SLEEP_GOAL_HOURS}+)`,
  );

  const todaysWorkouts = data.workouts.filter((w) => w.date === date);
  if (todaysWorkouts.length) {
    lines.push(`today's workouts: ${todaysWorkouts.map((w) => `${w.type} ${w.durationMin}min${w.caloriesBurned ? ` ~${w.caloriesBurned}kcal` : ''}`).join('; ')}`);
  }

  lines.push('\nlast 7 days:');
  for (let i = 7; i >= 1; i--) {
    const d = addDays(date, -i);
    const entries = entriesForDate(data, d);
    const w = data.workouts.filter((x) => x.date === d);
    const dm = data.metrics.find((x) => x.date === d);
    if (!entries.length && !w.length && !dm) continue;
    const s = roundTotals(sumEntries(entries));
    const life = [dm?.waterMl && `water ${dm.waterMl}ml`, dm?.steps && `steps ${dm.steps}`, dm?.sleepHours && `sleep ${dm.sleepHours}h`].filter(Boolean);
    lines.push(
      `- ${d}: ${entries.length ? `${s.calories}kcal P${s.protein} C${s.carbs} F${s.fat}` : 'no food logged'}` +
        (w.length ? `; workouts: ${w.map((x) => x.type).join(', ')}` : '') +
        (life.length ? `; ${life.join(', ')}` : ''),
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

  if (data.favorites.length) {
    lines.push('\nfavorites:');
    for (const f of [...data.favorites].sort((a, b) => b.uses - a.uses).slice(0, 15)) {
      const t = roundTotals(sumItems(f.items));
      lines.push(
        `- id=${f.id} "${f.name}"${f.meal ? ` (${MEAL_LABELS[f.meal]})` : ''}: ${f.items.map((i) => `${i.name} ${i.amount}`).join(', ')} → ${t.calories}kcal P${t.protein}; used ${f.uses}x`,
      );
    }
  }

  const est = adaptiveEstimate(data);
  if (est) {
    lines.push(
      `\nadaptive estimate (last ${est.windowDays} days, ${est.loggedDays} complete logged days): avg intake ${est.avgIntake} kcal ` +
        `(${est.intakeGap >= 0 ? '+' : ''}${est.intakeGap} vs target), ` +
        `weight trend ${est.weeklyChangeKg} kg/week → real TDEE ≈ ${est.tdee}; recommended ${est.recommended.calories} kcal ` +
        `P${est.recommended.protein} C${est.recommended.carbs} F${est.recommended.fat}; plateau=${est.plateau ? 'yes' : 'no'}; differs=${est.differs ? 'yes' : 'no'}`,
    );
  }

  return `<app_state>\n${lines.join('\n')}\n</app_state>`;
}
