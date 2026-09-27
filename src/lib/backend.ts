import { useEffect, useState } from 'react';
import { getSample, inClaudeViewer } from './runtime';
import type { Settings } from './types';

/**
 * Which way the coach reaches an AI:
 * - 'subscription': inside claude.ai — the user's own Claude plan, no API key
 * - 'api':          Claude with the user's API key
 * - 'gemini':       Google Gemini with the user's (free) Gemini API key
 * - 'none':         nothing configured yet (show setup help)
 * - 'checking':     inside claude.ai, waiting for the viewer to answer
 */
export type Backend = 'checking' | 'subscription' | 'api' | 'gemini' | 'none';

let subscriptionReady: boolean | null = inClaudeViewer ? null : false;
const listeners = new Set<() => void>();
if (inClaudeViewer) {
  getSample().then((s) => {
    subscriptionReady = !!s;
    listeners.forEach((l) => l());
  });
}

/** Backend for the standalone app, from the chosen provider and its key. */
export function standaloneBackend(settings: Settings): Backend {
  if (settings.provider === 'gemini') return settings.geminiKey ? 'gemini' : 'none';
  return settings.apiKey ? 'api' : 'none';
}

export function useBackend(settings: Settings): Backend {
  const [ready, setReady] = useState(subscriptionReady);
  useEffect(() => {
    const l = () => setReady(subscriptionReady);
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (ready === null) return 'checking';
  if (ready) return 'subscription';
  return standaloneBackend(settings);
}
