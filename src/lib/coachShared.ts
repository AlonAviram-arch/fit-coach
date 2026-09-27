import { roundTotals, sumItems } from './nutrition';
import type { ActionChip, ChatMessage, MealSuggestion } from './types';

/** Shared by both coach backends (API key and Claude subscription). */

export interface ImageInput {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  base64: string;
}

export interface SendCallbacks {
  onText: (fullText: string) => void;
  onAction: (chip: ActionChip) => void;
  onSuggestion: (suggestion: MealSuggestion) => void;
}

export function imagesNote(count: number): string {
  return `[צורפו ${count} תמונות]`;
}

/** Text stand-in for suggestion cards, so later turns know what was offered. */
export function suggestionsNote(suggestions: MealSuggestion[]): string {
  const list = suggestions.map((s) => {
    const t = roundTotals(sumItems(s.items));
    return `${s.title} (${t.calories} קק״ל, ${t.protein} ג׳ חלבון)`;
  });
  return `[כרטיסי הצעה שהוצגו: ${list.join('; ')}]`;
}

/** Chat messages worth replaying as context: no errors, nothing empty. */
export function usableHistory(chat: ChatMessage[]): ChatMessage[] {
  return chat.filter((m) => !m.error && (m.text.trim() || m.suggestions?.length || m.images));
}

const HISTORY_STEP = 12;

/**
 * The recent chat replayed to the model: between 12 and 24 messages. The day's
 * real data (entries, totals, last 7 days, favorites) reaches the model through
 * <app_state> on every turn, so older chat mostly repeats it and only costs
 * tokens. The window start moves in steps of 12, so consecutive requests share
 * a byte-identical prefix (prompt caching) until the next step.
 */
export function historyWindow(chat: ChatMessage[]): ChatMessage[] {
  const usable = usableHistory(chat);
  const start = Math.max(0, Math.floor((usable.length - HISTORY_STEP) / HISTORY_STEP) * HISTORY_STEP);
  return usable.slice(start);
}

/** A past user message as replayed text (image-only messages become the images note). */
export function userReplayText(m: ChatMessage): string {
  if (!m.images) return m.text;
  return m.text.trim() ? `${m.text}\n${imagesNote(m.images)}` : imagesNote(m.images);
}

/** Assistant text as replayed to Claude, with any suggestion cards noted. */
export function assistantReplayText(m: ChatMessage): string {
  return m.suggestions?.length ? `${m.text}\n\n${suggestionsNote(m.suggestions)}`.trim() : m.text;
}
