# Claude token-cost review (2026-09-27)

A review of how the app spends Claude tokens, following Anthropic's cost-optimization method: free wins first (caching, input hygiene, measurement), then trade-offs only with the user's consent.

## Scope, quality bar, baseline

- **Scope:** every Claude call in the app. Three traffic classes, all interactive (a user waits on each reply):
  1. **Claude API** (`src/lib/claude.ts`): the user's API key, first-party Claude API; default model Claude Opus 5 at `effort: medium`.
  2. **claude.ai subscription** (`src/lib/subscription.ts`): the viewer's `sample` capability, billed to the user's plan limits. The page can't control caching or effort there, only input size and tool rounds.
  3. **Gemini** (`src/lib/gemini.ts`): not Claude. It shares the history-window change only.
- **Quality bar:** there's no eval for the coach's answers. So only free wins were applied. The one quality trade-off (effort) was added as a user setting and left at its previous default.
- **Baseline:** there's no usage history (the app didn't log `usage`) and no API key in the dev environment. All numbers below are **code estimates**, from request bodies captured in a browser test with a realistic data set: one week of logs, 8 favorites, 52 chat messages. Token counts are approximate (Hebrew costs about 1 token per 1.6 characters).

## Token profile (before)

One food-logging message is usually **2 requests**: a tool call (`log_food`), then the reply.

| Part of each request | ~Tokens | Share |
|---|---:|---:|
| Chat history (52 messages) | 6,950 | 58% |
| Tool schemas (13) | 2,250 | 19% |
| System prompt | 1,670 | 14% |
| `<app_state>` (favorites ≈ 45% of it) | 1,070 | 9% |
| **Total** | **~12,000** | |

A photo adds about 2,450 tokens at 1568 px, re-sent on every tool round.

**Usage shape:** meals are hours apart, so the 5-minute cache is cold at almost every new message. The whole prefix (system, tools, history) is re-written at the 1.25x write price, then read at 0.1x only by the same message's second round.

## Changes, ranked by estimated savings (not application order)

| Lever | Type | Estimated effect | Data |
|---|---|---|---|
| Replay 12–24 chat messages instead of 30–60 | free win (input hygiene) | Largest: about 40% less input per request | code estimate |
| Automatic caching on the tool-loop tail | free win (caching) | Medium: round 2 reads the images, `<app_state>` and round 1 from cache instead of paying full price | code estimate |
| Photos at 1280 px instead of 1568 px | free win (input hygiene) | Medium on photo messages: about 2,450 → 1,640 tokens per photo per round | code estimate |
| Compact favorites in `<app_state>` | free win (input hygiene) | Small: about 10 tokens per favorite, at most 10 favorites | code estimate |
| Usage logging and cost panel | measurement | Makes all of the above verifiable | — |
| Effort setting (low/medium/high) | trade-off, user-controlled | Output and thinking tokens; left at medium | needs an eval before changing the default |

**After (same data set):** about 7,000 tokens per request: tools 32%, history 30%, system 24%, `<app_state>` 14%. Rough input cost of a cold logging message (2 rounds, in input-token equivalents):

- **before** ≈ 13.6k (write) + 1.1k (app_state) + 1.1k (read) + 1.3k (uncached tail) ≈ **17k**
- **after** ≈ 8.8k (write, including the tail) + 0.7k (read) + 0.4k ≈ **10k**, **about 40% less**

With a photo, the image part falls from about 4.9k to about 2.2k equivalents. Output (thinking and the reply) is unchanged.

Verified in the browser harness: consecutive messages share a byte-identical prefix (tools, system, history, and the previous turn's breakpoint block), so warm follow-ups read from cache.

## Commits

1. `Cost: cache the tool-loop tail with automatic caching`
2. `Cost: replay 12-24 chat messages instead of 30-60 (all backends)`
3. `Cost: compact favorites in <app_state>`
4. `Cost: downscale photos to 1280 px instead of 1568 px`
5. `Cost: record Claude usage per day and add a thinking-depth setting`

## Update, 2026-10-01: photo size reverted

The "photos at 1280 px" change (commit 4) was reverted in v1.5.0. Reading nutrition labels correctly became an explicit requirement, and 1568 px keeps the small print legible. This costs about 800 more tokens per photo per round. The other changes stand. v1.5.0 also adds two small tools and a longer system prompt (the label rules and tone guidance), about 700 more tokens in the cached prefix, and up to 25 one-line saved products in `<app_state>`.

## Levers considered and skipped

- **1-hour cache TTL:** meals are usually more than an hour apart. The 2x write wouldn't be read back, and within a burst the 5-minute TTL is already refreshed.
- **Cache pre-warming:** there's no moment before traffic, so it would be a pure extra write.
- **Tool search / `defer_loading`:** the schemas are about 2k tokens, far under the ~10k point where it pays.
- **Context editing / compaction:** loops are 1–3 rounds, so there's nothing to compact.
- **Batch API:** every call has a user waiting.
- **Shorter replies:** the per-meal table is the behavior the user asked for (from the Gemini conversation). This is a product decision, not a free win.
- **Changing the default model:** Sonnet 5 and Haiku 4.5 are already selectable. Switching the default is a quality trade-off that would need an eval.
- **Prompt audit:** the system prompt is about 1.7k tokens, recent, and written for the current models.

## How to verify with real traffic

Open **Profile → חיבור ל-AI → Claude**. The usage panel shows requests, estimated cost and the share of input read from cache, for today and the last 7 days. Expect a low cache share on the first message of each meal (cold cache) and a high one on quick follow-ups and on the second round of each message. If follow-ups also show a low share, a change in how prompts are assembled has broken the prefix.

## Next step: trying lower effort

To decide whether `effort: low` is good enough for daily logging, try it for a few days and compare. Check the calorie estimates and suggestion quality yourself, and the cost in the usage panel. A small fixed set of about 20 real meal messages, replayed at low and medium, would make this measurable.
