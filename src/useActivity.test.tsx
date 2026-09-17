// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useActivity } from './useActivity';
import { loadCalendar, loadExtras, loadRibbon, loadStory, type CalendarData, type ExtrasData, type RibbonData, type StoryData } from './api';

vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(),
  loadCalendar: vi.fn(), loadExtras: vi.fn(), loadRibbon: vi.fn(), loadStory: vi.fn() }));
const date = '2026-09-04';
const calendar = (r = 'r1', purge = 'p1'): CalendarData => ({ generated: '', revision: 1,
  rollups_pending: false, refresh_after_ms: 3000,
  day_revisions: { [date]: { ribbon: r, extras: 'e1', story: 's1', purge } },
  rollups: { [date]: { codex: { sessions: 1, events: 12, tools: 4, ok: 4, fail: 0 } } } });
const ribbon = (d = date, r = 'r1', purge = 'p1'): RibbonData => ({ contract_version: 1, date: d,
  generated: '2026-09-04T20:00:00Z', revision: r, purge_revision: purge, snapshot_complete: true, markers_state: 'unsupported',
  axis: { timezone: 'UTC', start_ms: 0, end_ms: 86400000 }, off_axis_event_ids: [],
  sessions: [{ id: '9007199254741001', src: 'codex', title: 'Real session', proj: 'Rexy', model: null,
    start: 1, end: 2, d, day_first_ms: 1, day_last_ms: 2 }],
  events: [{ id: '9007199254741002', t: 1, d, src: 'codex', s: '9007199254741001', k: 'tool', st: 'succeeded', n: 'Read', ms: null }] });
const extras = (d = date, purge = 'p1'): ExtrasData => ({ contract_version: 1, date: d, generated: '2026-09-04T20:00:00Z',
  revision: 'e1', ribbon_revision: 'r1', purge_revision: purge, sections: { summaries: 'ready', tokens: 'ready', findings: 'unsupported' },
  summaries_by_session: { '9007199254741001': { summary: 'Saved TLDR', summary_state: 'ready', refresh_state: 'pending',
    is_stale: true, generated_at: null, input_revision: '1', model: 'grok-4.3' } },
  tokens: {}, tokens_by_source: {}, usage_only_session_count: 0 });
const story = (d = date, purge = 'p1'): StoryData => ({ contract_version: 1, date: d, generated: '',
  revision: 's1', series_revision: 's1', purge_revision: purge, has_newer_data: false, story: [], next_cursor: null });
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); vi.setSystemTime(new Date('2026-09-04T20:00:00Z'));
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  vi.mocked(loadCalendar).mockResolvedValue(calendar());
  vi.mocked(loadRibbon).mockImplementation(async d => ribbon(d));
  vi.mocked(loadExtras).mockImplementation(async d => extras(d));
  vi.mocked(loadStory).mockImplementation(async d => story(d));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });
function Harness({ owner = 'alice' }: { owner?: string }) {
  const [day, setDay] = useState(date);
  const s = useActivity({ demo: false, token: owner, accountId: owner, year: 2026, day, setDay, refresh: 0 });
  return <div><pre>{JSON.stringify({ day, events: s.fx?.events, sessions: s.fx?.sessions, counts: s.fx?.stats.strokes,
    dayLoading: s.dayLoading, extrasLoading: s.extrasLoading, story: s.fx?.story, newer: s.storyNewer })}</pre>
    <button onClick={() => setDay('2026-09-03')}>Other day</button><button onClick={() => setDay(date)}>Back</button>
    <button onClick={s.loadMoreStory}>More</button></div>;
}
const state = () => JSON.parse(container.querySelector('pre')!.textContent!);
const render = (owner = 'alice') => act(async () => root.render(<Harness owner={owner} />));
const click = (name: string) => act(async () => Array.from(container.querySelectorAll('button')).find(b => b.textContent === name)!.click());

