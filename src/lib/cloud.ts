import { inClaudeViewer, type Db, type DocRef } from './runtime';
import { getData, hydrate, subscribe } from './store';
import type { AppData, ChatMessage, DailyMetric, FoodEntry } from './types';

/**
 * In the claude.ai artifact, data is kept in the artifact's database under the
 * viewer's private `data/users/<id>/` subtree (nobody else, the artifact owner
 * included, can read it) so it survives cleared browser storage and syncs
 * between devices. localStorage stays as a fast local cache.
 *
 * Layout (documents stay well under the 256 KiB cap):
 *   data/users/<id>/core               profile, settings, favorites, workouts, weigh-ins
 *   data/users/<id>/core/months/<ym>   food entries + daily metrics of one month
 *   data/users/<id>/core/chat/recent   the latest chat messages
 */

export type SyncState = 'local' | 'cloud';

const CHAT_MAX_BYTES = 180_000;
const FLUSH_DELAY_MS = 1200;

/** Plain JSON copy (drops undefined values the store may hold). */
function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function monthOf(date: string): string {
  return date.slice(0, 7);
}

function splitDocs(data: AppData): Map<string, Record<string, unknown>> {
  const docs = new Map<string, Record<string, unknown>>();
  docs.set('core', {
    version: data.version,
    profile: data.profile,
    // The API key never leaves the device.
    settings: { model: data.settings.model, tier: data.settings.tier ?? 'default' },
    favorites: data.favorites,
    workouts: data.workouts,
    weighIns: data.weighIns,
  });

  const months = new Map<string, { food: FoodEntry[]; metrics: DailyMetric[] }>();
  const bucket = (ym: string) => {
    if (!months.has(ym)) months.set(ym, { food: [], metrics: [] });
    return months.get(ym)!;
  };
  for (const f of data.food) bucket(monthOf(f.date)).food.push(f);
  for (const m of data.metrics) bucket(monthOf(m.date)).metrics.push(m);
  for (const [ym, body] of months) docs.set(`months/${ym}`, body);

  // Newest messages that fit.
  const chat: ChatMessage[] = [];
  let size = 0;
  for (let i = data.chat.length - 1; i >= 0; i--) {
    size += JSON.stringify(data.chat[i]).length * 2;
    if (size > CHAT_MAX_BYTES) break;
    chat.unshift(data.chat[i]);
  }
  docs.set('chat/recent', { messages: chat });

  for (const [k, v] of docs) docs.set(k, clean(v));
  return docs;
}

function refFor(core: DocRef, key: string): DocRef {
  if (key === 'core') return core;
  const [collection, id] = key.split('/');
  return core.collection(collection).doc(id);
}

async function readRemote(core: DocRef): Promise<AppData | null> {
  const [coreSnap, monthsSnap, chatSnap] = await Promise.all([
    core.get(),
    core.collection('months').get(),
    core.collection('chat').doc('recent').get(),
  ]);
  if (!coreSnap.exists) return null;
  const c = coreSnap.data() as Partial<AppData> & { settings?: { model?: string; tier?: AppData['settings']['tier'] } };
  const food: FoodEntry[] = [];
  const metrics: DailyMetric[] = [];
  for (const d of monthsSnap.docs) {
    const body = d.data() as { food?: FoodEntry[]; metrics?: DailyMetric[] } | undefined;
    food.push(...(body?.food ?? []));
    metrics.push(...(body?.metrics ?? []));
  }
  const local = getData();
  return {
    ...local,
    version: 1,
    profile: c.profile ?? null,
    favorites: c.favorites ?? [],
    workouts: c.workouts ?? [],
    weighIns: c.weighIns ?? [],
    food,
    metrics: metrics.sort((a, b) => a.date.localeCompare(b.date)),
    chat: ((chatSnap.data() as { messages?: ChatMessage[] } | undefined)?.messages ?? []),
    settings: { ...local.settings, model: c.settings?.model ?? local.settings.model, tier: c.settings?.tier ?? local.settings.tier },
  };
}

/**
 * Loads the user's data from the artifact database (or uploads the local data
 * the first time), then keeps it in sync on every change. Resolves 'local'
 * outside a claude.ai viewer or when the database is unavailable.
 */
export async function initCloudSync(): Promise<SyncState> {
  if (!inClaudeViewer) return 'local';
  const [db, user] = await Promise.all([window.claude!.use('db'), window.claude!.use('user')]).catch(() => [null, null] as const);
  const uid = user ? await user.id().catch(() => null) : null;
  if (!db || !uid) return 'local';

  const core = (db as Db).doc(`data/users/${uid}/core`);
  const written = new Map<string, string>();

  try {
    const remote = await readRemote(core);
    if (remote) hydrate(remote);
    // Remember what the server has, so only real changes are written back.
    if (remote) for (const [k, v] of splitDocs(getData())) written.set(k, JSON.stringify(v));
  } catch (err) {
    console.error('Cloud load failed; staying local', err);
    return 'local';
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushing = false;
  let again = false;

  async function flush() {
    if (flushing) { again = true; return; }
    flushing = true;
    try {
      // One write at a time per document, only for documents that changed.
      const docs = splitDocs(getData());
      // A month whose entries were all deleted is written back empty.
      for (const key of written.keys()) if (!docs.has(key)) docs.set(key, { food: [], metrics: [] });
      for (const [key, body] of docs) {
        const json = JSON.stringify(body);
        if (written.get(key) === json) continue;
        await refFor(core, key).set(body);
        written.set(key, json);
      }
    } catch (err) {
      console.error('Cloud save failed', err);
    } finally {
      flushing = false;
      if (again) { again = false; schedule(); }
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, FLUSH_DELAY_MS);
  }

  subscribe(schedule);
  // First run in the artifact with existing local data: upload it.
  if (!written.size && getData().profile) schedule();
  // Don't lose a pending write when the page is hidden or closed.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && timer) { clearTimeout(timer); flush(); }
  });
  return 'cloud';
}
