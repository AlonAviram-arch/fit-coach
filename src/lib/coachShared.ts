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
  return chat.filter((m) => !m.error && (m.text.trim() || m.suggestions?.length));
}

/** Assistant text as replayed to Claude, with any suggestion cards noted. */
export function assistantReplayText(m: ChatMessage): string {
  return m.suggestions?.length ? `${m.text}\n\n${suggestionsNote(m.suggestions)}`.trim() : m.text;
}