it('paints the real ribbon and counts without waiting for extras or exchanges', async () => {
  const slow = deferred<ExtrasData>(); vi.mocked(loadExtras).mockReturnValue(slow.promise);
  vi.mocked(loadStory).mockReturnValue(new Promise(() => {}));
  await render();
  expect(state().counts).toBe(12); expect(state().events[0].id).toBe('9007199254741002');
  expect(state().dayLoading).toBe(false); expect(state().extrasLoading).toBe(true);
  await act(async () => slow.resolve(extras()));
  expect(state().sessions[0].summary).toBe('Saved TLDR');
});
it('keeps an early ribbon when calendar arrives later', async () => {
  const slow = deferred<CalendarData>(); vi.mocked(loadCalendar).mockReturnValue(slow.promise);
  await render(); expect(state().events).toHaveLength(1);
  await act(async () => slow.resolve(calendar()));
  expect(state().counts).toBe(12); expect(state().events).toHaveLength(1);
});
it('does not cancel slow day reads on each import revision or hide saved summaries', async () => {
  const slow = deferred<RibbonData>(); vi.mocked(loadRibbon).mockReturnValue(slow.promise);
  let version = 0; vi.mocked(loadCalendar).mockImplementation(async () => calendar('r' + ++version));
  await render(); await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(loadRibbon).toHaveBeenCalledOnce(); expect(vi.mocked(loadRibbon).mock.calls[0][2]?.aborted).toBe(false);
  await act(async () => slow.resolve(ribbon()));
  expect(state().events).toHaveLength(1); expect(state().sessions[0].summary).toBe('Saved TLDR');
});
it('does not reload a cached day when only another day changes', async () => {
  await render();
  vi.mocked(loadCalendar).mockResolvedValue({ ...calendar(), revision: 99,
    day_revisions: { ...calendar().day_revisions, '2026-09-03': { ribbon: 'changed', extras: 'e', story: 's', purge: 'p1' } } });
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(loadRibbon).toHaveBeenCalledOnce(); expect(loadExtras).toHaveBeenCalledOnce();
});
it('ignores responses for a previous date and previous account', async () => {
  const old = deferred<RibbonData>(); vi.mocked(loadRibbon).mockReturnValueOnce(old.promise);
  await render(); await click('Other day');
  expect(state().events[0].d).toBe('2026-09-03');
  await act(async () => old.resolve(ribbon())); expect(state().events[0].d).toBe('2026-09-03');
  vi.mocked(loadRibbon).mockResolvedValue({ ...ribbon('2026-09-03'), sessions: [], events: [] });
  await render('bob'); expect(state().events).toEqual([]); expect(state().sessions).toEqual([]);
});
it('clears a purged day and rejects an in-flight pre-delete response', async () => {
  const old = deferred<RibbonData>(); vi.mocked(loadRibbon).mockReturnValueOnce(old.promise);
  await render();
  vi.mocked(loadCalendar).mockResolvedValue(calendar('r2', 'p2'));
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  await act(async () => old.resolve(ribbon()));
  expect(state().events).toEqual([]); expect(state().sessions).toEqual([]);
  vi.mocked(loadRibbon).mockResolvedValue({ ...ribbon(date, 'r2', 'p2'), events: [], sessions: [] });
  await act(async () => vi.advanceTimersByTimeAsync(1000)); expect(state().events).toEqual([]);
});
it('replaces cached contents with a complete empty snapshot, not with an error', async () => {
  await render(); vi.mocked(loadCalendar).mockResolvedValue(calendar('r2'));
  vi.mocked(loadRibbon).mockRejectedValueOnce(new Error('temporary'));
  await act(async () => vi.advanceTimersByTimeAsync(3000)); expect(state().events).toHaveLength(1);
  vi.mocked(loadRibbon).mockResolvedValue({ ...ribbon(date, 'r2'), events: [], sessions: [] });
  await act(async () => vi.advanceTimersByTimeAsync(15000)); expect(state().events).toEqual([]);
});
it('loads story pages once and notices appends after the last page', async () => {
  const row = { id: '9007199254741999', t: 1, d: date, s: '9007199254741001', src: 'codex' as const, k: 'user' as const, x: 'Real prompt', truncated: false };
  vi.mocked(loadStory).mockResolvedValueOnce({ ...story(), story: [row], next_cursor: 'signed-cursor' })
    .mockResolvedValue({ ...story(), story: [row, { ...row, id: '9007199254742000' }] });
  await render(); await click('More'); expect(state().story).toHaveLength(2);
  expect(vi.mocked(loadStory).mock.calls[1][3]).toBe('signed-cursor');
  vi.mocked(loadCalendar).mockResolvedValue({ ...calendar(), day_revisions: { [date]: { ...calendar().day_revisions[date], story: 's2' } } });
  await act(async () => vi.advanceTimersByTimeAsync(3000)); expect(state().newer).toBe(true);
});
