import { assistantReplayText, imagesNote, type ImageInput, type SendCallbacks, usableHistory } from './coachShared';
import { buildAppState, SYSTEM_PROMPT } from './prompt';
import { getSample, type SampleError, type SampleTool } from './runtime';
import { getData } from './store';
import { runTool, TOOLS } from './tools';
import type { ChatMessage } from './types';

/**
 * Coach backend for the claude.ai artifact: Claude is reached through the
 * viewer's `sample` capability, so usage counts against the user's own Claude
 * plan (e.g. Pro), with no API key. The same tools run as page functions.
 */

// Most important first, in case the viewer allows fewer tools than we have.
const TOOL_PRIORITY = [
  'log_food', 'update_food_entry', 'suggest_meal', 'log_workout', 'log_weigh_in', 'log_favorite',
  'log_daily_metrics', 'delete_food_entry', 'save_favorite', 'get_history', 'set_targets', 'update_profile', 'delete_favorite',
];

// Stay under the 64 KiB input cap with room to spare.
const MAX_INPUT_BYTES = 58_000;

const FRAMING =
  '\n\n# About this conversation\nThe messages that follow are the chat history the app keeps, oldest first. ' +
  'The latest user message ends with the current <app_state>. Use the page tools to record anything; ' +
  'the app shows their results to the user.';

function bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

function base64ToBlob(img: ImageInput): Blob {
  const bin = atob(img.base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: img.mediaType });
}

type Turn = { role: 'user' | 'assistant'; content: string };

/** Instructions turn + as much recent history as fits + the new message. */
function buildTurns(userText: string, imageCount: number, prior: ChatMessage[]): Turn[] {
  const instructions: Turn = { role: 'user', content: SYSTEM_PROMPT + FRAMING };
  const current: Turn = {
    role: 'user',
    content: `${userText || imagesNote(imageCount)}${imageCount && userText ? `\n${imagesNote(imageCount)}` : ''}\n\n${buildAppState(getData())}`,
  };

  const history: Turn[] = usableHistory(prior)
    .slice(-40)
    .map((m) => ({
      role: m.role,
      content: m.role === 'assistant' ? assistantReplayText(m) : `${m.text}${m.images ? `\n${imagesNote(m.images)}` : ''}`,
    }))
    .filter((t) => t.content.trim());

  let budget = MAX_INPUT_BYTES - bytes(instructions.content) - bytes(current.content);
  const kept: Turn[] = [];
  for (let i = history.length - 1; i >= 0 && budget > 0; i--) {
    budget -= bytes(history[i].content);
    if (budget > 0) kept.unshift(history[i]);
  }
  return [instructions, ...kept, current];
}

const ERROR_TEXT: Record<string, string> = {
  not_granted: 'לא אושר לאפליקציה להשתמש ב-Claude. כדי לאשר, טענו את הדף מחדש ושלחו הודעה.',
  sampling_disabled: 'Claude לא זמין בחשבון הזה.',
  rate_limited: 'הגעת למגבלת השימוש של Claude כרגע. נסו שוב בעוד כמה דקות.',
  session_expired: 'צריך להתחבר מחדש ל-claude.ai.',
  image_rejected: 'התמונה לא התקבלה. נסו תמונה אחרת.',
  images_unavailable: 'אי אפשר לשלוח תמונות מהתצוגה הזו. אפשר לתאר במילים.',
  prompt_too_large: 'ההודעה ארוכה מדי. נסו לקצר.',
  refused: 'Claude לא יכול לעזור בבקשה הזו. נסו לנסח אחרת.',
  empty_completion: 'לא התקבלה תשובה. נסו לנסח אחרת.',
  upstream_error: 'תקלה זמנית בחיבור ל-Claude. נסו שוב.',
};

export function subscriptionErrorText(err: unknown): string {
  const e = err as SampleError;
  if (e && typeof e.code === 'string') return ERROR_TEXT[e.code] ?? ERROR_TEXT.upstream_error;
  return err instanceof Error ? err.message : String(err);
}

export async function sendViaSubscription(
  userText: string,
  images: ImageInput[],
  priorChat: ChatMessage[],
  cb: SendCallbacks,
  signal?: AbortSignal,
): Promise<string> {
  const sample = await getSample();
  if (!sample) throw new Error('החיבור ל-Claude דרך claude.ai לא זמין בתצוגה הזו.');

  const limits = await sample.limits().catch(() => null);
  const maxTools = limits?.tools?.maxCount ?? 0;
  const byName = new Map(TOOLS.map((t) => [t.name, t]));
  const tools: SampleTool[] = TOOL_PRIORITY.slice(0, maxTools)
    .map((name) => byName.get(name))
    .filter((t) => !!t)
    .map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.input_schema as SampleTool['inputSchema'],
      execute: (input: Record<string, unknown>) => {
        const outcome = runTool(t.name, input);
        if (outcome.suggestion) cb.onSuggestion(outcome.suggestion);
        if (outcome.chip) cb.onAction(outcome.chip);
        if (outcome.isError) {
          cb.onAction({ ok: false, label: `פעולה נכשלה: ${t.name}` });
          throw new Error(outcome.content);
        }
        return outcome.content;
      },
    }));

  const sendImages = limits?.images && images.length ? images.slice(0, limits.images.maxCount).map(base64ToBlob) : undefined;
  const turns = buildTurns(userText, images.length, priorChat);

  try {
    const result = await sample(turns, {
      onText: ({ text }) => cb.onText(text),
      signal,
      modelTier: getData().settings.tier ?? 'default',
      ...(tools.length ? { tools } : { cache: false }),
      ...(sendImages ? { images: sendImages } : {}),
    });
    const note = [
      result.truncated ? '_(התשובה נקטעה. אפשר לבקש את ההמשך.)_' : '',
      !tools.length ? '_(רישום אוטומטי לא זמין בתצוגה הזו. אפשר להוסיף ידנית ביומן.)_' : '',
    ].filter(Boolean).join('\n');
    return note ? `${result.text}\n\n${note}` : result.text;
  } catch (err) {
    const e = err as SampleError;
    // Keep whatever text already streamed, followed by the error.
    if (e?.code && e.text) return `${e.text}\n\n_${subscriptionErrorText(e)}_`;
    throw err;
  }
}
