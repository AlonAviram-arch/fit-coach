import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { initCloudSync } from './lib/cloud';
import { inClaudeViewer } from './lib/runtime';
import { requestPersistentStorage } from './lib/store';

requestPersistentStorage();
// The claude.ai page skeleton has no lang/dir of its own.
document.documentElement.lang = 'he';
document.documentElement.dir = 'rtl';
// claude.ai already pads the page for the phone's safe areas; don't pad twice.
if (inClaudeViewer) document.documentElement.classList.add('in-claude');

if ('serviceWorker' in navigator && import.meta.env.PROD && !inClaudeViewer) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}

const root = createRoot(document.getElementById('root')!);
const render = () =>
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

if (inClaudeViewer) {
  // Load the synced data first so the app opens on the right screen; never wait more than 8 s.
  root.render(<div className="splash">טוען…</div>);
  const timeout = new Promise((r) => setTimeout(r, 8000));
  Promise.race([initCloudSync(), timeout]).catch(() => {}).finally(render);
} else {
  render();
}
