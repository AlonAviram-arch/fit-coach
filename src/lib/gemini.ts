import { assistantReplayText, imagesNote, type ImageInput, type SendCallbacks, usableHistory } from './coachShared';
import { DEFAULT_GEMINI_MODEL } from './models';
import { buildAppState, SYSTEM_PROMPT } from './prompt';
import { getData } from './store';
import { runTool, TOOLS } from './tools';
import type { ChatMessage } from './types';

/**
 * Coach backend for Google Gemini (REST `streamGenerateContent`, SSE) with the
 * user's own Gemini API key; the free tier is enough for daily logging.
 * Uses the same system prompt, <app_state> and tools as the Claude backends.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_TOOL_ROUNDS = 8;

interface Part {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
  thoughtSignature?: string;
  thought?: boolean;
}

interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

interface StreamChunk {
  candidates?: { content?: Content; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code: number; message: string; status: string };
}

export class GeminiError extends Error {
  readonly status?: number;
  readonly reason?: string;

  constructor(message: string, status?: number, reason?: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

// Gemini accepts the tools' JSON schemas as they are (type/properties/items/enum/description/required).
const FUNCTION_DECLARATIONS = TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.input_schema }));

/** Past chat as Gemini contents: user/model turns, consecutive same-role turns merged. */
function historyContents(chat: ChatMessage[]): Content[] {
  const out: Content[] = [];
  for (const m of usableHistory(chat).slice(-40)) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const text = m.role === 'assistant' ? assistantReplayText(m) : `${m.text}${m.images ? `\n${imagesNote(m.images)}` : ''}`;
    if (!text.trim()) continue;
    const last = out[out.length - 1];
    if (last?.role === role) last.parts.push({ text });
    else out.push({ role, parts: [{ text }] });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

/** Streams one generateContent call; returns every part the model sent, in order. */
async function streamOnce(
  key: string,
  model: string,
  contents: Content[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<{ parts: Part[]; finishReason?: string }> {
  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `HTTP ${res.status}`;
    let reason: string | undefined;
    try {
      const body = (await res.json()) as StreamChunk | StreamChunk[];
      const err = Array.isArray(body) ? body[0]?.error : body.error;
      if (err) {
        message = err.message;
        reason = err.status;
      }
    } catch {
      /* not JSON */
    }
    throw new GeminiError(message, res.status, reason);
  }

  const parts: Part[] = [];
  let finishReason: string | undefined;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handle = (json: string) => {
    const chunk = JSON.parse(json) as StreamChunk;
    if (chunk.error) throw new GeminiError(chunk.error.message, chunk.error.code, chunk.error.status);
    if (chunk.promptFeedback?.blockReason) throw new GeminiError('blocked', 400, chunk.promptFeedback.blockReason);
    const cand = chunk.candidates?.[0];
    if (cand?.finishReason) finishReason = cand.finishReason;
    for (const p of cand?.content?.parts ?? []) {
      // Kept exactly as received (thought signatures must be sent back unchanged).
      parts.push(p);
      if (p.text && !p.thought) onDelta(p.text);
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const event = buffer.slice(0, sep);
      buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, '');
      const data = event
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('');
      if (data) handle(data);
    }
  }
  if (buffer.trim().startsWith('data:')) handle(buffer.trim().slice(5).trim());
  return { parts, finishReason };
}

export function geminiErrorText(err: unknown): string {
  if (err instanceof GeminiError) {
    if (err.status === 400 && /API key/i.test(err.message)) return 'מפתח ה-Gemini לא תקין. בדקו אותו במסך הפרופיל.';
    if (err.status === 403) return 'למפתח ה-Gemini אין הרשאה. ודאו שה-Gemini API מופעל בפרויקט של המפתח.';
    if (err.status === 404) return 'המודל שנבחר לא זמין. בחרו מודל אחר במסך הפרופיל.';
    if (err.status === 429) return 'הגעת למגבלת השימוש החינמית של Gemini כרגע. נסו שוב בעוד דקה (או מחר, אם זו המכסה היומית).';
    if (err.reason && /SAFETY|BLOCK|PROHIBITED/i.test(err.reason)) return 'Gemini חסם את הבקשה. נסו לנסח אחרת.';
    if (err.status && err.status >= 500) return 'Gemini לא זמין כרגע. נסו שוב עוד רגע.';
    return `שגיאה מ-Gemini: ${err.message}`;
  }
  if (err instanceof TypeError) return 'אין חיבור לאינטרנט או ש-Gemini לא נגיש.';
  return err instanceof Error ? err.message : String(err);
}

export async function sendViaGemini(
  userText: string,
  images: ImageInput[],
  priorChat: ChatMessage[],
  cb: SendCallbacks,
  signal?: AbortSignal,
): Promise<string> {
  const { settings } = getData();
  if (!settings.geminiKey) throw new Error('צריך להזין מפתח Gemini במסך הפרופיל.');
  const model = settings.geminiModel || DEFAULT_GEMINI_MODEL;

  const contents: Content[] = [
    ...historyContents(priorChat),
    {
      role: 'user',
      parts: [
        { text: userText || imagesNote(images.length) },
        ...images.map((img): Part => ({ inlineData: { mimeType: img.mediaType, data: img.base64 } })),
        { text: buildAppState(getData()) },
      ],
    },
  ];
  // The first turn must be the user's (history may have started with the coach).
  if (contents[0].role !== 'user') contents.shift();

  let shown = '';
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const prefix = shown ? shown + '\n\n' : '';
    let roundText = '';
    const { parts, finishReason } = await streamOnce(settings.geminiKey, model, contents, (d) => {
      roundText += d;
      cb.onText(prefix + roundText);
    }, signal);
    if (roundText.trim()) shown = prefix + roundText;

    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) {
      if (finishReason === 'MAX_TOKENS') shown += '\n\n_(התשובה נקטעה. אפשר לבקש את ההמשך.)_';
      if (!shown && finishReason && finishReason !== 'STOP') throw new GeminiError('blocked', 400, finishReason);
      return shown;
    }

    // Echo the model turn unchanged, then answer every call in one user turn.
    contents.push({ role: 'model', parts });
    const responses: Part[] = calls.map(({ functionCall }) => {
      const { name, args, id } = functionCall!;
      const outcome = runTool(name, args ?? {});
      if (outcome.suggestion) cb.onSuggestion(outcome.suggestion);
      if (outcome.chip) cb.onAction(outcome.chip);
      else if (outcome.isError) cb.onAction({ ok: false, label: `פעולה נכשלה: ${name}` });
      let result: unknown = outcome.content;
      try {
        result = JSON.parse(outcome.content);
      } catch {
        /* plain text result */
      }
      return {
        functionResponse: {
          name,
          ...(id ? { id } : {}),
          response: outcome.isError ? { error: result } : { result },
        },
      };
    });
    contents.push({ role: 'user', parts: responses });
  }
  return shown;
}
