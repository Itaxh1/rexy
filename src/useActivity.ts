import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ApiError, loadCalendar, loadExtras, loadRibbon, loadStory,
  type CalendarData, type DayRevisions, type ExtrasData, type RibbonData, type StoryData } from './api';
import { dayKey, loadFixture, type Fixture } from './data';

type Entry = { ribbon?: RibbonData; extras?: ExtrasData; story?: StoryData };
const empty = (): Fixture => ({ generated: '', rollups: {}, sessions: [], events: [], story: [], tools: [],
  tokens: {}, tokens_by_source: {}, stats: { files: 0, corpus_gb: 0, strokes: 0 } });

/** Independent, account-scoped day tiers. Memory cache only; never CDN-cache private data. */
export function useActivity({ demo, token, accountId, year, day, setDay, refresh }: {
  demo: boolean; token: string | null; year: number; day: string; accountId?: string;
  setDay: Dispatch<SetStateAction<string>>; refresh: number;
}) {
  const identity = accountId ?? token;
  const selected = day.startsWith(String(year)) ? day
    : new Date().getFullYear() === year ? dayKey(new Date()) : year + '-01-01';
  const [fx, setFx] = useState<Fixture | null>(null);
  const [ribbon, setRibbon] = useState<RibbonData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [extrasLoading, setExtrasLoading] = useState(false);
  const [extrasAsOf, setExtrasAsOf] = useState<string | null>(null);
  const [storyLoading, setStoryLoading] = useState(false);
  const [storyMore, setStoryMore] = useState(false);
  const [storyNewer, setStoryNewer] = useState(false);
  const [rollupsPending, setRollupsPending] = useState(false);
  const [calendarReady, setCalendarReady] = useState(false);
  const cache = useRef(new Map<string, Entry>());
  const versions = useRef<Record<string, DayRevisions>>({});
  const calendar = useRef<CalendarData | null>(null);
  // Reject slow responses carrying a purge token already superseded in this tab.
  const barriers = useRef(new Map<string, { token: string; retired: Set<string> }>());
  const refreshSelected = useRef<() => void>(() => {});
  const storyAction = useRef<(restart?: boolean) => void>(() => {});
  const selectedRef = useRef(selected); selectedRef.current = selected;

  const notePurge = (date: string, value: string) => {
    const old = barriers.current.get(date);
    if (old?.retired.has(value)) return false;
    if (old && old.token !== value) {
      old.retired.add(old.token); old.token = value; cache.current.delete(date);
    } else if (!old) barriers.current.set(date, { token: value, retired: new Set() });
    return true;
  };
  const paint = (date: string) => {
    if (date !== selectedRef.current) return;
    const entry = cache.current.get(date) ?? {};
    const cal = calendar.current;
    const base = empty();
    setFx({ ...base, generated: cal?.generated ?? entry.ribbon?.generated ?? '',
      rollups: cal?.rollups ?? {},
      stats: { ...base.stats, strokes: Object.values(cal?.rollups ?? {}).reduce((sum, sources) =>
        sum + Object.values(sources).reduce((n, roll) => n + (roll?.events ?? 0), 0), 0) },
      sessions: (entry.ribbon?.sessions ?? []).map(s => {
        const summary = entry.extras?.summaries_by_session[s.id];
        return { ...s, ...(summary ? { summary: summary.summary, summary_state: summary.summary_state,
          refresh_state: summary.refresh_state, is_stale: summary.is_stale } : {}) };
      }), events: entry.ribbon?.events ?? [], story: entry.story?.story ?? [],
      tokens: entry.extras?.tokens ?? {}, tokens_by_source: entry.extras?.tokens_by_source ?? {},
    });
    setRibbon(entry.ribbon ?? null); setExtrasAsOf(entry.extras?.generated ?? null);
    setStoryMore(Boolean(entry.story?.next_cursor));
    setStoryNewer(Boolean(entry.story && (entry.story.has_newer_data ||
      versions.current[date]?.story && versions.current[date].story !== entry.story.series_revision)));
  };

  useEffect(() => {
    cache.current.clear(); barriers.current.clear(); versions.current = {}; calendar.current = null;
    setFx(null); setRibbon(null); setError(null); setDayError(null); setCalendarReady(false);
  }, [identity, year, demo]);

  useEffect(() => {
    if (!demo && !token) return;
    let active = true, inFlight = false;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    const poll = async () => {
      if (!active || inFlight) return;
      if (document.hidden) { timer = setTimeout(poll, 30_000); return; }
      inFlight = true;
      let delay = 30_000;
      try {
        if (demo) {
          const data = await loadFixture();
          if (active) {
            setFx(data); setCalendarReady(true);
            const days = Object.keys(data.rollups).filter(d => d.startsWith(String(year))).sort();
            setDay(current => current.startsWith(String(year)) ? current : days.at(-1) ?? year + '-01-01');
          }
          return;
        }
        const data = await loadCalendar(year, token!, abort.signal);
        if (!active) return;
        if (Object.entries(data.day_revisions).some(([d, r]) => barriers.current.get(d)?.retired.has(r.purge))) {
          delay = 1000; return;
        }
        calendar.current = data; versions.current = data.day_revisions;
        for (const [d, r] of Object.entries(data.day_revisions)) notePurge(d, r.purge);
        setCalendarReady(true); setRollupsPending(data.rollups_pending);
        const days = Object.keys(data.rollups).sort();
        setDay(current => current.startsWith(String(year)) ? current : days.at(-1) ?? selectedRef.current);
        paint(selectedRef.current); refreshSelected.current(); setError(null);
        delay = Math.max(3000, Math.min(30000, data.refresh_after_ms));
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        inFlight = false;
        if (active && !demo) timer = setTimeout(poll, delay);
      }
    };
    const visible = () => { if (!document.hidden) { clearTimeout(timer); void poll(); } };
    void poll(); document.addEventListener('visibilitychange', visible);
    return () => { active = false; abort.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [demo, token, identity, year, refresh, setDay]);

  useEffect(() => {
    if (demo || !token) return;
    let active = true;
    const abort = new AbortController();
    const busy = { ribbon: false, extras: false, story: false };
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const retry = (work: () => void, delay = 3000) => {
      const timer = setTimeout(() => { timers.delete(timer); if (active) work(); }, delay); timers.add(timer);
    };
    setDayError(null); setDayLoading(!cache.current.get(selected)?.ribbon);
    setExtrasLoading(!cache.current.get(selected)?.extras); setStoryLoading(false); paint(selected);

    const accept = (data: { contract_version: number; date: string; purge_revision: string }, startingPurge?: string) => {
      if (!active || data.date !== selected || data.contract_version !== 1) return false;
      const current = barriers.current.get(selected)?.token;
      if (current !== startingPurge && data.purge_revision !== current) return false;
      return notePurge(selected, data.purge_revision);
    };
    const save = (entry: Entry) => {
      cache.current.set(selected, entry);
      while (cache.current.size > 14 || [...cache.current.values()].reduce((n, e) => n + (e.ribbon?.events.length ?? 0), 0) > 80000 && cache.current.size > 1) {
        const key = [...cache.current.keys()].find(k => k !== selected)!; cache.current.delete(key);
      }
      paint(selected);
    };
    const loadTier = async (tier: 'ribbon' | 'extras', force = false) => {
      const entry = cache.current.get(selected);
      if (!active || busy[tier] || !force && entry?.[tier] && entry[tier]?.revision === versions.current[selected]?.[tier]) return;
      busy[tier] = true;
      const startingPurge = barriers.current.get(selected)?.token;
      const expected = versions.current[selected]?.[tier];
      let failed = false;
      try {
        const data = tier === 'ribbon' ? await loadRibbon(selected, token, abort.signal) : await loadExtras(selected, token, abort.signal);
        if (!accept(data, startingPurge)) return;
        const previous = cache.current.get(selected) ?? {};
        if (tier === 'ribbon') {
          const value = data as RibbonData;
          if (!value.snapshot_complete) throw new Error('Incomplete ribbon snapshot; retrying.');
          save({ ...previous, ribbon: value }); setDayLoading(false);
        } else {
          const value = data as ExtrasData;
          save({ ...previous, extras: { ...value,
            summaries_by_session: value.sections.summaries === 'ready' ? value.summaries_by_session : previous.extras?.summaries_by_session ?? {},
            tokens: value.sections.tokens === 'ready' ? value.tokens : previous.extras?.tokens ?? {},
            tokens_by_source: value.sections.tokens === 'ready' ? value.tokens_by_source : previous.extras?.tokens_by_source ?? {},
          } }); setExtrasLoading(false);
          if (value.sections.summaries === 'failed' || value.sections.tokens === 'failed') {
            failed = true; retry(() => void loadTier(tier, true), 15000);
          }
        }
        setDayError(null);
      } catch (caught) {
        failed = true;
        if (active) { setDayError(caught instanceof Error ? caught.message : String(caught)); retry(() => void loadTier(tier, true), 15000); }
      } finally {
        busy[tier] = false;
        if (active) {
          if (tier === 'ribbon') setDayLoading(false); else setExtrasLoading(false);
          if (!failed && expected !== versions.current[selected]?.[tier]) retry(() => void loadTier(tier), 1000);
        }
      }
    };
    const story = async (restart = false) => {
      if (!active || busy.story) return;
      const previous = cache.current.get(selected)?.story;
      if (!restart && previous && !previous.next_cursor) return;
      busy.story = true; setStoryLoading(true);
      const startingPurge = barriers.current.get(selected)?.token;
      try {
        const value = await loadStory(selected, token, abort.signal, restart ? undefined : previous?.next_cursor ?? undefined);
        if (!accept(value, startingPurge)) return;
        const rows = restart ? value.story : [...(previous?.story ?? []), ...value.story];
        save({ ...cache.current.get(selected), story: { ...value, story: [...new Map(rows.map(row => [row.id, row])).values()] } });
        setDayError(null);
      } catch (caught) {
        if (active) {
          setDayError(caught instanceof Error ? caught.message : String(caught));
          if (caught instanceof ApiError && (caught.status === 409 || caught.status === 410)) {
            save({ ...cache.current.get(selected), story: undefined }); setStoryNewer(true);
          }
        }
      } finally { busy.story = false; if (active) setStoryLoading(false); }
    };
    const refreshTiers = () => {
      void loadTier('ribbon'); void loadTier('extras');
      if (!cache.current.get(selected)?.story) void story(); else paint(selected);
    };
    refreshSelected.current = refreshTiers;
    storyAction.current = (restart = false) => { void story(restart); };
    void loadTier('ribbon', refresh > 0); void loadTier('extras', refresh > 0);
    if (!cache.current.get(selected)?.story || refresh > 0) void story(refresh > 0);
    return () => { active = false; abort.abort(); timers.forEach(clearTimeout); refreshSelected.current = () => {}; storyAction.current = () => {}; };
  }, [demo, token, identity, year, selected, refresh]);

  return { fx, setFx, ribbon, error: error || dayError, dayLoading, extrasLoading, extrasAsOf,
    storyLoading, storyMore, storyNewer, loadMoreStory: () => storyAction.current(),
    reloadStory: () => storyAction.current(true), rollupsPending, calendarReady };
}
