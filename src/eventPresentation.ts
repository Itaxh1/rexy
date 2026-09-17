/** Read-only presentation of known transcript wrappers. Never evaluate tool code. */
export function toolLabel(name?: string | null): string {
  const short = name?.split('.').at(-1) ?? '';
  return ({ exec: 'Run script (exec)', exec_command: 'Run command (exec_command)',
    write_stdin: 'Process input (write_stdin)' } as Record<string, string>)[short] ?? name ?? 'Tool';
}

export function toolInput(text: string): { label: string; text: string } {
  try {
    const args = JSON.parse(text);
    for (const key of ['cmd', 'command', 'file_path', 'path', 'pattern', 'query']) {
      if (typeof args?.[key] === 'string') return { label: ['cmd', 'command'].includes(key) ? 'Command'
        : ['file_path', 'path'].includes(key) ? 'File' : 'Input', text: args[key] };
    }
  } catch { /* A script or plain-text input, not JSON. */ }
  // Known exec wrappers contain JSON-compatible string literals. Do not interpret
  // single quotes, template interpolation, expressions, or arbitrary JavaScript.
  if (/\bexec_command\s*\(/.test(text)) {
    const commands = [...text.matchAll(/\b(?:cmd|command)\s*:\s*("(?:[^"\\]|\\.)*")/g)]
      .slice(0, 4).flatMap(match => { try { return [JSON.parse(match[1]) as string]; } catch { return []; } });
    if (commands.length) return { label: commands.length === 1 ? 'Command' : 'Commands', text: commands.join('\n') };
  }
  return { label: /\b(?:await|const|tools\.)\b/.test(text) ? 'Script' : 'Input', text };
}

export function toolOutput(text: string, depth = 0): string | null {
  if (depth >= 5) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (Array.isArray(value)) {
      const parts = value.flatMap(item => typeof item?.text === 'string' ? [toolOutput(item.text, depth + 1)] : []);
      if (parts.length) return parts.filter(Boolean).join('\n') || null;
    } else if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (typeof obj.output === 'string') return toolOutput(obj.output, depth + 1);
      if (typeof obj.text === 'string') return toolOutput(obj.text, depth + 1);
      if (Array.isArray(obj.content)) return toolOutput(JSON.stringify(obj.content), depth + 1);
      const streams = [obj.stdout, obj.stderr].filter((item): item is string => typeof item === 'string');
      if (streams.length) return streams.join('\n');
    }
  } catch { /* Truncated JSON is not enough evidence to reconstruct the result. */ }
  if (/^\s*\[\s*\{\s*"type"\s*:\s*"(?:input_text|text)"/.test(text)) return null;
  const output = text.indexOf('\nOutput:');
  return (output >= 0 && /^(?:Script completed|Wall time|Chunk ID)/.test(text)
    ? text.slice(output + '\nOutput:'.length) : text).trim() || null;
}
