import { expect, it } from 'vitest';
import { sessionTitle } from './sessionTitle';
import type { Sess, Story } from './data';

const session: Sess = { id: 's', src: 'codex', title: '# AGENTS.md instructions <INSTRUCTIONS> <!-- context7 --> Use Context7 MCP',
  proj: 'interface.ai', model: null, start: 0, end: 1, d: '2026-09-16' };
const prompt = (x: string, t = 1, s = session.id): Story => ({ x, t, s, d: session.d, src: session.src, k: 'user' });

it('keeps a meaningful source title, including requests to edit instruction files', () => {
  expect(sessionTitle({ ...session, title: 'Fix Google sign-in', summary: 'Other summary.' })).toBe('Fix Google sign-in');
  expect(sessionTitle({ ...session, title: 'Update AGENTS.md instructions for tests' })).toBe('Update AGENTS.md instructions for tests');
});

it('replaces injected titles with an existing TLDR without an extra model call', () => {
  expect(sessionTitle({ ...session, summary: 'Fixed dashboard loading and session ribbons.' }))
    .toBe('Fixed dashboard loading and session ribbons.');
});

it('uses the earliest meaningful user request from this session, skipping setup and acknowledgements', () => {
  expect(sessionTitle(session, [prompt('Fix someone else’s bug', 0, 'other'),
    prompt('Add calendar caching', 5), prompt('<environment_context>setup</environment_context>', 1),
    prompt('continue', 2), prompt('Fix slow dashboard loading', 3),
    { ...prompt('Agent said this', 0), k: 'agent' }])).toBe('Fix slow dashboard loading');
});

it('never promotes truncated setup instructions into a session name', () => {
  for (const title of [session.title, '<INSTRUCTIONS>Use Context7', '<environment_context>cwd',
    '<system-reminder>setup', '# CLAUDE.md instructions', 'Untitled session', '']) {
    expect(sessionTitle({ ...session, title })).toBe('interface.ai session');
  }
  expect(sessionTitle({ ...session, proj: 'Unknown project' })).toBe('Codex session');
});

it('cleans Markdown headings and bounds long names without mutating stored data', () => {
  const value = { ...session, title: '# ' + 'Improve dashboard loading performance '.repeat(8) };
  const title = sessionTitle(value);
  expect(title.startsWith('Improve dashboard')).toBe(true);
  expect(title.length).toBeLessThanOrEqual(96);
  expect(title.endsWith('…')).toBe(true);
  expect(value.title.startsWith('# ')).toBe(true);
});
