import { useEffect, useRef, useState } from 'react';
import type { Tab } from '../App';
import MacroBars from '../components/MacroBars';
import type { ImageInput } from '../lib/claude';
import { fileToImage, renderMarkdown } from '../lib/media';
import { activeTargets, entriesForDate, sumEntries, today } from '../lib/nutrition';
import { addChatMessage, clearChat, getData, updateChatMessage, useData } from '../lib/store';
import type { ActionChip } from '../lib/types';

const QUICK_PROMPTS = ['מה נשאר לי להיום?', 'מה לאכול לארוחת ערב?', 'סיימתי להיום', 'סיכום שבועי'];

type PendingImage = ImageInput & { previewUrl: string };

export default function ChatScreen({ goTo }: { goTo: (t: Tab) => void }) {
  const data = useData();
  const [text, setText] = useState('');
  const [images, setImages] = useState<PendingImage[]>([]);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const totals = sumEntries(entriesForDate(data, today()));
  const targets = activeTargets(data);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [data.chat]);

  async function onPickFiles(files: FileList | null) {
    if (!files) return;
    const picked = await Promise.all(Array.from(files).slice(0, 4).map(fileToImage));
    setImages((prev) => [...prev, ...picked].slice(0, 4));
  }

  async function send(messageText: string) {
    const trimmed = messageText.trim();
    if ((!trimmed && !images.length) || busy) return;
    const prior = getData().chat;
    const sentImages = images;
    setText('');
    setImages([]);
    setBusy(true);

    addChatMessage({ role: 'user', text: trimmed, images: sentImages.length || undefined });
    const reply = addChatMessage({ role: 'assistant', text: '' });
    const actions: ActionChip[] = [];

    // The SDK is loaded on first send to keep the initial bundle small.
    const claude = import('../lib/claude');
    try {
      const { sendToCoach } = await claude;
      const finalText = await sendToCoach(trimmed, sentImages, prior, {
        onText: (t) => updateChatMessage(reply.id, { text: t }),
        onAction: (chip) => {
          actions.push(chip);
          updateChatMessage(reply.id, { actions: [...actions] });
        },
      });
      updateChatMessage(reply.id, { text: finalText || (actions.length ? 'רשמתי ✔️' : '') });
    } catch (err) {
      const text = await claude.then((c) => c.friendlyError(err), () => 'אין חיבור לאינטרנט.');
      updateChatMessage(reply.id, { text, error: true });
    } finally {
      setBusy(false);
    }
  }

  const missingKey = !data.settings.apiKey;
  const missingProfile = !data.profile;

  return (
    <div className="chat">
      <header className="chat-header">
        <div className="chat-title">
          <h1>המאמנת 🥗</h1>
          {data.chat.length > 0 && (
            <button className="link" onClick={() => confirm('למחוק את היסטוריית הצ׳אט? (היומן נשמר)') && clearChat()}>
              ניקוי שיחה
            </button>
          )}
        </div>
        <MacroBars totals={totals} targets={targets} compact />
      </header>

      <div className="messages" ref={listRef}>
        {(missingKey || missingProfile) && (
          <div className="banner">
            {missingProfile ? 'כדי שאוכל לחשב יעדים, מלאו קודם את הפרופיל.' : 'חסר מפתח API של Claude.'}{' '}
            <button className="link" onClick={() => goTo('profile')}>למסך הפרופיל ←</button>
          </div>
        )}
        {data.chat.length === 0 && !missingKey && (
          <div className="empty">
            <p>היי! אני המאמנת האישית שלך לתזונה ואימונים.</p>
            <p>ספרו לי מה אכלתם (אפשר גם לצלם צלחת או תווית), איזה אימון עשיתם, או כמה שקלתם — ואני ארשום, אחשב ואעדכן מול היעדים.</p>
          </div>
        )}
        {data.chat.map((m) => (
          <div key={m.id} className={`msg ${m.role}${m.error ? ' error' : ''}`}>
            {m.images ? <div className="msg-images">📷 {m.images} תמונות</div> : null}
            {m.role === 'assistant' ? (
              m.text ? (
                <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />
              ) : (
                <div className="typing"><span /><span /><span /></div>
              )
            ) : (
              <div className="plain">{m.text}</div>
            )}
            {m.actions?.length ? (
              <div className="chips">
                {m.actions.map((a, i) => (
                  <span key={i} className={a.ok ? 'chip' : 'chip bad'}>{a.ok ? '✓' : '✗'} {a.label}</span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="composer">
        {!busy && data.chat.length > 0 && (
          <div className="quick">
            {QUICK_PROMPTS.map((q) => (
              <button key={q} className="quick-btn" onClick={() => send(q)} disabled={missingKey}>{q}</button>
            ))}
          </div>
        )}
        {images.length > 0 && (
          <div className="previews">
            {images.map((img, i) => (
              <div key={i} className="preview">
                <img src={img.previewUrl} alt="" />
                <button onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label="הסרה">×</button>
              </div>
            ))}
          </div>
        )}
        <form
          className="composer-row"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="צירוף תמונה" disabled={busy}>
            📷
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onPickFiles(e.target.files); e.target.value = ''; }} />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="מה אכלת / איך היה האימון?"
            rows={1}
            dir="auto"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
                e.preventDefault();
                send(text);
              }
            }}
          />
          <button type="submit" className="send-btn" disabled={busy || missingKey || (!text.trim() && !images.length)} aria-label="שליחה">
            {busy ? '…' : '➤'}
          </button>
        </form>
      </div>
    </div>
  );
}
