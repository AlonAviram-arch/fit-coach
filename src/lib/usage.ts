import { useSyncExternalStore } from 'react';
import { today } from './nutrition';

/**
 * Local record of Claude API token usage (from each response's `usage`), per
 * day, so the user can see what the coach costs and whether caching works.
 * Kept separate from the app data: it is device-local and never synced.
 */

const KEY = 'fit-coach-usage-v1';
const KEEP_DAYS = 31;

// USD per million tokens (platform.claude.com/docs/en/about-claude/pricing, checked 2026-09-27).
// Cache writes (5-minute) are 1.25x input, cache reads 0.1x input.
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

export interface DayUsage {
  requests: number;
  input: number; // uncached input tokens
  cacheWrite: number;
  cacheRead: number;
  output: number; // includes thinking tokens
  costUsd: number;
}

type UsageLog = Record<string, DayUsage>;

function load(): UsageLog {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as UsageLog;
  } catch {
    return {};
  }
}

let log: UsageLog = load();
const listeners = new Set<() => void>();

export interface ApiUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Adds one response's usage to today's totals. */
export function recordUsage(model: string, u: ApiUsage) {
  const price = PRICES[model] ?? PRICES['claude-opus-5'];
  const write = u.cache_creation_input_tokens ?? 0;
  const read = u.cache_read_input_tokens ?? 0;
  const cost =
    (u.input_tokens * price.input + write * price.input * 1.25 + read * price.input * 0.1 + u.output_tokens * price.output) / 1e6;

  const date = today();
  const d = log[date] ?? { requests: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, costUsd: 0 };
  const next: UsageLog = {
    ...log,
    [date]: {
      requests: d.requests + 1,
      input: d.input + u.input_tokens,
      cacheWrite: d.cacheWrite + write,
      cacheRead: d.cacheRead + read,
      output: d.output + u.output_tokens,
      costUsd: d.costUsd + cost,
    },
  };
  // Keep the last month only.
  const days = Object.keys(next).sort();
  for (const old of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) delete next[old];
  log = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((l) => l());
}

export function useUsageLog(): UsageLog {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => log,
  );
}

/** Share of input tokens served from cache (0-1). */
export function cacheHitRate(d: DayUsage): number {
  const total = d.input + d.cacheWrite + d.cacheRead;
  return total ? d.cacheRead / total : 0;
}

export function sumDays(entries: DayUsage[]): DayUsage {
  return entries.reduce(
    (a, d) => ({
      requests: a.requests + d.requests,
      input: a.input + d.input,
      cacheWrite: a.cacheWrite + d.cacheWrite,
      cacheRead: a.cacheRead + d.cacheRead,
      output: a.output + d.output,
      costUsd: a.costUsd + d.costUsd,
    }),
    { requests: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, costUsd: 0 },
  );
}
