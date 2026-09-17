// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ActivityTimeline from './ActivityTimeline';
import Ribbon from './Ribbon';
import TokenUsage from './TokenUsage';
import { loadEvent } from '../api';
import type { Ev, Sess, Story } from '../data';
import { ribbonFromEvents } from '../dayRibbon';

vi.mock('../api', () => ({ loadEvent: vi.fn() }));
const session: Sess = { id: 's', src: 'codex', title: 'Fix auth', proj: 'Rexy', model: null,
  start: 100, end: 200, d: '2026-09-04', summary: 'Fixed the callback and verified sign-in.', summary_state: 'ready' };
const events: Ev[] = [
  { id: '1', t: 100, d: session.d, s: 's', src: 'codex', k: 'user', st: 'succeeded' },
  { id: '2', t: 101, d: session.d, s: 's', src: 'codex', k: 'tool', st: 'succeeded', n: 'Bash' },
];
const story: Story[] = [{ t: 100, d: session.d, s: 's', src: 'codex', k: 'user', x: 'Please fix the callback <script>danger</script>' }];
let root: Root; let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });
const renderTimeline = () => act(async () => root.render(<ActivityTimeline day={session.d}
  sessions={[session]} events={events} story={story} token="browser" onOpen={vi.fn()} />));
// Both the overall event sequence and per-session clock ribbons are live views.
const renderRibbon = (evs: Ev[] = events, st: Story[] = story, token: string | null = 'browser') =>
  act(async () => root.render(<Ribbon day={session.d} sessions={[session]} events={evs} story={st} token={token} onOpen={vi.fn()} />));

it('keeps the session ribbons visible and collapses only the exchanges', async () => {
  await renderTimeline();
  const rows = () => container.querySelectorAll('.srb-row').length;
  expect(container.textContent).toContain(session.summary);
  expect(rows()).toBeGreaterThan(0);
  expect(container.querySelectorAll('.srb-title')).toHaveLength(1);
  expect(container.querySelector('[aria-label="Overall agent ribbons"]')).not.toBeNull();
  expect(container.querySelectorAll('.overall-ribbons .sl')).toHaveLength(2);
  expect(container.querySelectorAll('.overall-ribbons .sb')).toHaveLength(2);
  expect(container.querySelector('.srb-title')?.textContent).toBe(session.title);
  expect(container.textContent).not.toContain('Sample data');
  expect(container.querySelectorAll('.ti')).toHaveLength(1);
  expect(loadEvent).not.toHaveBeenCalled();
  const toggle = container.querySelector<HTMLButtonElement>('.timeline-toggle')!;
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  const before = rows();
  await act(async () => toggle.click());
  // Ribbons sit above the collapsible region, so they survive the toggle;
  // only the per-exchange list is hidden.
  expect(rows()).toBe(before);
  expect(container.querySelectorAll('.overall-ribbons .sb')).toHaveLength(2);
  expect(container.querySelectorAll('.ti')).toHaveLength(0);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(container.textContent).toContain(session.summary);
  await act(async () => toggle.click());
  expect(container.querySelectorAll('.ti')).toHaveLength(1);
});

it('shows the actual prompt safely and lazily loads tool input/output on focus', async () => {
  vi.mocked(loadEvent).mockImplementation(async id => ({ id, content: null,
    tool_input: id === '2' ? 'npm test' : null, tool_output: id === '2' ? '42 passed' : null, truncated: false }));
  await renderRibbon();
  const buttons = container.querySelectorAll<HTMLButtonElement>('.sb');
  await act(async () => buttons[0].focus());
  expect(container.querySelector('[role=tooltip]')?.textContent).toContain(story[0].x);
  expect(container.querySelector('script')).toBeNull();
  await act(async () => buttons[1].focus());
  expect(loadEvent).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(120));
  expect(loadEvent).toHaveBeenCalledTimes(1);
  expect(loadEvent).toHaveBeenCalledWith('2', 'browser', expect.any(AbortSignal));
  expect(container.querySelector('[role=tooltip]')?.textContent).toContain('npm test');
  expect(container.querySelector('[role=tooltip]')?.textContent).toContain('42 passed');
  expect(container.querySelector('[role=tooltip]')?.textContent).not.toContain('Took');
  await act(async () => buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(container.querySelector('[role=tooltip]')).toBeNull();
});

