import { useEffect, useState } from 'react';
import { loadEvent } from './api';
import type { EventDetail } from './data';

/** Fetch text only for a hovered/focused or explicitly expanded event. */
export default function EventPreview({ id, token, cache, kind }: {
  id: string; token: string | null; cache: Map<string, EventDetail>; kind: 'user' | 'agent' | 'tool';
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
  return <div className="tip-preview">
    <b>{kind === 'user' ? 'Your prompt' : kind === 'agent' ? 'Agent response' : 'Tool details'}</b>
    {detail?.content && <p>{clip(detail.content)}</p>}
    {detail?.tool_input && <pre>{clip(detail.tool_input)}</pre>}
    {detail?.tool_output && <pre>{clip(detail.tool_output)}</pre>}
    {!detail?.content && !detail?.tool_input && !detail?.tool_output && <p>{pending ? 'Loading preview…' : 'Preview not recorded.'}</p>}
    {detail?.truncated && <p className="srmeta">Excerpt only; source record was larger.</p>}
  </div>;
}
