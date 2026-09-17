import { isFailed, isSucceeded, type Ev, type Tool } from './data';

export function percentile(sorted: number[], fraction: number): number | null {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * fraction, lower = Math.floor(i), upper = Math.ceil(i);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (i - lower);
}

export function toolStats(events: Ev[]): Tool[] {
  const groups = new Map<string, { durations: number[]; count: number; ok: number; fail: number }>();
  for (const e of events) {
    if (e.k !== 'tool') continue;
    const name = e.n || 'Unknown tool';
    const group = groups.get(name) ?? { durations: [], count: 0, ok: 0, fail: 0 };
    group.count++; group.ok += Number(isSucceeded(e.st)); group.fail += Number(isFailed(e.st));
    if (e.src === 'claude-code' && e.ms != null && Number.isFinite(e.ms) && e.ms >= 0) group.durations.push(e.ms);
    groups.set(name, group);
  }
  return [...groups].map(([name, g]) => {
    g.durations.sort((a, b) => a - b);
    return { name, count: g.count, ok: g.ok, fail: g.fail, p50: percentile(g.durations, .5),
      p90: percentile(g.durations, .9), max: g.durations.at(-1) ?? null };
  }).sort((a, b) => b.count - a.count);
}

/** Union of within-session gaps under five minutes: concurrent agents aren't double-counted. */
export function activeTime(events: Ev[]): number | null {
  const sessions = new Map<string, number[]>();
  for (const e of events) {
    const values = sessions.get(e.s) ?? []; values.push(e.t); sessions.set(e.s, values);
  }
  const intervals: [number, number][] = [];
  let measurable = false;
  for (const values of sessions.values()) {
    values.sort((a, b) => a - b); measurable ||= values.length > 1;
    for (let i = 1; i < values.length; i++) {
      const gap = values[i] - values[i - 1];
      if (gap > 0 && gap < 300000) intervals.push([values[i - 1], values[i]]);
    }
  }
  if (!measurable) return null;
  intervals.sort((a, b) => a[0] - b[0]);
  let total = 0, end = -Infinity;
  for (const [a, b] of intervals) { total += Math.max(0, b - Math.max(a, end)); end = Math.max(end, b); }
  return total;
}
