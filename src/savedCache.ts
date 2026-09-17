/** Private browser cache. IDB transactions fence logout, deletion and late writes across tabs. */
type Entry<T> = { account: string; scope: string; saved: number; data: T };
type Barrier = { epoch: number; purge: string };
let opening: Promise<IDBDatabase | null> | undefined;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('rexy-saved-v1') : null;
const listeners = new Set<(account: string) => void>();
channel?.addEventListener('message', e => listeners.forEach(fn => fn(e.data)));
export function onCacheClear(fn: (account: string) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function notify(account: string) { channel?.postMessage(account); listeners.forEach(fn => fn(account)); }
function database() {
  if (!opening) opening = new Promise(resolve => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const req = indexedDB.open('rexy-saved-v1', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('entries', { keyPath: ['account', 'scope'] }).createIndex('account', 'account');
      req.result.createObjectStore('barriers');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return opening;
}
export async function readSaved<T>(account: string, scope: string): Promise<{ data: T | null; epoch: number }> {
  const db = await database();
  if (!db) return { data: null, epoch: 0 };
  return new Promise(resolve => {
    const tx = db.transaction(['entries','barriers'], 'readonly');
    let data: T | null = null, epoch = 0;
    const row = tx.objectStore('entries').get([account, scope]);
    row.onsuccess = () => { const e = row.result as Entry<T> | undefined; if (e && Date.now()-e.saved < 86_400_000) data = e.data; };
    const b = tx.objectStore('barriers').get(account);
    b.onsuccess = () => { epoch = b.result?.epoch ?? 0; };
    tx.oncomplete = () => resolve({ data, epoch });
    tx.onerror = () => resolve({ data: null, epoch: 0 });
  });
}
function clearEntries(tx: IDBTransaction, account: string, done?: () => void) {
  const cursor = tx.objectStore('entries').index('account').openCursor(IDBKeyRange.only(account));
  cursor.onsuccess = () => { if (cursor.result) { cursor.result.delete(); cursor.result.continue(); } else done?.(); };
}
export async function writeSaved<T extends { purge: string }>(account: string, scope: string, epoch: number, data: T) {
  const db = await database();
  if (!db) return true; // Storage unavailable: still serve fresh, never persist.
  return new Promise<boolean>(resolve => {
    const tx = db.transaction(['entries','barriers'], 'readwrite');
    let accepted = false, cleared = false;
    const req = tx.objectStore('barriers').get(account);
    req.onsuccess = () => {
      const b: Barrier = req.result ?? { epoch: 0, purge: '0' };
      if (b.epoch !== epoch || BigInt(data.purge) < BigInt(b.purge)) return;
      cleared = BigInt(data.purge) > BigInt(b.purge);
      b.purge = data.purge;
      tx.objectStore('barriers').put(b, account);
      // Enqueue after deletions, otherwise the cursor would remove this entry.
      const put = () => tx.objectStore('entries').put({ account, scope, saved: Date.now(), data });
      if (cleared) clearEntries(tx, account, put); else put();
      accepted = true;
    };
    tx.oncomplete = () => { if (cleared) notify(account); resolve(accepted); };
    tx.onerror = () => resolve(accepted);
    tx.onabort = () => resolve(accepted);
  });
}
export async function clearSaved(account: string) {
  const db = await database();
  if (!db) { notify(account); return; }
  await new Promise<void>(resolve => {
    const tx = db.transaction(['entries','barriers'], 'readwrite');
    const req = tx.objectStore('barriers').get(account);
    req.onsuccess = () => tx.objectStore('barriers').put({ epoch: (req.result?.epoch ?? 0) + 1, purge: req.result?.purge ?? '0' }, account);
    clearEntries(tx, account);
    tx.oncomplete = () => resolve(); tx.onerror = () => resolve();
  });
  notify(account);
}
