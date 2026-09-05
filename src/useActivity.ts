import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { loadCalendar, loadDay, type DayData } from './api';
import { addDays, dayKey, loadFixture, type Fixture } from './data';

const emptyDay: DayData = { sessions: [], events: [], story: [], tools: [], tokens: {}, tokens_by_source: {} };

export function useActivity({ demo, token, year, day, setDay, refresh }: {
  demo: boolean; token: string | null; year: number; day: string;
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

  useEffect(() => {
    setFx(null); setError(null); setDayError(null);
    cache.current.clear(); revisionRef.current = ''; hadActivity.current = false;
  }, [token, year, demo]);

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
        if (key !== revisionRef.current) cache.current.clear();
        revisionRef.current = key;
        setRevision(key); setRollupsPending(calendar.rollups_pending);
        const ds = Object.keys(calendar.rollups).sort();
        const firstArrival = !hadActivity.current && ds.length > 0;
        hadActivity.current ||= ds.length > 0;
        setDay(current => !firstArrival && current.startsWith(String(year)) ? current : ds.at(-1) ?? `${year}-01-01`);
        setFx(previous => ({
          ...(previous ?? emptyDay), generated: calendar.generated, rollups: calendar.rollups,
          stats: { files: 0, corpus_gb: 0, strokes: Object.values(calendar.rollups)
            .reduce((sum, sources) => sum + Object.values(sources).reduce((n, roll) => n + (roll?.events ?? 0), 0), 0) },
        }));
        setError(null);
        delay = Math.max(3_000, Math.min(30_000, calendar.refresh_after_ms));

        // Low-priority warmup: only the last seven calendar days, two at a time.
        const recent = Array.from({ length: 7 }, (_, i) => addDays(dayKey(new Date()), -i))
          .filter(d => calendar.rollups[d] && !cache.current.has(d));
        const prefetch = async () => {
          while (active && recent.length) {
            const date = recent.shift()!;
            try {
              const data = await loadDay(date, token!, controller.signal);
              if (active && revisionRef.current === key) cache.current.set(date, { data, revision: key });
            } catch { /* On-demand loading will display errors; prefetch is optional. */ }
          }
        };
        void Promise.all([prefetch(), prefetch()]);
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
    const controller = new AbortController();
    const cached = cache.current.get(selected);
    setDayError(null);
    if (!cached || cached.revision !== revision) setDayLoading(true);
    const source = cached?.revision === revision ? Promise.resolve(cached.data) : loadDay(selected, token, controller.signal);
    source.then(data => {
      if (!active) return;
      if (cache.current.size >= 14) cache.current.delete(cache.current.keys().next().value!);
      cache.current.set(selected, { data, revision });
      setFx(previous => previous ? { ...previous, ...data } : previous);
      setDayLoading(false);
    }).catch(caught => {
      if (active) { setDayLoading(false); setDayError(caught instanceof Error ? caught.message : String(caught)); }
    });
    return () => { active = false; controller.abort(); };
  }, [demo, token, year, day, revision, refresh]);

  return { fx, setFx, error: error || dayError, dayLoading, rollupsPending };
}
