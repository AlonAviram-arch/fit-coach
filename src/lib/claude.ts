import Anthropic from '@anthropic-ai/sdk';
import { buildAppState, SYSTEM_PROMPT } from './prompt';
import { getData } from './store';
import { runTool, TOOLS } from './tools';
import type { ActionChip, ChatMessage } from './types';

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ContentBlockParam = Anthropic.Beta.BetaContentBlockParam;

export interface ImageInput {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  base64: string;
}

export interface SendCallbacks {
  onText: (fullText: string) => void;
  onAction: (chip: ActionChip) => void;
}

const MAX_TOOL_ROUNDS = 8;

function imagesNote(count: number): string {
  return `[צורפו ${count} תמונות]`;
}

/**
 * Past chat as API messages. Tool calls are not replayed: their effects are
 * already in the data, which the model sees through <app_state>.
 * The window moves in steps of 30 messages so the cached prefix stays stable
 * between steps.
 */
function historyMessages(chat: ChatMessage[]): MessageParam[] {
  const usable = chat.filter((m) => !m.error && m.text.trim());
  const start = Math.max(0, Math.floor((usable.length - 30) / 30) * 30);
  const msgs: MessageParam[] = [];
  for (const m of usable.slice(start)) {
    if (m.role === 'user') {
      const content: ContentBlockParam[] = [{ type: 'text', text: m.text }];
      if (m.images) content.push({ type: 'text', text: imagesNote(m.images) });
      msgs.push({ role: 'user', content });
    } else {
      msgs.push({ role: 'assistant', content: m.text });
    }
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}

function requestOptions(model: string) {
  if (model.startsWith('claude-haiku')) return {};
  if (model === 'claude-opus-5') {
    // Opus 5 thinks adaptively by default; server-side fallbacks re-run a
    // (rare) safety-classifier decline on the recommended fallback model.
    return {
      output_config: { effort: 'medium' as const },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default' as const,
    };
  }
  return { thinking: { type: 'adaptive' as const }, output_config: { effort: 'medium' as const } };
}

/**
 * After a mid-output fallback, blocks the declined model produced before the
 * last `fallback` marker (other than text) must not be echoed back.
 */
function echoableContent(content: Anthropic.Beta.BetaContentBlock[]): Anthropic.Beta.BetaContentBlock[] {
  const lastFallback = content.map((b) => b.type).lastIndexOf('fallback');
  if (lastFallback < 0) return content;
  return content.filter((b, i) => i > lastFallback || b.type === 'text');
}

export function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'מפתח ה-API לא תקין. בדקו אותו במסך ההגדרות.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'למפתח ה-API אין הרשאה למודל הזה.';
  if (err instanceof Anthropic.RateLimitError) return 'יותר מדי בקשות כרגע. נסו שוב בעוד דקה.';
  if (err instanceof Anthropic.BadRequestError) {
    if (/credit|balance/i.test(err.message)) return 'אין מספיק קרדיט בחשבון ה-API. אפשר להטעין ב-console.anthropic.com.';
    return `הבקשה נדחתה: ${err.message}`;
  }
  if (err instanceof Anthropic.InternalServerError) return 'השרת של Claude לא זמין כרגע. נסו שוב עוד רגע.';
  if (err instanceof Anthropic.APIConnectionError) return 'אין חיבור לאינטרנט או ש-Claude לא נגיש.';
  if (err instanceof Anthropic.APIError) return `שגיאה מ-Claude: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

/**
 * Sends the user's message to Claude, streams the reply, and runs tool calls
 * against the local store until Claude finishes. Returns the final reply text.
 */
export async function sendToCoach(
  userText: string,
  images: ImageInput[],
  priorChat: ChatMessage[],
  cb: SendCallbacks,
): Promise<string> {
  const { settings } = getData();
  if (!settings.apiKey) throw new Error('צריך להזין מפתח API של Claude במסך ההגדרות.');

  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });
  const model = settings.model;

  // Breakpoint on the user's own text: the same block is replayed verbatim in
  // later requests, so everything up to here is a cache hit next time.
  const currentTurn: ContentBlockParam[] = [
    { type: 'text', text: userText || imagesNote(images.length), cache_control: { type: 'ephemeral' } },
    ...images.map((img): ContentBlockParam => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    })),
    { type: 'text', text: buildAppState(getData()) },
  ];
  const messages: MessageParam[] = [...historyMessages(priorChat), { role: 'user', content: currentTurn }];

  let shown = '';
  let jsonRetries = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = client.beta.messages.stream({
      model,
      max_tokens: 32000,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages,
      ...requestOptions(model),
    });

    const prefix = shown ? shown + '\n\n' : '';
    let roundText = '';
    stream.on('text', (delta) => {
      roundText += delta;
      cb.onText(prefix + roundText);
    });

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Only an unparseable streamed tool input is retried; API errors surface.
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
      continue;
    }

    // Keep the text of the turn that was actually delivered.
    const finalText = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (finalText.trim()) shown = prefix + finalText;
    cb.onText(shown);

    if (message.stop_reason === 'refusal') {
      return shown || 'מצטערת, לא אוכל לעזור בבקשה הזו.';
    }
    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: echoableContent(message.content) });
      continue;
    }

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0) return shown;
    if (message.stop_reason === 'max_tokens') throw new Error('התשובה נקטעה באמצע. נסו לשלוח שוב.');

    messages.push({ role: 'assistant', content: echoableContent(message.content) });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((tu) => {
      const outcome = runTool(tu.name, tu.input);
      if (outcome.chip) cb.onAction(outcome.chip);
      else if (outcome.isError) cb.onAction({ ok: false, label: `פעולה נכשלה: ${tu.name}` });
      return { type: 'tool_result', tool_use_id: tu.id, content: outcome.content, is_error: outcome.isError || undefined };
    });
    messages.push({ role: 'user', content: results });
  }
  return shown;
}
