import { useEffect, useState } from 'react';
import { loadDevices, type Device } from './api';

// Poll independently of transcript uploads: pairing is visible before scanning ends.
export function useDevices(token: string | null) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    setDevices(null);
    setError(null);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    const poll = async () => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const result = await loadDevices(token, controller.signal);
        if (active) { setDevices(result); setError(null); }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        clearTimeout(timeout);
        if (active) timer = setTimeout(poll, 3_000);
      }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); controller?.abort(); };
  }, [token, refresh]);

  return { devices, error, reload: () => setRefresh(value => value + 1) };
}
