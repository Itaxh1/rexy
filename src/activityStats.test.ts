import { expect, it } from 'vitest';
import { activeTime, percentile, toolStats } from './activityStats';
import type { Ev } from './data';
const event = (s: string, t: number): Ev => ({ s, t, d: '2026-09-04', src: 'codex', k: 'tool', st: 'unknown', n: 'Read' });
it('uses interpolated percentiles and keeps unavailable durations null', () => {
  expect(percentile([10, 20], .5)).toBe(15); expect(percentile([10, 20], .9)).toBe(19);
  expect(toolStats([event('a', 1)])[0].max).toBeNull();
  expect(toolStats([{ ...event('a', 1), src: 'claude-code', ms: 0 }])[0].max).toBe(0);
});
it('unions activity within sessions, without bridging unrelated sessions', () => {
  expect(activeTime([event('a', 0), event('b', 60000)])).toBeNull();
  expect(activeTime([event('a', 0), event('a', 120000), event('b', 60000), event('b', 180000)])).toBe(180000);
});
