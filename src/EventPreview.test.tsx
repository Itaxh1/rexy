// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EventPreview from './EventPreview';
import type { EventDetail } from './data';
vi.mock('./api', () => ({ loadEvent: vi.fn() }));
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const render = (detail: EventDetail, kind: 'user' | 'tool', allowRaw = false) => act(async () => root.render(
  <EventPreview id={detail.id} kind={kind} toolName="exec" token={null} allowRaw={allowRaw} cache={new Map([[detail.id, detail]])} />));

it('labels injected context honestly and keeps the raw text collapsed in the inspector', async () => {
  await render({ id: 'setup', content: '<environment_context><cwd>/private/project</cwd></environment_context>',
    tool_input: null, tool_output: null, truncated: true }, 'user', true);
  expect(container.querySelector('.tip-preview > b')?.textContent).toBe('Session setup');
  expect(container.querySelector('.tip-preview > p')?.textContent).toContain('not a user request');
  expect(container.querySelector('details')?.open).toBe(false);
  expect(container.querySelector('details pre')?.textContent).toContain('/private/project');
});

it('shows command and result labels instead of exec transport JSON', async () => {
  await render({ id: 'tool', content: null, truncated: false,
    tool_input: 'const r = await tools.exec_command({cmd:"npm test"}); text(r);',
    tool_output: JSON.stringify([{ type: 'input_text', text: JSON.stringify({ output: '42 tests passed', chunk_id: 'opaque' }) }]) }, 'tool');
  expect(container.textContent).toContain('Run script (exec)Commandnpm testResult42 tests passed');
  expect(container.textContent).not.toContain('chunk_id');
  expect(container.textContent).not.toContain('input_text');
});

it('renders prompts as text, never HTML', async () => {
  await render({ id: 'prompt', content: 'Fix <script>alert(1)</script>', tool_input: null, tool_output: null, truncated: false }, 'user');
  expect(container.textContent).toContain('Your promptFix <script>');
  expect(container.querySelector('script')).toBeNull();
});
