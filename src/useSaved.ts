import { useCallback, useEffect, useState } from 'react';
import { request } from './api';
import { clearSaved, onCacheClear, readSaved, writeSaved } from './savedCache';

/** Small saved pages load independently of activity. Model work is never a GET. */
export function useSaved<T extends { purge: string; updating?: boolean; state?: string }>(path: string | null, account: string, token: string) {
  const [entry, setEntry] = useState<{ key: string; data: T } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [cached, setCached] = useState(false);
  const key = account + path;
  const reload = useCallback(() => setRefresh(n => n + 1), []);
  useEffect(() => onCacheClear(owner => { if (owner === account) { setEntry(null); } }), [account]);
  useEffect(() => {
    if (!path || !account || !token) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    async function poll(epoch: number) {
      let delay = 30_000;
      try {
        const data = await request<T>(path!, token, { signal: abort.signal, cache: 'no-store' });
        if (!active) return;
        const accepted = await writeSaved(account, path!, epoch, data);
        if (!active) return;
        if (accepted) {
          setEntry({ key, data }); setCached(false); setError(null);
        }
        // Another tab can observe a deletion while this response is in flight.
        // Discard the stale response, but keep polling for the new revision.
        if (!accepted || data.updating || data.state === 'queued' || data.state === 'running') delay = 3000;
      } catch (e) {
        if (!active) return;
        if ((e as { status?: number }).status === 401 || (e as { status?: number }).status === 403) {
          await clearSaved(account); setEntry(null);
        }
        setError(e instanceof Error ? e.message : String(e)); delay = 5000;
      }
      if (active) timer = setTimeout(() => void poll(epoch), delay);
    }
    void readSaved<T>(account, path).then(saved => {
      if (!active) return;
      if (saved.data) { setEntry({ key, data: saved.data }); setCached(true); }
      void poll(saved.epoch);
    });
    return () => { active = false; abort.abort(); clearTimeout(timer); };
  }, [path, account, token, key, refresh]);
  return { data: entry?.key === key ? entry.data : null, error, cached, reload };
}
