# Architecture

Fit Coach is a static single-page app with no backend. The phone's browser runs the UI, stores all the data, and calls the Claude API directly.

```
┌──────────────── phone browser (PWA) ────────────────┐
│  React screens ──► store.ts (localStorage) ◄──┐     │
│       │                                       │     │
│  ChatScreen ──► claude.ts ── tool loop ──► tools.ts │
│                    │  ▲                             │
└────────────────────┼──┼─────────────────────────────┘
                     ▼  │  streaming (SSE)
              api.anthropic.com /v1/messages
```

## Source layout

| Path | Role |
|---|---|
| `src/lib/types.ts` | Data model: `Profile`, `FoodEntry`, `Workout`, `WeighIn`, `ChatMessage`, `Settings` |
| `src/lib/store.ts` | Single in-memory store persisted to `localStorage` (`fit-coach-data-v1`), exposed to React through `useSyncExternalStore`. It also handles backup export/import. |
| `src/lib/nutrition.ts` | Date helpers, BMR/TDEE, target calculation, and totals |
| `src/lib/prompt.ts` | The stable system prompt and the per-request `<app_state>` snapshot |
| `src/lib/tools.ts` | Tool definitions sent to Claude, zod validation, and the executors that write to the store |
| `src/lib/claude.ts` | SDK client, history windowing, the streaming tool-use loop, and error messages |
| `src/lib/models.ts` | The model picker list |
| `src/lib/media.ts` | Image downscaling (max 1568 px, JPEG) and safe markdown rendering |
| `src/screens/*` | Chat, Today (daily log), Workouts, Weight, and Profile/settings |
| `public/sw.js` | Service worker: network-first for pages and cache-first for hashed assets. API calls are never cached. |

## Data model

All records carry an ISO local date (`YYYY-MM-DD`). Food entries hold a list of items, each with its own nutrition values, so per-meal and per-day totals are always computed from the items rather than stored.
The first time the profile is saved, the profile weight and measurements become the first weigh-in, which gives progress tracking a starting point.

## Claude integration

### Request shape

- **SDK:** `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`. The user's key lives on their own device; there is no shared secret to leak. The SDK is loaded lazily on the first message.
- **Endpoint:** `client.beta.messages.stream(...)`, with streaming so text appears as it's generated.
- **Model settings** (`requestOptions` in `claude.ts`):
  - `claude-opus-5` (default): adaptive thinking (on by default), `effort: medium`, plus the server-side refusal fallback (`fallbacks: "default"` with beta `server-side-fallback-2026-07-01`).
  - `claude-sonnet-5`: `thinking: {type: "adaptive"}` and `effort: medium`.
  - `claude-haiku-4-5`: no thinking or effort parameters.
- `max_tokens: 32000`.

### Prompt and caching design

The system prompt (`SYSTEM_PROMPT`) never changes, so it is cached along with the tool definitions (breakpoint 1).
Anything that changes — today's log with entry ids, targets, the last 7 days, and weigh-ins — goes into an `<app_state>` text block **appended to the latest user turn only**. It is never stored in history.

The current turn is laid out as `[user text ⟵ breakpoint 2] [images…] [app_state]`.
Earlier turns are replayed as `[user text] ([N images attached] note)`, so each earlier turn's first block is byte-identical to how it was originally sent. That means the next request reads everything up to the previous user text from cache.

History is replayed as plain text: earlier tool calls aren't resent, because their effects are already in `<app_state>`. The window keeps the last 30–60 messages and moves in steps of 30, so the cached prefix stays stable between steps.

### Tool loop

`sendToCoach` runs a manual streaming loop of up to 8 rounds:

1. Stream a response and show text deltas.
2. `finalMessage()` → check `stop_reason`:
   - `refusal` → stop.
   - `pause_turn` → resend.
   - `max_tokens` with a pending tool call → error, so a truncated input is never run.
3. Validate each `tool_use` input with zod (tools use `eager_input_streaming`, so the server doesn't validate them), run it against the store, and return all `tool_result`s in one user message. Failures come back as `is_error`.
4. Each successful tool call adds a chip under the reply (e.g. "✓ נרשם: ארוחת בוקר · 364 קק״ל").

After a mid-output fallback, blocks that come before the last `fallback` marker (other than text) are removed before the turn is echoed back.

### Tools

| Tool | Purpose |
|---|---|
| `log_food` | Log a meal, snack or drink with per-item values. Returns the day's totals vs targets. |
| `update_food_entry` / `delete_food_entry` | Corrections, using ids from `<app_state>` |
| `log_workout` | Type, duration, intensity, kcal, and exercises |
| `log_weigh_in` | Weight plus optional circumferences and body-fat % |
| `update_profile` | New goals, preferences or schedule shared in chat |
| `set_targets` | Custom daily targets (or reset to the computed ones) |
| `get_history` | Per-day totals, workouts and weigh-ins for a date range, used for weekly summaries |

## Target calculation (`computeTargets`)

- **BMR** (Mifflin-St Jeor): `10·kg + 6.25·cm − 5·age + (5 for men, −161 for women)`
- **TDEE** = BMR × activity factor (1.2 / 1.375 / 1.55 / 1.725 / 1.9)
- **Daily delta** = `(target kg − current kg) × 7700 / days until target date`, limited to −25% of TDEE (loss) or +12% (gain). Calories never go below `max(BMR, 1200 for women / 1500 for men)`. If a limit is applied, the profile screen shows a warning.
- **Protein:** 1.9 g/kg when losing, 1.8 when gaining, 1.6 when maintaining. **Fat:** ~27% of calories (at least 0.7 g/kg). **Carbs:** whatever is left.
- The current weight is the latest weigh-in, so targets update as weight changes. Manual `customTargets` override the calculation.

## Security and privacy

- The API key is stored in `localStorage` and is left out of backup exports.
- Claude's markdown is sanitized with DOMPurify before it's rendered.
- No analytics and no backend. Google Fonts (Heebo) is the only third-party request apart from the Anthropic API.
- Tool input from the model is treated as untrusted and validated before it's written.
