// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEvent } from '../api';
vi.mock('../api', () => ({ loadEvent: vi.fn() }));
import SessionRibbons from './SessionRibbons';
import { stubDayRibbon } from './sessionRibbons.stub';
import {
  CLUSTER_PX, axisPosition, clusterByPixel, estimatedActiveMs,
  type DayRibbon, type RibbonEvent,
} from '../dayRibbon';

const HOUR = 3_600_000;
const axis = { timezone: 'America/Phoenix', start_ms: 1_789_542_000_000, end_ms: 1_789_542_000_000 + 24 * HOUR };

const ev = (id: string, s: string, hour: number, k: RibbonEvent['k'], extra: Partial<RibbonEvent> = {}): RibbonEvent => ({
  id, s, t: axis.start_ms + hour * HOUR, d: '2026-09-16', src: s.startsWith('cx') ? 'codex' : 'claude-code',
  k, st: k === 'tool' ? 'succeeded' : 'unknown', n: k === 'tool' ? 'Bash' : null, ms: null, ...extra,
});

const ribbon: DayRibbon = {
  date: '2026-09-16', axis, off_axis_event_ids: ['cx-a-off'],
  sessions: [
    { id: 'cx-a', src: 'codex', title: 'Split day endpoints', proj: 'render-backend', model: null,
      start: axis.start_ms + 11 * HOUR, end: axis.start_ms + 12 * HOUR, d: '2026-09-16',
      day_first_ms: axis.start_ms + 11 * HOUR, day_last_ms: axis.start_ms + 12 * HOUR },
    { id: 'cc-b', src: 'claude-code', title: 'Per-session ribbons', proj: 'Rexy', model: 'claude-opus-5',
      start: axis.start_ms + 14 * HOUR, end: axis.start_ms + 15 * HOUR, d: '2026-09-16',
      day_first_ms: axis.start_ms + 14 * HOUR, day_last_ms: axis.start_ms + 15 * HOUR },
    { id: 'cc-a', src: 'claude-code', title: 'Contract review', proj: 'render-backend', model: 'claude-opus-5',
      start: axis.start_ms + 9 * HOUR, end: axis.start_ms + 10 * HOUR, d: '2026-09-16',
      day_first_ms: axis.start_ms + 9 * HOUR, day_last_ms: axis.start_ms + 10 * HOUR },
  ],
  events: [
    ev('1', 'cc-a', 9, 'user'), ev('2', 'cc-a', 9.01, 'tool', { ms: 1340 }), ev('3', 'cc-a', 10, 'agent'),
    ev('4', 'cx-a', 11, 'user'), ev('5', 'cx-a', 12, 'tool', { st: 'failed' }),
    ev('cx-a-off', 'cx-a', 11.5, 'tool'),
    ev('6', 'cc-b', 14, 'user'), ev('7', 'cc-b', 15, 'agent'),
  ],
};

describe('day ribbon maths', () => {
  it('clusters by pixel without losing or duplicating events, and stays inside the track', () => {
    const many = Array.from({ length: 500 }, (_, i) => ev(String(i), 'cx-a', (i / 500) * 24, 'tool'));
    const width = 300;
    const clusters = clusterByPixel(many, axis, width);
    expect(clusters.length).toBeLessThanOrEqual(Math.ceil(width / CLUSTER_PX) + 1);
    expect(clusters.flatMap(c => c.events.map(e => e.id)).sort()).toEqual(many.map(e => e.id).sort());
    for (const c of clusters) {
      expect(c.x0).toBeGreaterThanOrEqual(0);
      expect(c.x1).toBeLessThanOrEqual(width);
      expect(c.x1 - c.x0).toBeLessThan(CLUSTER_PX);
    }
  });

  it('positions against the real day length, not 24 hours (23-hour DST day)', () => {
    const short = { ...axis, end_ms: axis.start_ms + 23 * HOUR };
    expect(axisPosition(short.start_ms + 11.5 * HOUR, short)).toBeCloseTo(0.5, 6);
    expect(axisPosition(short.end_ms, short)).toBe(1);
  });

  it('estimates active time from gaps under five minutes, and reports unknown below two events', () => {
    const minute = 60_000;
    const within = [ev('a', 's', 0, 'user'), ev('b', 's', 0, 'tool', { t: axis.start_ms + 2 * minute }),
      ev('c', 's', 0, 'agent', { t: axis.start_ms + 20 * minute })];
    expect(estimatedActiveMs(within)).toBe(2 * minute);   // the 18-minute gap is idle
    expect(estimatedActiveMs([within[0]!])).toBeNull();
  });
});

