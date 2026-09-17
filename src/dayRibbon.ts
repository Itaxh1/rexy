import type { Ev, Sess, Src } from './data';

/** Wire shapes from the day-ribbon contract (V2/plan-day-loading.md §7.2).
 *  IDs and revisions are strings: real IDs exceed Number.MAX_SAFE_INTEGER. */
export type ToolStatus = 'unknown' | 'running' | 'succeeded' | 'failed' | 'interrupted' | 'canceled';

export interface RibbonEvent {
  id: string;
  t: number;
  d: string;
  src: Src;
  s: string;
  k: 'user' | 'agent' | 'tool';
  st: ToolStatus;
  n: string | null;
  ms: number | null;   // null = not recorded. Never render as zero.
}

export interface SessionHeader {
  id: string;
  src: Src;
  title: string;
  proj: string;
  model: string | null;
  start: number;         // whole session, may precede this day
  end: number;           // last observed, may follow this day
  d: string;
  day_first_ms: number;
  day_last_ms: number;
}

export interface RibbonAxis { timezone: string; start_ms: number; end_ms: number }

export interface DayRibbon {
  date: string;
  axis: RibbonAxis;
  off_axis_event_ids: string[];
  sessions: SessionHeader[];
  events: RibbonEvent[];
}

/** Only adapts real loaded events (or the explicit demo fixture), never invents sessions. */
export function ribbonFromEvents(day: string, sessions: Sess[], events: Ev[]): DayRibbon {
  const axis = localDayAxis(day);
  const rows = events.map((e, i): RibbonEvent => ({ ...e, id: e.id ?? 'demo-' + i,
    n: e.n ?? null, ms: e.ms ?? null,
    st: e.st === 'ok' ? 'succeeded' : e.st === 'fail' ? 'failed' : e.st === 'run' ? 'running' : e.st }));
  return { date: day, axis, events: rows,
    off_axis_event_ids: rows.filter(e => e.t < axis.start_ms || e.t >= axis.end_ms).map(e => e.id),
    sessions: sessions.map(s => {
      const times = rows.filter(e => e.s === s.id).map(e => e.t);
      return { ...s, day_first_ms: times.length ? Math.min(...times) : s.start,
        day_last_ms: times.length ? Math.max(...times) : s.end };
    }) };
}

/** Pixel pitch of one clustered mark. Events closer than this merge. */
export const CLUSTER_PX = 6;

/** Gaps at or above this are idle, not work (§7.7). */
export const IDLE_GAP_MS = 5 * 60_000;

/** Position within the day's REAL interval. A DST day is 23 or 25 hours, so this
 *  divides by end − start, never by a fixed 86,400,000 ms. */
export const axisPosition = (t: number, axis: RibbonAxis) =>
  (t - axis.start_ms) / (axis.end_ms - axis.start_ms);

export interface Cluster {
  key: string;
  x0: number;
  x1: number;
  t0: number;
  t1: number;
  events: RibbonEvent[];
  prompts: number;
  responses: number;
  actions: number;
  failed: number;
  running: number;
}

/** Groups events whose positions fall within one CLUSTER_PX cell of the cluster's
 *  first event. Anchoring on the first event (not chaining) caps each cluster's
 *  width, so a dense two-hour burst reads as a textured block of ~10-minute marks
 *  rather than one opaque slab. Display-only: counts always come from events. */
export function clusterByPixel(events: RibbonEvent[], axis: RibbonAxis, width: number, cell = CLUSTER_PX): Cluster[] {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  const out: Cluster[] = [];
  let current: Cluster | null = null;
  for (const ev of sorted) {
    const x = Math.max(0, Math.min(width, axisPosition(ev.t, axis) * width));
    if (!current || x - current.x0 >= cell) {
      current = { key: ev.id, x0: x, x1: x, t0: ev.t, t1: ev.t, events: [],
        prompts: 0, responses: 0, actions: 0, failed: 0, running: 0 };
      out.push(current);
    }
    current.x1 = x;
    current.t1 = ev.t;
    current.events.push(ev);
    if (ev.k === 'user') current.prompts++;
    else if (ev.k === 'agent') current.responses++;
    else {
      current.actions++;
      if (ev.st === 'failed') current.failed++;
      if (ev.st === 'running') current.running++;
    }
  }
  return out;
}

/** Sum of gaps under five minutes between consecutive events in ONE session.
 *  Explicitly an estimate; null when fewer than two events give nothing to measure. */
export function estimatedActiveMs(events: RibbonEvent[]): number | null {
  if (events.length < 2) return null;
  const times = events.map(e => e.t).sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < times.length; i++) {
    const gap = times[i]! - times[i - 1]!;
    if (gap > 0 && gap < IDLE_GAP_MS) total += gap;
  }
  return total;
}

/** Axis for a calendar day in the browser's zone. Local Date arithmetic resolves
 *  the real midnights, so DST days come out 23 or 25 hours long. */
export function localDayAxis(day: string): RibbonAxis {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    start_ms: new Date(y, m - 1, d).getTime(),
    end_ms: new Date(y, m - 1, d + 1).getTime(),
  };
}

export interface Tick { ms: number; pos: number; label: string; edge?: 'start' | 'end' }

/** Every third local hour, plus the day's final minute. */
export function axisTicks(axis: RibbonAxis): Tick[] {
  const base = new Date(axis.start_ms);
  const fmt = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: undefined })
    .replace(':00', '');
  const ticks: Tick[] = [];
  for (let h = 0; h < 24; h += 3) {
    const ms = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h).getTime();
    if (ms < axis.start_ms || ms >= axis.end_ms) continue;
    ticks.push({ ms, pos: axisPosition(ms, axis), label: fmt(ms), edge: h === 0 ? 'start' : undefined });
  }
  const last = axis.end_ms - 60_000;
  ticks.push({ ms: last, pos: 1, label: new Date(last).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), edge: 'end' });
  return ticks;
}
