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
// Keep the legacy ribbon checks while production uses per-session ribbons.
const renderRibbon = (evs: Ev[] = events, st: Story[] = story, token: string | null = 'browser') =>
  act(async () => root.render(<Ribbon day={session.d} sessions={[session]} events={evs} story={st} token={token} onOpen={vi.fn()} />));

it('keeps the session ribbons visible and collapses only the exchanges', async () => {
  await renderTimeline();
  const rows = () => container.querySelectorAll('.srb-row').length;
  expect(container.textContent).toContain(session.summary);
  expect(rows()).toBeGreaterThan(0);
  expect(container.querySelectorAll('.srb-title')).toHaveLength(1);
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
  expect(rows[0].textContent).toBe('Claude Code0total tokens');
  expect(rows[1].textContent).toBe('CodexUsage unavailable');
  await act(async () => root.render(<TokenUsage inactiveSources={['claude-code']} loading />));
  rows = container.querySelectorAll('.toks');
  expect(rows[0].textContent).toBe('Claude CodeLoading usage…');
  await act(async () => root.render(<TokenUsage inactiveSources={['claude-code']}
    usage={{ 'claude-code': { in: 10, cr: 0, cw: 0, out: 20, th: 0, total: 30 } }} />));
  expect(container.querySelector('.toks')?.textContent).toContain('Claude Code30total tokens');
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
