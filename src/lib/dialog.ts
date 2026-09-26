import { useSyncExternalStore } from 'react';

/**
 * In-app replacements for confirm() / prompt() / alert(). The claude.ai
 * artifact viewer never shows native dialogs (confirm returns false, prompt
 * returns null), so every question is rendered by <DialogHost />.
 */

export interface DialogRequest {
  kind: 'confirm' | 'prompt' | 'notice';
  message: string;
  defaultValue?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (value: boolean | string | null) => void;
}

let current: DialogRequest | null = null;
const listeners = new Set<() => void>();

function open(req: Omit<DialogRequest, 'resolve'>): Promise<boolean | string | null> {
  current?.resolve(null); // a new question dismisses an unanswered one
  return new Promise((resolve) => {
    current = { ...req, resolve };
    listeners.forEach((l) => l());
  });
}

export function closeDialog(value: boolean | string | null) {
  const req = current;
  current = null;
  listeners.forEach((l) => l());
  req?.resolve(value);
}

export function useDialog(): DialogRequest | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export const ask = {
  confirm: (message: string, opts: { confirmLabel?: string; danger?: boolean } = {}) =>
    open({ kind: 'confirm', message, ...opts }).then((v) => v === true),
  prompt: (message: string, defaultValue = '') =>
    open({ kind: 'prompt', message, defaultValue }).then((v) => (typeof v === 'string' ? v : null)),
  notice: (message: string) => open({ kind: 'notice', message }).then(() => undefined),
};

/** Runs `action` only if the user confirms a destructive step. */
export function confirmThen(message: string, action: () => void, confirmLabel = 'מחיקה') {
  ask.confirm(message, { confirmLabel, danger: true }).then((ok) => ok && action());
}
