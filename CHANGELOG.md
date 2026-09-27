# Changelog

## 1.4.0 – 2026-09-27

Claude token-cost review ([docs/COST_OPTIMIZATION.md](docs/COST_OPTIMIZATION.md)): about 40% less input per request on a realistic data set, with no change in behavior.

- Automatic caching of the tool-loop tail, so the second round of a message reads images, app state and the first round from cache.
- Chat history replay trimmed from 30–60 to 12–24 messages in all backends. The day's data already reaches the coach as structured state.
- Photos downscaled to 1280 px, about 33% fewer image tokens.
- Favorites listed compactly in the app state.
- A Claude usage panel in the profile (requests, estimated cost, cache hit rate) and a thinking-depth setting (default unchanged: medium).
- Fix: image-only messages are replayed in history with the same first block as when sent.

## 1.3.0 – 2026-09-27

- **Google Gemini as a free option** in the standalone app, next to Claude (API key), which stays available. Choose the provider in the profile screen. Models: Gemini 3.8 Flash (default) and Gemini 3.5 Flash-Lite.
- The Gemini backend uses streaming REST with function calling: same prompt, tools, suggestion cards and photos as Claude, and thought signatures are echoed back unchanged.
- Hebrew errors for Gemini's free-tier limits, invalid keys, unavailable models and safety blocks. A privacy note explains that free-tier content may be used by Google.
- The Gemini key, like the Claude key, stays on the device and is left out of backups and cloud sync.

## 1.2.0 – 2026-09-27

- **Runs on your Claude subscription:** published as a claude.ai artifact (https://claude.ai/artifact/2Nd8HvkAwi7R9g3jxNQ3Gw). Inside claude.ai the coach reaches Claude through the viewer's `sample` capability, on the user's own Pro/Max plan, with no API key. All tools work as page functions, with a model tier setting.
- **Cloud sync in claude.ai:** data is kept in the artifact database under the user's private subtree, split into core, monthly and chat documents, and restored on any device.
- **In-app dialogs** replace `confirm`/`prompt`/`alert`, which the claude.ai viewer blocks. Backup export is hidden there because the data is synced.
- The build uses relative paths so one bundle serves both GitHub Pages and claude.ai. `npm run build:artifact` produces the artifact page.
- Fix: saving a new profile without an API key now opens the chat in subscription mode.

## 1.1.0 – 2026-09-27

- **Meal suggestion cards:** the coach answers "what should I eat?" with 1–3 cards. You can log one with one tap, adjust the portion or drop items first, or save it as a favorite. New tool: `suggest_meal`.
- **Favorite meals:** save from a card, the daily log or chat, then log from the ⭐ sheet or by name in chat (with portion). The coach suggests saving repeated meals. New tools: `save_favorite`, `log_favorite`, `delete_favorite`.
- **Adaptive targets:** estimates real TDEE from logged intake and the weight trend over 28 days. It recommends updated targets (apply with one tap), detects plateaus, and tells a wrong target apart from eating over target.
- **Water, steps and sleep:** a daily card in the log (one tap per glass), a steps goal in the profile, and logging from chat with the new `log_daily_metrics` tool. The coach factors these into its advice.
- One-tap actions leave a note in the chat so the coach stays in sync.

## 1.0.0 – 2026-09-26

First release.

- Hebrew chat coach powered by Claude (Opus 5 by default; Sonnet 5 and Haiku 4.5 selectable), with streaming replies and photo input
- Claude tools: log, correct or delete food; log workouts and weigh-ins; update the profile; set targets; fetch history for summaries
- Profile with body measurements, activity, weight and fitness goals, and food preferences and restrictions
- Automatic daily targets (Mifflin-St Jeor, goal-date-based deficit with safety limits) with manual override
- Daily food log with macro progress, day navigation and manual add
- Workout log with exercises, and a weekly count against the goal
- Weekly weigh-ins with circumferences, a trend chart, goal progress and a due reminder
- Installable PWA with offline app shell, local-only storage, and JSON backup/restore
- GitHub Pages deployment via GitHub Actions
