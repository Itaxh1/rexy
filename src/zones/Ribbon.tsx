import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { loadEvent } from '../api';
import { CORRECTIVE, isFailed, isRunning, isSucceeded, SOURCES, fmtMs, type Ev, type EventDetail, type Sess, type Src, type Story } from '../data';

/** Uniform bars in chronological order, one per event — the status-page pattern.
 *  Time-proportional placement left ~80% of a typical day empty and packed every
 *  event into an unhittable 100px band; sequence layout gives every event the same
 *  width and a real hit target, and overflow scrolls instead of compressing. */
export default function Ribbon({
  events, sessions, story = [], token = null, onOpen,
}: { day: string; events: Ev[]; sessions: Sess[]; story?: Story[]; token?: string | null; onOpen: (id: string) => void }) {
  const [tip, setTip] = useState<{ ev: Ev; x: number; y: number } | null>(null);
  const tipId = useId();
  const previews = useRef(new Map<string, EventDetail>());
  useEffect(() => { previews.current.clear(); setTip(null); }, [token, events]);
  const scroller = useRef<HTMLDivElement>(null);
  const corrections = useMemo(() => new Set(story.filter(item => item.k === 'user' && CORRECTIVE.test(item.x.slice(0, 300)))
    .map(item => `${item.s}:${item.t}`)), [story]);
  const marker = (ev: Ev) => isFailed(ev.st) ? '❌' : ev.st === 'interrupted' ? '🛑'
    : ev.k === 'user' && corrections.has(`${ev.s}:${ev.t}`) ? '🔄' : null;

  const lanes = useMemo(() => {
    const m: Record<Src, Ev[]> = { 'claude-code': [], codex: [] };
    for (const e of events) m[e.src]?.push(e);
    return m;
  }, [events]);

  if (!events.length) {
    return <div className="panel"><div className="empty">Nothing happened on this day.</div></div>;
  }

  const widest = Math.max(...SOURCES.map(s => lanes[s.id].length));

  return (
    <div className="panel">
      {SOURCES.map(src => {
        const evs = lanes[src.id];
        const fails = evs.filter(e => isFailed(e.st)).length;
        return (
          <div className="sl" key={src.id}>
            <div className="slh">
              <i className="chip" style={{ background: `var(${src.varName})` }} />
              <b>{src.label}</b>
              <span>{evs.length.toLocaleString()} events</span>
              <em>{fails ? `${fails} failed` : evs.length ? 'no recorded failures' : 'no activity'}</em>
            </div>
            <div className="slbars" ref={src.id === 'claude-code' ? scroller : undefined}
                 onScroll={e => {
                   setTip(null);
                   // Lanes scroll together so the two are always comparable.
                   const x = e.currentTarget.scrollLeft;
                   document.querySelectorAll<HTMLElement>('.slbars').forEach(n => {
                     if (n !== e.currentTarget) n.scrollLeft = x;
                   });
                 }}>
              <div className="slinner" style={{ minWidth: widest * 10 }}>
                {evs.map((ev, i) => (
                  <button
                    key={i}
                    className={`sb ${isFailed(ev.st) ? 'fail' : isRunning(ev.st) ? 'running' : ev.k}`}
                    onMouseEnter={e => setTip({ ev, x: e.clientX, y: e.clientY })}
                    onMouseMove={e => setTip({ ev, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTip(null)}
                    onFocus={e => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setTip({ ev, x: r.left, y: r.bottom });
                    }}
                    onBlur={() => setTip(null)}
                    onClick={() => onOpen(ev.s)}
                    onKeyDown={e => { if (e.key === 'Escape') setTip(null); }}
                    aria-describedby={tip?.ev === ev ? tipId : undefined}
                    aria-label={`${label(ev)}${marker(ev) === '🔄' ? ' · possible correction' : ''}`}
                  >{marker(ev) && <span className="ribbon-marker" aria-hidden="true">{marker(ev)}</span>}</button>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      <div className="rkey">
        <span><i style={{ background: 'var(--user)' }} />You asked</span>
        <span><i style={{ background: 'var(--agent)' }} />Agent replied</span>
        <span><i style={{ background: 'var(--tool)' }} />Action</span>
        <span><i style={{ background: 'var(--crit)' }} />Action failed</span>
        <span style={{ marginLeft: 'auto' }}>Scroll sideways to see the whole day</span>
      </div>

      {tip && (
        <EventTooltip key={tip.ev.id ?? `${tip.ev.s}:${tip.ev.t}:${tip.ev.k}`} id={tipId} tip={tip}
          session={sessions.find(s => s.id === tip.ev.s)} token={token} cache={previews.current}
          text={story.find(item => item.s === tip.ev.s && item.t === tip.ev.t && item.k === tip.ev.k)?.x} />
      )}
    </div>
  );
}

function EventTooltip({ id, tip, session, token, cache, text }: {
  id: string; tip: { ev: Ev; x: number; y: number }; session?: Sess;
  token: string | null; cache: Map<string, EventDetail>; text?: string;
}) {
  const { ev } = tip;
  const [detail, setDetail] = useState<EventDetail | null>(() => ev.id ? cache.get(ev.id) ?? null : null);
  const [pending, setPending] = useState(Boolean(token && ev.id && !detail));
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  useEffect(() => {
    if (!token || !ev.id || cache.has(ev.id)) return;
    let active = true;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      loadEvent(ev.id!, token, abort.signal).then(value => {
        if (!active) return;
        if (cache.size >= 100) cache.delete(cache.keys().next().value!);
        cache.set(ev.id!, value); setDetail(value);
      }).catch(() => { /* Missing previews do not prevent metadata inspection. */ })
        .finally(() => { if (active) setPending(false); });
    }, 120);
    return () => { active = false; clearTimeout(timer); abort.abort(); };
  }, [ev.id, token, cache]);
  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const top = tip.y + 16 + rect.height > innerHeight - 8 ? tip.y - rect.height - 12 : tip.y + 16;
    setPosition({ left: Math.max(8, Math.min(tip.x + 16, innerWidth - rect.width - 8)), top: Math.max(8, top) });
  }, [tip.x, tip.y, detail, pending, text]);
  const content = detail?.content || text;
  const clipped = (value: string) => value.length > 500 ? `${value.slice(0, 500)}…` : value;
  return <div ref={ref} id={id} role="tooltip" className="tip event-tip" style={position}>
    <div className="h">{label(ev)}</div>
    <dl>
      <dt>Time</dt><dd>{new Date(ev.t).toLocaleTimeString()}</dd>
      <dt>Session</dt><dd>{session?.title ?? '—'}</dd>
      {ev.ms != null && <><dt>Took</dt><dd>{fmtMs(ev.ms)}</dd></>}
    </dl>
    {ev.k === 'tool' ? <>
      {detail?.tool_input && <div className="tip-preview"><b>Input</b><pre>{clipped(detail.tool_input)}</pre></div>}
      {(detail?.tool_output || content) && <div className="tip-preview"><b>Result</b><pre>{clipped(detail?.tool_output || content!)}</pre></div>}
      {!detail?.tool_input && !detail?.tool_output && !content && <p>{pending ? 'Loading tool details…' : 'Tool preview unavailable.'}</p>}
    </> : <div className="tip-preview"><b>{ev.k === 'user' ? 'Your prompt' : 'Agent response'}</b>
      <p>{content ? clipped(content) : pending ? 'Loading preview…' : 'Text preview unavailable.'}</p></div>}
    {detail?.truncated && <p className="srmeta">Excerpt only; source record was larger.</p>}
    <div className="f">Click to open this session</div>
  </div>;
}

const label = (e: Ev) =>
  e.k === 'tool' ? `${e.n ?? 'Action'} — ${isFailed(e.st) ? 'failed' : isSucceeded(e.st) ? 'worked' : e.st}`
  : e.k === 'user' ? 'You asked for something' : 'Agent replied';
