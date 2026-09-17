import { expect, it } from 'vitest';
import { toolInput, toolLabel, toolOutput } from './eventPresentation';

it('shows commands and paths instead of raw argument objects', () => {
  expect(toolInput('{"command":"npm test","timeout":120}')).toEqual({ label: 'Command', text: 'npm test' });
  expect(toolInput('{"file_path":"src/App.tsx"}')).toEqual({ label: 'File', text: 'src/App.tsx' });
  expect(toolInput('const r = await tools.exec_command({cmd:"pwd; rg --files",max_output_tokens:4000}); text(r);'))
    .toEqual({ label: 'Command', text: 'pwd; rg --files' });
});

it('unwraps tool text blocks and nested output without exposing transport metadata', () => {
  const output = JSON.stringify([{ type: 'input_text', text: 'Script completed\nWall time: 0.2 seconds\nOutput:\n' },
    { type: 'input_text', text: JSON.stringify({ chunk_id: 'abc', exit_code: 0, output: '42 tests passed' }) }]);
  expect(toolOutput(output)).toBe('42 tests passed');
  expect(toolOutput('42 passed')).toBe('42 passed');
});

it('does not guess the contents of incomplete wrappers or execute source strings', () => {
  expect(toolOutput('[{"type":"input_text","text":"truncated')).toBeNull();
  expect(toolInput('await tools.exec_command({cmd: getSecret()})').text).toContain('getSecret()');
  expect(toolLabel('functions.exec')).toBe('Run script (exec)');
  expect(toolLabel('Read')).toBe('Read');
});
