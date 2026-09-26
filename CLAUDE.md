# CLAUDE.md

Hebrew RTL chat-first app for diet and training tracking. React 19 + TS + Vite, no backend. One build (relative `base: './'`) runs on GitHub Pages (API key) and as a claude.ai artifact (user's Claude subscription via `sample`, data in the artifact `db`).

- `npm run dev` / `npm run build` (runs `tsc -b`) / `npm run lint` (oxlint) / `npm run build:artifact` (artifact page + file map)
- Read docs/ARCHITECTURE.md before changing `src/lib/claude.ts`, `prompt.ts` or `tools.ts`.

Conventions:
- All UI text is Hebrew. Layout is `dir="rtl"`, so use logical CSS properties (`inset-inline-*`, `padding-inline-*`, `text-align: start`).
- Colors come from the CSS tokens on `:root` in `src/index.css`, with a dark-mode block.
- Keep `SYSTEM_PROMPT` byte-stable. Per-request data belongs in `buildAppState()`, not the system prompt, so the cache keeps working.
- Every new tool needs a JSON schema in `TOOLS`, a zod schema in `schemas`, and a `case` in `runTool`. Validate input before writing to the store.
- Dates are local `YYYY-MM-DD` strings. Use the helpers in `nutrition.ts`, never `toISOString()` (it converts to UTC).
- Data shape changes must stay compatible with existing `localStorage` data (`fit-coach-data-v1`) and with backup import.
- Never use `confirm`/`prompt`/`alert` or download links: the claude.ai viewer blocks them. Use `ask`/`confirmThen` from `src/lib/dialog.ts`.
- Anything that touches Claude must work in both backends (`claude.ts` and `subscription.ts`); tools live once in `tools.ts`.
