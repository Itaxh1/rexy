import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { loadCalendar, loadDay, type DayData } from './api';
import { dayKey, loadFixture, type Fixture } from './data';

const emptyDay: DayData = { sessions: [], events: [], story: [], tools: [], tokens: {}, tokens_by_source: {} };

export function useActivity({ demo, token, accountId, year, day, setDay, refresh }: {
  demo: boolean; token: string | null; year: number; day: string;
  accountId?: string;
  setDay: Dispatch<SetStateAction<string>>; refresh: number;
}) {
  const [fx, setFx] = useState<Fixture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [rollupsPending, setRollupsPending] = useState(false);
  const [revision, setRevision] = useState('');
  const cache = useRef(new Map<string, { data: DayData; revision: string }>());
  const revisionRef = useRef('');
  const hadActivity = useRef(false);
  const refreshSelected = useRef<() => void>(() => {});
  const selectedRef = useRef(day);
  selectedRef.current = day;
  const identity = accountId ?? token;

  useEffect(() => {
    setFx(null); setError(null); setDayError(null);
    cache.current.clear(); revisionRef.current = ''; hadActivity.current = false;
  }, [identity, year, demo]);

  useEffect(() => {
    if (!demo && !token) return;
    let active = true;
    let polling = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      if (polling) return;
      if (document.hidden) { timer = setTimeout(poll, 30_000); return; }
      polling = true;
      let delay = 30_000;
      try {
        if (demo) {
          const data = await loadFixture();
          if (active) {
            setFx(data);
            const ds = Object.keys(data.rollups).filter(d => d.startsWith(String(year))).sort();
            setDay(current => current.startsWith(String(year)) ? current : ds.at(-1) ?? `${year}-01-01`);
          }
          return;
        }
        const calendar = await loadCalendar(year, token!, controller.signal);
        if (!active) return;
        const key = `${calendar.revision}:${calendar.rollups_pending}`;
        revisionRef.current = key;
        setRevision(key); setRollupsPending(calendar.rollups_pending);
        const ds = Object.keys(calendar.rollups).sort();
        const firstArrival = !hadActivity.current && ds.length > 0;
        hadActivity.current ||= ds.length > 0;
        setDay(current => !firstArrival && current.startsWith(String(year)) ? current : ds.at(-1) ?? `${year}-01-01`);
        setFx(previous => ({
          ...(previous ?? cache.current.get(selectedRef.current)?.data ?? emptyDay), generated: calendar.generated, rollups: calendar.rollups,
          stats: { files: 0, corpus_gb: 0, strokes: Object.values(calendar.rollups)
            .reduce((sum, sources) => sum + Object.values(sources).reduce((n, roll) => n + (roll?.events ?? 0), 0), 0) },
        }));
        setError(null);
        delay = Math.max(3_000, Math.min(30_000, calendar.refresh_after_ms));

        // Do not start overlapping prefetch loops while imports are changing
        // the calendar. The selected day gets the available request capacity.
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        polling = false;
        if (active && !demo) timer = setTimeout(poll, delay);
      }
    };
    const visible = () => {
      if (!document.hidden) { clearTimeout(timer); timer = setTimeout(poll, 0); }
    };
    void poll();
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [demo, token, year, refresh, setDay]);

  useEffect(() => {
    if (demo || !token) return;
    const selected = day.startsWith(String(year)) ? day
      : new Date().getFullYear() === year ? dayKey(new Date()) : `${year}-01-01`;
    let active = true;
    let inFlight = false;
    let reloadNeeded = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const cached = cache.current.get(selected);
    setDayError(null);
    setDayLoading(!cached);
    if (cached) setFx(previous => previous ? { ...previous, ...cached.data } : previous);
    const load = async (force = false) => {
      if (!active) return;
      if (inFlight) { reloadNeeded = true; return; }
      const requestedRevision = revisionRef.current;
      if (!force && cache.current.get(selected)?.revision === requestedRevision) return;
      inFlight = true; reloadNeeded = false;
      try {
        const data = await loadDay(selected, token, controller.signal);
        if (!active) return;
        if (cache.current.size >= 14 && !cache.current.has(selected)) cache.current.delete(cache.current.keys().next().value!);
        cache.current.set(selected, { data, revision: requestedRevision });
        setFx(previous => previous ? { ...previous, ...data } : previous);
        setDayLoading(false); setDayError(null);
      } catch (caught) {
        if (active) { setDayLoading(false); setDayError(caught instanceof Error ? caught.message : String(caught)); }
      } finally {
        inFlight = false;
        // Finish and paint the response, even if newer data arrived meanwhile.
        // Then coalesce all notifications into one subsequent refresh.
        if (active && (reloadNeeded || revisionRef.current !== requestedRevision)) {
          clearTimeout(timer); timer = setTimeout(() => void load(), 1000);
        }
      }
    };
    refreshSelected.current = () => { void load(); };
    void load(!cached || refresh > 0);
    return () => { active = false; controller.abort(); clearTimeout(timer); refreshSelected.current = () => {}; };
  }, [demo, token, identity, year, day, refresh]);

  // Calendar revisions request a refresh; they never cancel a selected-day read.
  useEffect(() => { refreshSelected.current(); }, [revision]);

  return { fx, setFx, error: error || dayError, dayLoading, rollupsPending };
}
