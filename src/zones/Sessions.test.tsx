import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Sessions from './Sessions';
import type { Ev, Sess } from '../data';

const session: Sess = {
  id: '7', src: 'codex', title: 'Timeline tools', proj: 'rexy', model: 'gpt-5',
  start: 1_788_537_600_000, end: 1_788_537_660_000, d: '2026-09-04',
  summary: 'Recorded every tool invocation in the selected-day ribbon.',
  summary_state: 'ready',
};

const events: Ev[] = [
  { t: session.start, d: session.d, src: 'codex', s: session.id, k: 'user', st: 'succeeded' },
  { t: session.start + 1, d: session.d, src: 'codex', s: session.id, k: 'tool', st: 'failed', n: 'Bash' },
];

describe('session list', () => {
  it('renders backend summary, tool count, failure state, and model', () => {
    const html = renderToStaticMarkup(
      <Sessions sessions={[session]} events={events} onOpen={() => {}} onSummarize={async () => {}} />,
    );
    expect(html).toContain('Recorded every tool invocation');
    expect(html).toContain('1 failed');
    expect(html).toContain('<dd>1</dd>');
    expect(html).toContain('gpt-5');
  });

  it('offers an explicit summary action for older sessions', () => {
    const html = renderToStaticMarkup(
      <Sessions sessions={[{ ...session, summary: null, summary_state: 'not_requested' }]} events={events} onOpen={() => {}} onSummarize={async () => {}} />,
    );
    expect(html).toContain('Load summary');
  });
});
