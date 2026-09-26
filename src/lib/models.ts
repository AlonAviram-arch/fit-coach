export interface ModelOption {
  id: string;
  label: string;
  note: string;
}

export const MODELS: ModelOption[] = [
  { id: 'claude-opus-5', label: 'Claude Opus 5', note: 'הכי מדויק · $5 / $25 למיליון טוקנים' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', note: 'מאוזן · $2 / $10 למיליון טוקנים' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', note: 'מהיר וזול · $1 / $5 למיליון טוקנים' },
];
