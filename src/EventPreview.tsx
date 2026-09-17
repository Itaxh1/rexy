import { useEffect, useState } from 'react';
import { loadEvent } from './api';
import type { EventDetail } from './data';
import { isSetupText } from './sessionTitle';
import { toolInput, toolLabel, toolOutput } from './eventPresentation';

/** Fetch text only for a hovered/focused or explicitly expanded event. */
export default function EventPreview({ id, token, cache, kind, toolName, allowRaw = false }: {
  id: string; token: string | null; cache: Map<string, EventDetail>; kind: 'user' | 'agent' | 'tool';
  toolName?: string | null; allowRaw?: boolean;
}) {
  const [detail, setDetail] = useState<EventDetail | null>(cache.get(id) ?? null);
  const [pending, setPending] = useState(Boolean(token && !detail));
  useEffect(() => {
    if (!token || cache.has(id)) return;
    let active = true;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      loadEvent(id, token, abort.signal).then(value => {
        if (!active) return;
        if (cache.size >= 100) cache.delete(cache.keys().next().value!);
        cache.set(id, value); setDetail(value);
      }).catch(() => {}).finally(() => { if (active) setPending(false); });
    }, 120);
    return () => { active = false; clearTimeout(timer); abort.abort(); };
  }, [id, token, cache]);
  const clip = (text: string) => text.length > 700 ? text.slice(0, 700) + '…' : text;
  const setup = kind === 'user' && Boolean(detail?.content && isSetupText(detail.content));
  const input = detail?.tool_input ? toolInput(detail.tool_input) : null;
  const output = detail?.tool_output ? toolOutput(detail.tool_output) : null;
  return <div className="tip-preview">
    <b>{setup ? 'Session setup' : kind === 'user' ? 'Your prompt' : kind === 'agent' ? 'Agent response' : toolLabel(toolName)}</b>
    {setup ? <p>Workspace instructions or environment context, not a user request.</p> : detail?.content && <p>{clip(detail.content)}</p>}
    {input && <><p className="srmeta">{input.label}</p><pre>{clip(input.text)}</pre></>}
    {detail?.tool_output && <><p className="srmeta">Result</p>
      {output ? <pre>{clip(output)}</pre> : <p>No readable result in this excerpt. Open the session for raw details.</p>}</>}
    {!detail?.content && !detail?.tool_input && !detail?.tool_output && <p>{pending ? 'Loading preview…' : 'Preview not recorded.'}</p>}
    {detail?.truncated && <p className="srmeta">Excerpt only; source record was larger.</p>}
    {allowRaw && detail && <details><summary>Raw recorded details</summary>
      {[detail.content, detail.tool_input, detail.tool_output].filter(Boolean).map((value, index) => <pre key={index}>{value}</pre>)}
    </details>}
  </div>;
}
