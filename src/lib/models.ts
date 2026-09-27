export interface ModelOption {
  id: string;
  label: string;
  note: string;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

/** Gemini models with a free tier in the Gemini API. */
export const GEMINI_MODELS: ModelOption[] = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: 'מומלץ · הכי חכם בחינם' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', note: 'מהיר, מכסה חינמית גדולה יותר' },
];

export const MODELS: ModelOption[] = [
  { id: 'claude-opus-5', label: 'Claude Opus 5', note: 'הכי מדויק · $5 / $25 למיליון טוקנים' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', note: 'מאוזן · $2 / $10 למיליון טוקנים' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', note: 'מהיר וזול · $1 / $5 למיליון טוקנים' },
];
