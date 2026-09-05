import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Timeline from './Timeline';
import type { Ev, Story } from '../data';

describe('deterministic intervention labels', () => {
  it('shows a corrective prompt as a repeat and lists tool work mechanically', () => {
    const story: Story[] = [{
      t: 100, d: '2026-09-04', s: 'session-1', src: 'codex', k: 'user',
      x: 'No, I asked you to put every tool call in the ribbon.',
    }];
    const events: Ev[] = [
      { t: 101, d: '2026-09-04', s: 'session-1', src: 'codex', k: 'tool', st: 'succeeded', n: 'Edit' },
      { t: 102, d: '2026-09-04', s: 'session-1', src: 'codex', k: 'tool', st: 'failed', n: 'Bash' },
    ];

    const html = renderToStaticMarkup(<Timeline story={story} events={events} onOpen={() => {}} />);

    expect(html).toContain('you had to repeat yourself');
    expect(html).toContain('Edit ×1');
    expect(html).toContain('Bash ×1');
    expect(html).toContain('1 failed');
  });
});
