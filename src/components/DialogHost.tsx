import { useState } from 'react';
import { closeDialog, useDialog, type DialogRequest } from '../lib/dialog';

/** Renders the pending in-app confirm / prompt / notice. */
export default function DialogHost() {
  const req = useDialog();
  if (!req) return null;
  // Keyed so a new question starts with a fresh input.
  return <Dialog key={`${req.kind}:${req.message}`} req={req} />;
}

function Dialog({ req }: { req: DialogRequest }) {
  const [value, setValue] = useState(req.defaultValue ?? '');
  const cancel = () => closeDialog(req.kind === 'prompt' ? null : false);
  const ok = () => closeDialog(req.kind === 'prompt' ? value : true);

  return (
    <div className="sheet-backdrop center" onClick={cancel}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          ok();
        }}
      >
        <p className="dialog-message">{req.message}</p>
        {req.kind === 'prompt' && (
          <input id="dialog-input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        )}
        <div className="row dialog-actions">
          <button type="submit" className={req.danger ? 'btn danger-btn' : 'btn primary'} autoFocus={req.kind !== 'prompt'}>
            {req.kind === 'notice' ? 'אישור' : (req.confirmLabel ?? 'אישור')}
          </button>
          {req.kind !== 'notice' && (
            <button type="button" className="btn" onClick={cancel}>ביטול</button>
          )}
        </div>
      </form>
    </div>
  );
}