it('uses backend totals and does not invent zero usage for an unavailable source', async () => {
  await act(async () => root.render(<TokenUsage usage={{ codex: { in: 10, cr: 30, cw: 0, out: 20, th: 10, total: 60 } }} />));
  const rows = container.querySelectorAll('.toks');
  expect(rows[0].textContent).toContain('Claude CodeUsage unavailable');
  expect(rows[1].textContent).toContain('Codex60total tokens');
  expect(rows[1].textContent).toContain('thinking, included in output');
});

it('shows zero for a confirmed inactive agent, without zeroing unknown or loading usage', async () => {
  await act(async () => root.render(<TokenUsage inactiveSources={['claude-code']} />));
  let rows = container.querySelectorAll('.toks');
  expect(rows[0].textContent).toBe('Claude Code0total tokens0fresh input0cached input0cache writes0output0thinking, included in output');
  expect(Array.from(rows[0].querySelectorAll('b')).map(field => field.textContent)).toEqual(['0', '0', '0', '0', '0', '0']);
  expect(rows[1].textContent).toBe('CodexUsage unavailable');
  await act(async () => root.render(<TokenUsage inactiveSources={['claude-code']} loading />));
  rows = container.querySelectorAll('.toks');
  expect(rows[0].textContent).toBe('Claude CodeLoading usage…');
  await act(async () => root.render(<TokenUsage inactiveSources={['claude-code']}
    usage={{ 'claude-code': { in: 10, cr: 0, cw: 0, out: 20, th: 0, total: 30 } }} />));
  expect(container.querySelector('.toks')?.textContent).toContain('Claude Code30total tokens');
});

it('shows the complete breakdown when recorded token usage is genuinely zero', async () => {
  await act(async () => root.render(<TokenUsage usage={{ codex: { in: 0, cr: 0, cw: 0, out: 0, th: 0, total: 0 } }} />));
  const rows = container.querySelectorAll('.toks');
  expect(rows[0].textContent).toContain('Usage unavailable');
  expect(rows[1].querySelectorAll('b')).toHaveLength(6);
  expect(rows[1].textContent).toContain('0cache writes');
  expect(rows[1].textContent).toContain('0thinking, included in output');
});

it('uses one toggle for detailed session ribbons across both agents, leaving the overall view unchanged', async () => {
  const claude = { ...session, id: 'claude', src: 'claude-code' as const, title: 'Fix the collector' };
  const mixed = [...events, { ...events[0], id: 'claude-prompt', s: claude.id, src: claude.src }]
    .map((event, i) => ({ ...event, t: new Date(2026, 8, 4, 12).getTime() + i }));
  const onOpen = vi.fn();
  await act(async () => root.render(<ActivityTimeline day={session.d} sessions={[session, claude]}
    events={mixed} story={[]} token={null} onOpen={onOpen} />));
  const toggle = container.querySelector<HTMLButtonElement>('[aria-label="Detailed session view"]')!;
  const overview = container.querySelector('.overall-ribbons');
  expect(toggle.getAttribute('aria-pressed')).toBe('false');
  expect(container.querySelector('.srb-detailed')).toBeNull();
  await act(async () => toggle.click());
  expect(toggle.getAttribute('aria-pressed')).toBe('true');
  expect(toggle.textContent).toBe('Full-day view');
  expect(container.querySelectorAll('.srb-detailed .srb-detail-track')).toHaveLength(2);
  expect(container.querySelectorAll('.srb-detailed .sb')).toHaveLength(3);
  expect(container.querySelector('.srb')?.textContent).not.toContain('Local time');
  expect(container.querySelector('.overall-ribbons')).toBe(overview);
  await act(async () => container.querySelector<HTMLButtonElement>('.srb-detailed .sb')!.click());
  expect(onOpen).toHaveBeenCalledWith('claude');
  expect(loadEvent).not.toHaveBeenCalled();
  await act(async () => toggle.click());
  expect(container.querySelectorAll('.srb-detail-track')).toHaveLength(0);
  expect(container.querySelectorAll('.srb-row')).toHaveLength(2);
  expect(container.querySelector('.srb')?.textContent).toContain('Local time');
});

it('uses the same resolved session name in live ribbons and the summary list', async () => {
  const loaded = ribbonFromEvents(session.d, [{ ...session, title: '# AGENTS.md instructions <INSTRUCTIONS>' }], events);
  await act(async () => root.render(<ActivityTimeline day={session.d} sessions={[session]} events={events}
    story={story} ribbon={loaded} token={null} onOpen={vi.fn()} />));
  expect(container.querySelector('.srb-title')?.textContent).toBe('Fix auth');
  expect(container.querySelector('.timeline-summary-heading button')?.textContent).toBe('Fix auth');
  expect(loaded.sessions[0].title).toContain('AGENTS.md');
});

