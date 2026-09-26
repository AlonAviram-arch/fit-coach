import { useEffect, useState } from 'react';
import { getSample, inClaudeViewer } from './runtime';

/**
 * Which way the coach reaches Claude:
 * - 'subscription': inside claude.ai — the user's own Claude plan, no API key
 * - 'api':          anywhere else, with the user's API key
 * - 'none':         neither is available (show setup help)
 * - 'checking':     inside claude.ai, waiting for the viewer to answer
 */
export type Backend = 'checking' | 'subscription' | 'api' | 'none';

let subscriptionReady: boolean | null = inClaudeViewer ? null : false;
const listeners = new Set<() => void>();
if (inClaudeViewer) {
  getSample().then((s) => {
    subscriptionReady = !!s;
    listeners.forEach((l) => l());
  });
}

export function useBackend(apiKey: string): Backend {
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
  return apiKey ? 'api' : 'none';
}
