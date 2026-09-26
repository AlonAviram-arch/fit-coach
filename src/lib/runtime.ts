/**
 * Detects whether the app runs inside a claude.ai artifact viewer, and gives
 * typed access to the viewer capabilities it uses (`sample`, `db`, `user`).
 * The shapes below are the subset of the platform contract (runtime 0.2.60)
 * this app relies on.
 */

export type ModelTier = 'default' | 'complex' | 'quick';

export interface SampleTool {
  name: string;
  description: string;
  inputSchema?: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
  execute(input: Record<string, unknown>, context: { signal: AbortSignal }): unknown;
}

export interface SampleOptions {
  onText?: (u: { text: string; delta: string }) => void;
  signal?: AbortSignal;
  images?: Blob[];
  modelTier?: ModelTier;
  cache?: boolean;
  tools?: SampleTool[];
}

export interface SampleFn {
  (input: string | { role: 'user' | 'assistant'; content: string }[], options?: SampleOptions): Promise<{
    text: string;
    truncated: boolean;
    modelTierApplied: ModelTier;
  }>;
  limits(): Promise<{ maxPromptBytes: number; images?: { maxCount: number }; tools?: { maxCount: number } }>;
}

export interface SampleError {
  code: string;
  message: string;
  text?: string;
}

export interface DocSnapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface DocRef {
  get(): Promise<DocSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
  collection(path: string): CollectionRef;
}

export interface CollectionRef {
  doc(id: string): DocRef;
  get(): Promise<{ docs: (DocSnapshot & { id: string })[] }>;
}

export interface Db {
  doc(path: string): DocRef;
}

export interface UserCap {
  id(): Promise<string | null>;
}

interface ClaudeViewer {
  use(name: 'sample'): Promise<SampleFn | null>;
  use(name: 'db'): Promise<Db | null>;
  use(name: 'user'): Promise<UserCap | null>;
}

declare global {
  interface Window {
    claude?: ClaudeViewer;
  }
}

/** True when framed by a claude.ai viewer (window.claude exists before any page script runs). */
export const inClaudeViewer = typeof window !== 'undefined' && typeof window.claude?.use === 'function';

let samplePromise: Promise<SampleFn | null> | null = null;

/** The viewer's `sample` function, or null outside a viewer / where it cannot run. */
export function getSample(): Promise<SampleFn | null> {
  if (!inClaudeViewer) return Promise.resolve(null);
  samplePromise ??= window.claude!.use('sample').catch(() => null);
  return samplePromise;
}
