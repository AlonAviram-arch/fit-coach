# Requirements: from the Gemini conversation to the app

This app is based on a long Hebrew conversation (about 200 messages over several weeks) in which Gemini acted as a personal dietitian. Personal details from that conversation (body stats and so on) are intentionally left out of this public repo.

## What the conversation did well (kept)

| Behavior in the conversation | How the app does it |
|---|---|
| "You're my dietitian": started from height, weight, a target weight over 6 months, activity level, and 2–3 intense CrossFit workouts a week | **Profile screen** with body measurements, activity, training days/types, target weight and date. `computeTargets` produces daily calories, protein, carbs and fat. |
| Built a menu from foods the user likes (yogurt + protein powder + Fiber One + chia, grilled chicken breast, vegetables) and avoids (gluten, raw onion) | `foodPreferences` / `restrictions` in the profile, which are sent to the coach on every turn |
| A planned Friday-night treat meal with challah, balanced by lighter meals earlier in the day | The system prompt tells the coach to plan treats flexibly instead of forbidding them |
| "Log everything I eat today, summarize each meal and the whole day" | `log_food` for each meal; the reply shows an item table, the meal total, and the running day total vs targets |
| Item-level estimates for Israeli brands (Gad, Tnuva, Taaman, Elite…) | The prompt asks for Israeli product knowledge; values are stored per item |
| Corrections ("it's whole bulgur", "I only took 85 g") | `update_food_entry` edits the existing entry instead of creating a duplicate |
| Planning questions ("how much of each should I put on the plate?", "which dinner is better?") | The coach recommends portions that fit the remaining budget and doesn't log until the user confirms |
| Photos of nutrition labels and restaurant meals | Image upload (camera or gallery), downscaled on the device and sent to Claude's vision |
| "I did an intense CrossFit workout (~400 kcal)", "CrossFit tonight" | `log_workout`, plus advice on carbs around training days |
| End-of-day wrap-up ("that's it", "let's close", "only water") with insights (hidden snack calories, protein gap) | End-of-day summary behavior in the prompt |
| "Give me a weekly summary: what was my deficit, how much fat is that?", "how long to lose 7 kg?" | `get_history`, then average intake, deficit vs TDEE, estimated fat change (7,700 kcal/kg), and time to goal |
| "Am I eating too little?" | A safety rule: never go below the calorie floor, and flag intake that is repeatedly far under target |
| "Show me the daily summary, not in a table" | The coach follows format requests for the rest of the conversation |
| Retroactive logging ("last night I ate…") | Every tool takes an optional `date` |

## What the conversation lacked (added)

- **Persistent structured data:** in the Gemini chat, totals lived only in the text and were sometimes recalculated inconsistently. The app stores every item, and totals are always computed from that data.
- **Weekly weigh-ins and body measurements**, with a trend chart and progress toward the goal.
- **A workout log** with exercises, sets, reps and weights, and a weekly count against the training-days goal.
- **An at-a-glance dashboard:** macro bars in the chat header and a daily log screen.
- **Editable targets:** calculated automatically, with a manual override (e.g. from a real dietitian).
- **Privacy:** everything stays on the phone.

## Added in v1.1

- **Suggestion cards** with one-tap logging, portion scaling and item removal (in the Gemini chat, suggested portions had to be retyped as "I ate…").
- **Favorite meals**, based on how often the same breakfast bowl and snacks repeated in the conversation.
- **Adaptive targets** from the real intake and weight trend, including detecting a plateau caused by eating over target. This answers the conversation's "am I eating too little / why isn't it moving?" questions with data.
- **Water, steps and sleep** tracking ("I only drank water" came up at the end of almost every day).

## Out of scope for now

- Syncing across devices (the JSON backup covers moving between devices).
- Push reminders (the weigh-in reminder appears inside the app).
- Barcode scanning (a photo of the label works instead).