it('positions hour labels at event boundaries and thins crowded labels without hiding events', async () => {
  const hours = [8, 8, 9, 9, 9, 10];
  const timed = hours.map((hour, index) => ({ ...events[0], id: String(index),
    t: new Date(2026, 8, 4, hour, index).getTime() }));
  await renderRibbon(timed, [], null);
  const ticks = Array.from(container.querySelectorAll<HTMLElement>('.slticks span'));
  expect(ticks.map(tick => tick.textContent)).toEqual(['08:00', '10:00']);
  expect(ticks.map(tick => tick.style.left)).toEqual(['0px', '50px']);
  expect(container.querySelectorAll('.sb')).toHaveLength(6);
});

it('combines sessions per agent in chronological order without changing the per-session ribbons', async () => {
  const other = { ...session, id: 'other', src: 'claude-code' as const, title: 'Fix collector' };
  const more = { ...session, id: 'more', title: 'Fix upload' };
  const mixed: Ev[] = [events[1], { ...events[0], id: '3', s: other.id, src: other.src },
    { ...events[0], id: '4', s: more.id, t: 102 }, events[0]];
  const onOpen = vi.fn();
  await act(async () => root.render(<ActivityTimeline day={session.d} sessions={[session, other, more]}
    events={mixed} story={[]} token={null} onOpen={onOpen} />));
  const lanes = container.querySelectorAll('.overall-ribbons .sl');
  expect(lanes[0].textContent).toContain('1 events · 1 session');
  expect(lanes[1].textContent).toContain('3 events · 2 sessions');
  expect(container.querySelectorAll('.srb-row')).toHaveLength(3);
  const strokes = lanes[1].querySelectorAll<HTMLButtonElement>('.sb');
  expect(strokes[0].getAttribute('aria-label')).toBe('You asked for something');
  await act(async () => strokes[2].click());
  expect(onOpen).toHaveBeenCalledWith('more');
  // Drawing two views must not duplicate the source data.
  expect(mixed).toHaveLength(4);
  expect(mixed[0]).toBe(events[1]);
});

it('keeps both ribbon views in a loading state until day events arrive', async () => {
  await act(async () => root.render(<ActivityTimeline day={session.d} sessions={[]} events={[]}
    story={[]} token={null} loading onOpen={vi.fn()} />));
  expect(container.textContent).toContain('Loading overall ribbons');
  expect(container.textContent).toContain('Loading session ribbons');
  expect(container.querySelectorAll('.sb, .srb-mark')).toHaveLength(0);
});

it('windows busy overall ribbons while retaining all events, keyboard navigation and session links', async () => {
  const busy = Array.from({ length: 5000 }, (_, i): Ev => ({ ...events[1], id: `event-${i}`,
    s: i === 4999 ? 'last-session' : 's', t: 100 + i }));
  const onOpen = vi.fn();
  await act(async () => root.render(<Ribbon day={session.d} sessions={[session]} events={busy}
    token={null} onOpen={onOpen} />));
  expect(container.textContent).toContain('5,000 events · 2 sessions');
  expect(container.querySelectorAll('.sb').length).toBeLessThan(130);
  const first = container.querySelector<HTMLButtonElement>('.sb')!;
  await act(async () => first.focus());
  await act(async () => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
  expect((document.activeElement as HTMLElement).dataset.index).toBe('4999');
  expect(container.querySelectorAll('.sb').length).toBeLessThan(130);
  await act(async () => (document.activeElement as HTMLButtonElement).click());
  expect(onOpen).toHaveBeenCalledWith('last-session');
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
  expect((document.activeElement as HTMLElement).dataset.index).toBe('0');
});

it('scrolls each overall lane independently and draws later events without eager preview requests', async () => {
  const busy = Array.from({ length: 1000 }, (_, i): Ev => ({ ...events[1], id: `event-${i}`, t: 100 + i }));
  await renderRibbon([...busy, { ...events[0], id: 'claude', src: 'claude-code' }]);
  const lanes = container.querySelectorAll<HTMLDivElement>('.slbars');
  await act(async () => { lanes[1].scrollLeft = 5000; lanes[1].dispatchEvent(new Event('scroll')); });
  expect(lanes[0].scrollLeft).toBe(0);
  expect(lanes[1].querySelector('[data-index="500"]')).not.toBeNull();
  expect(lanes[1].querySelector('[data-index="0"]')).toBeNull();
  expect(loadEvent).not.toHaveBeenCalled();
});