describe('<SessionRibbons>', () => {
  let root: Root; let container: HTMLDivElement;
  beforeEach(() => {
    vi.mocked(loadEvent).mockClear();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  const render = (data: DayRibbon = ribbon) => act(async () => root.render(<SessionRibbons ribbon={data} />));

  it('gives every session its own ribbon under its agent, in day order', async () => {
    await render();
    const agents = Array.from(container.querySelectorAll<HTMLElement>('.srb-agent'));
    expect(agents.map(a => a.getAttribute('aria-label'))).toEqual(['Claude Code', 'Codex']);
    const titles = (agent: HTMLElement) => Array.from(agent.querySelectorAll('.srb-title')).map(t => t.textContent);
    expect(titles(agents[0]!)).toEqual(['Contract review', 'Per-session ribbons']);
    expect(titles(agents[1]!)).toEqual(['Split day endpoints']);
  });

  it('collapses an agent without touching the other', async () => {
    await render();
    const head = container.querySelector<HTMLButtonElement>('.srb-agent .srb-agent-head')!;
    expect(head.getAttribute('aria-expanded')).toBe('true');
    await act(async () => head.click());
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelectorAll('.srb-row')).toHaveLength(1);
  });

  it('shows an agent with no sessions as empty, not collapsible', async () => {
    await render({ ...ribbon, sessions: ribbon.sessions.filter(s => s.src === 'codex'),
      events: ribbon.events.filter(e => e.src === 'codex') });
    const head = container.querySelector<HTMLButtonElement>('.srb-agent .srb-agent-head')!;
    expect(head.disabled).toBe(true);
    expect(head.textContent).toContain('No sessions on this day');
  });

  it('keeps an unrecorded duration unknown, never zero', async () => {
    const lone: DayRibbon = { ...ribbon, off_axis_event_ids: [],
      sessions: [ribbon.sessions[0]!], events: [ev('9', 'cx-a', 11, 'tool', { ms: null })] };
    await render(lone);
    await act(async () => container.querySelector<HTMLButtonElement>('.srb-mark')!.focus());
    const tip = container.querySelector('[role=tooltip]')!;
    expect(tip.textContent).toContain('not recorded');
    expect(tip.textContent).not.toMatch(/\b0\s?(ms|s)\b/);
  });

  it('counts events outside the display day but does not draw them', async () => {
    await render();
    const codex = container.querySelectorAll<HTMLElement>('.srb-agent')[1]!;
    expect(codex.textContent).toContain('3 events');
    expect(codex.textContent).toContain('1 outside this day');
    // 11:00, 11:30 and 12:00 are each 20 px apart at the fallback width, so a drawn
    // off-axis event would add a third mark.
    expect(codex.querySelectorAll('.srb-mark')).toHaveLength(2);
  });

  it('marks failures with the red class and the ❌ marker', async () => {
    await render();
    const failed = container.querySelector('.srb-mark.failed');
    expect(failed).not.toBeNull();
    expect(failed!.textContent).toContain('❌');
  });

  it('draws individual events in detail mode, preserves off-axis handling and agent collapse', async () => {
    await act(async () => root.render(<SessionRibbons ribbon={ribbon} detailed />));
    expect(container.querySelectorAll('.srb-detail-track .sb')).toHaveLength(7);
    expect(container.querySelectorAll('.srb-tick, .srb-now, .srb-mark')).toHaveLength(0);
    expect(container.querySelector('.sb.fail')?.textContent).toContain('❌');
    expect(container.textContent).toContain('1 outside this day');
    expect(container.textContent).toContain('chronological, not time-spaced');
    const head = container.querySelector<HTMLButtonElement>('.srb-agent-head')!;
    await act(async () => head.click());
    await act(async () => root.render(<SessionRibbons ribbon={ribbon} />));
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelectorAll('.srb-row')).toHaveLength(1);
  });

  it('windows large detailed sessions and retains keyboard access to every event', async () => {
    const events = Array.from({ length: 5000 }, (_, i) => ev(`busy-${i}`, 'cx-a', 11 + i / 10000, 'tool'));
    const onOpen = vi.fn();
    await act(async () => root.render(<SessionRibbons detailed onOpen={onOpen} ribbon={{ ...ribbon,
      off_axis_event_ids: [], sessions: [ribbon.sessions[0]!], events }} />));
    expect(container.querySelectorAll('.sb').length).toBeLessThan(130);
    expect(container.textContent).toContain('5,000 events');
    const first = container.querySelector<HTMLButtonElement>('.sb')!;
    await act(async () => first.focus());
    await act(async () => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect((document.activeElement as HTMLElement).dataset.index).toBe('4999');
    await act(async () => (document.activeElement as HTMLButtonElement).click());
    expect(onOpen).toHaveBeenCalledWith('cx-a');
    expect(container.querySelectorAll('.sb').length).toBeLessThan(130);
  });

  it('loads single-event detail lazily and clears the tooltip when switching back', async () => {
    vi.useFakeTimers(); vi.mocked(loadEvent).mockClear();
    vi.mocked(loadEvent).mockResolvedValue({ id: '5', content: null, tool_input: 'npm test', tool_output: '42 passed', truncated: false });
    const data = { ...ribbon, off_axis_event_ids: [], sessions: [ribbon.sessions[0]!], events: [ev('5', 'cx-a', 12, 'tool')] };
    try {
      await act(async () => root.render(<SessionRibbons ribbon={data} token="browser" detailed />));
      expect(loadEvent).not.toHaveBeenCalled();
      await act(async () => container.querySelector<HTMLButtonElement>('.sb')!.focus());
      await act(async () => vi.advanceTimersByTimeAsync(120));
      expect(loadEvent).toHaveBeenCalledWith('5', 'browser', expect.any(AbortSignal));
      expect(container.querySelector('[role=tooltip]')?.textContent).toContain('42 passed');
      await act(async () => root.render(<SessionRibbons ribbon={data} token="browser" />));
      expect(container.querySelector('[role=tooltip]')).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('loads real tool previews lazily without turning source text into markup', async () => {
    vi.useFakeTimers(); vi.mocked(loadEvent).mockResolvedValue({ id: '5', content: null,
      tool_input: 'npm test <script>unsafe</script>', tool_output: '42 passed', truncated: true });
    try {
      await act(async () => root.render(<SessionRibbons ribbon={{ ...ribbon, off_axis_event_ids: [],
        sessions: [ribbon.sessions[0]!], events: [ev('5', 'cx-a', 12, 'tool')] }} token="browser" />));
      expect(loadEvent).not.toHaveBeenCalled();
      await act(async () => container.querySelector<HTMLButtonElement>('.srb-mark')!.focus());
      await act(async () => vi.advanceTimersByTimeAsync(120));
      expect(loadEvent).toHaveBeenCalledWith('5', 'browser', expect.any(AbortSignal));
      expect(container.querySelector('[role=tooltip]')?.textContent).toContain('42 passed');
      expect(container.querySelector('[role=tooltip]')?.textContent).toContain('Excerpt only');
      expect(container.querySelector('script')).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('previews the actual request before setup context and states that other tool calls exist', async () => {
    const items = [ev('setup', 'cx-a', 11, 'user'), ev('request', 'cx-a', 11.001, 'user'),
      ev('tool-one', 'cx-a', 11.002, 'tool', { n: 'exec' }), ev('tool-two', 'cx-a', 11.003, 'tool', { n: 'exec' })];
    vi.useFakeTimers(); vi.mocked(loadEvent).mockClear();
    vi.mocked(loadEvent).mockImplementation(async id => ({ id, content: id === 'request' ? 'Fix calendar loading' : null,
      tool_input: id === 'tool-one' ? 'npm test' : null, tool_output: null, truncated: false }));
    try {
      await act(async () => root.render(<SessionRibbons token="browser" ribbon={{ ...ribbon, off_axis_event_ids: [],
        sessions: [ribbon.sessions[0]!], events: items }} story={[
          { ...items[0], k: 'user', x: '<environment_context>setup</environment_context>' },
          { ...items[1], k: 'user', x: 'Fix calendar loading' },
        ]} />));
      await act(async () => container.querySelector<HTMLButtonElement>('.srb-mark')!.focus());
      await act(async () => vi.advanceTimersByTimeAsync(120));
      expect(vi.mocked(loadEvent).mock.calls.map(call => call[0])).toEqual(['request', 'tool-one']);
      const tip = container.querySelector('[role=tooltip]')!;
      expect(tip.textContent).toContain('Run script (exec) ×2');
      expect(tip.textContent).toContain('Previewing 1 of 2 tool calls');
      expect(tip.textContent).toContain('Fix calendar loading');
    } finally { vi.useRealTimers(); }
  });
});

describe('stub', () => {
  it('is deterministic per day and follows the contract shapes', () => {
    const a = stubDayRibbon('2026-09-16');
    expect(stubDayRibbon('2026-09-16')).toEqual(a);
    expect(stubDayRibbon('2026-09-17')).not.toEqual(a);
    const ids = new Set(a.sessions.map(s => s.id));
    for (const e of a.events) {
      expect(typeof e.id).toBe('string');
      expect(ids.has(e.s)).toBe(true);
      expect(e.t).toBeGreaterThanOrEqual(a.axis.start_ms);
      expect(e.t).toBeLessThan(a.axis.end_ms);
      if (e.src === 'codex') expect(e.ms).toBeNull();
      if (e.k !== 'tool') expect(e.st).toBe('unknown');
    }
  });
});
