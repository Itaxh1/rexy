import { describe, expect, it } from 'vitest';
import { health, successRate } from './data';

describe('dashboard status math', () => {
  it('keeps an idle day neutral and labels failure thresholds honestly', () => {
    expect(health()).toBe('idle');
    expect(health({ sessions: 1, events: 3, tools: 2, ok: 2, fail: 0 })).toBe('ok');
    expect(health({ sessions: 1, events: 3, tools: 2, ok: 1, fail: 1 })).toBe('outage');
  });

  it('excludes calls with unknown outcomes from the success denominator', () => {
    expect(successRate([{ sessions: 1, events: 8, tools: 8, ok: 3, fail: 1 }])).toBe(75);
    expect(successRate([{ sessions: 1, events: 4, tools: 4, ok: 0, fail: 0 }])).toBeNull();
  });
});
