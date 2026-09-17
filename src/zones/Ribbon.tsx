import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadEvent } from '../api';
import { CORRECTIVE, isFailed, isRunning, isSucceeded, SOURCES, fmtMs, type Ev, type EventDetail, type Sess, type Src, type Story } from '../data';
import { toolInput, toolLabel, toolOutput } from '../eventPresentation';
import { isSetupText } from '../sessionTitle';

/** Uniform bars in chronological order, one per event — the status-page pattern.
 *  Time-proportional placement left ~80% of a typical day empty and packed every
 *  event into an unhittable 100px band; sequence layout gives every event the same
 *  width and a real hit target, and overflow scrolls instead of compressing. */
export const PITCH = 10; // .sb flex-basis 7px + .slinner gap 3px

/** Bars sit in chronological sequence, so time is not linear across the strip.
 *  Ticks are placed at the first event of each hour, and thinned so labels never
 *  collide — an hour with no activity simply has no tick. */
function hourTicks(events: Ev[]) {
  const out: { hour: number; index: number; label: string }[] = [];
  let lastHour = -1, lastIndex = -Infinity;
  events.forEach((ev, i) => {
    const hour = new Date(ev.t).getHours();
    if (hour === lastHour) return;
    lastHour = hour;
    if (i - lastIndex < 5) return;            // keep labels ~50px apart
    lastIndex = i;
    out.push({ hour, index: i, label: `${String(hour).padStart(2, '0')}:00` });
  });
  return out;
}

export default function Ribbon({
  events, sessions, story = [], token = null, onOpen,
}: { day: string; events: Ev[]; sessions: Sess[]; story?: Story[]; token?: string | null; onOpen: (id: string) => void }) {
  const [tip, setTip] = useState<{ ev: Ev; x: number; y: number } | null>(null);
  const tipId = useId();
  const previews = useRef(new Map<string, EventDetail>());
  useEffect(() => { previews.current.clear(); setTip(null); }, [token, events]);
  const corrections = useMemo(() => new Set(story.filter(item => item.k === 'user' && CORRECTIVE.test(item.x.slice(0, 300)))
    .map(item => `${item.s}:${item.t}`)), [story]);
  const marker = (ev: Ev) => ev.k === 'tool' && isFailed(ev.st) ? '❌' : ev.st === 'interrupted' ? '🛑'
    : ev.k === 'user' && corrections.has(`${ev.s}:${ev.t}`) ? '🔄' : null;

  const lanes = useMemo(() => {
    const m: Record<Src, Ev[]> = { 'claude-code': [], codex: [] };
    for (const e of events) m[e.src]?.push(e);
    for (const lane of Object.values(m)) lane.sort((a, b) => a.t - b.t);
    return m;
  }, [events]);

  if (!events.length) {
    return <div className="panel"><div className="empty">Nothing happened on this day.</div></div>;
  }

  return (
    <div className="panel overall-ribbons" role="region" aria-label="Overall agent ribbons">
      {SOURCES.map(src => {
        const evs = lanes[src.id];
        const fails = evs.filter(e => e.k === 'tool' && isFailed(e.st)).length;
        const count = new Set(evs.map(e => e.s)).size;
        return (
          <div className="sl" key={src.id} role="group" aria-label={`${src.label} overall activity`}>
            <div className="slh">
              <i className="chip" style={{ background: `var(${src.varName})` }} />
              <b>{src.label}</b>
              <span>{evs.length.toLocaleString()} events · {count} {count === 1 ? 'session' : 'sessions'}</span>
              <em>{fails ? `${fails} failed` : evs.length ? 'no recorded failures' : 'no activity'}</em>
            </div>
            <EventLane events={evs} onScroll={() => setTip(null)} renderEvent={(ev, i, tabIndex) => (
                  <button
                    key={ev.id ?? i} data-index={i} tabIndex={tabIndex}
                    className={`sb ${ev.k === 'tool' && isFailed(ev.st) ? 'fail' : ev.k === 'tool' && isRunning(ev.st) ? 'running' : ev.k}`}
                    style={{ left: i * PITCH }}
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
                )} />
          </div>
        );
      })}

      <div className="rkey">
        <span><i style={{ background: 'var(--user)' }} />You asked</span>
        <span><i style={{ background: 'var(--agent)' }} />Agent replied</span>
        <span><i style={{ background: 'var(--tool)' }} />Action</span>
        <span><i style={{ background: 'var(--crit)' }} />Action failed</span>
        <span style={{ marginLeft: 'auto' }}>Chronological order, not time-spaced · scroll each row for more</span>
      </div>

      {tip && (
        <EventTooltip key={tip.ev.id ?? `${tip.ev.s}:${tip.ev.t}:${tip.ev.k}`} id={tipId} tip={tip}
          session={sessions.find(s => s.id === tip.ev.s)} token={token} cache={previews.current}
          text={story.find(item => item.s === tip.ev.s && item.t === tip.ev.t && item.k === tip.ev.k)?.x} />
      )}
    </div>
  );
}

/** Keep one stroke per event without mounting tens of thousands of buttons.
 * Each source has its own event sequence, so its scrolling is independent. */
export function EventLane<T extends Ev>({ events, renderEvent, onScroll }: {
  events: T[]; renderEvent: (event: T, index: number, tabIndex: number) => ReactNode; onScroll: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  const [left, setLeft] = useState(0);
  const [focused, setFocused] = useState<number | null>(null);
  const focusNext = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 960);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure); observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const totalWidth = Math.max(width, events.length * PITCH);
  const scrollLeft = Math.min(left, Math.max(0, totalWidth - width));
  const first = Math.max(0, Math.floor(scrollLeft / PITCH) - 8);
  const end = Math.min(events.length, Math.ceil((scrollLeft + width) / PITCH) + 8);
  const indices = Array.from({ length: Math.max(0, end - first) }, (_, n) => first + n);
  // A focused stroke remains mounted if the user scrolls it out of view.
  if (focused !== null && focused < events.length && !indices.includes(focused)) indices.push(focused);
  const tabIndex = focused !== null && focused < events.length ? focused : Math.floor(scrollLeft / PITCH);
  const ticks = useMemo(() => hourTicks(events), [events]);
  useLayoutEffect(() => {
    if (focusNext.current === null) return;
    viewport.current?.querySelector<HTMLButtonElement>(`[data-index="${focusNext.current}"]`)?.focus();
    focusNext.current = null;
  });
  return <div className="slbars" ref={viewport}
    onScroll={e => { setLeft(e.currentTarget.scrollLeft); onScroll(); }}
    onFocus={e => { const index = (e.target as HTMLElement).dataset.index; if (index !== undefined) setFocused(Number(index)); }}
    onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(null); }}
    onKeyDown={e => {
      const index = (e.target as HTMLElement).dataset.index;
      if (index === undefined || !events.length) return;
      const i = Number(index);
      const next = e.key === 'ArrowRight' ? Math.min(events.length - 1, i + 1)
        : e.key === 'ArrowLeft' ? Math.max(0, i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? events.length - 1 : null;
      if (next === null || next === i) return;
      e.preventDefault();
      const position = next * PITCH;
      const x = position < scrollLeft ? position : position + PITCH > scrollLeft + width ? position + PITCH - width : scrollLeft;
      focusNext.current = next; setFocused(next); setLeft(x);
      if (viewport.current) viewport.current.scrollLeft = x;
    }}>
    <div className="slticks" style={{ width: totalWidth }}>
      {ticks.filter(t => t.index >= first - 5 && t.index < end).map(t => (
        <span key={t.index} style={{ left: t.index * PITCH }}>{t.label}</span>
      ))}
    </div>
    <div className="slinner slvirtual" style={{ width: totalWidth }}>
      {indices.map(i => renderEvent(events[i]!, i, i === tabIndex ? 0 : -1))}
    </div>
  </div>;
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
  const input = detail?.tool_input ? toolInput(detail.tool_input) : null;
  const output = detail?.tool_output ? toolOutput(detail.tool_output) : content;
  const setup = ev.k === 'user' && Boolean(content && isSetupText(content));
  const clipped = (value: string) => value.length > 500 ? `${value.slice(0, 500)}…` : value;
  return <div ref={ref} id={id} role="tooltip" className="tip event-tip" style={position}>
    <div className="h">{setup ? 'Session setup' : label(ev)}</div>
    <dl>
      <dt>Time</dt><dd>{new Date(ev.t).toLocaleTimeString()}</dd>
      <dt>Session</dt><dd>{session?.title ?? '—'}</dd>
      {ev.ms != null && <><dt>Took</dt><dd>{fmtMs(ev.ms)}</dd></>}
    </dl>
    {ev.k === 'tool' ? <>
      {input && <div className="tip-preview"><b>{input.label}</b><pre>{clipped(input.text)}</pre></div>}
      {output && <div className="tip-preview"><b>Result</b><pre>{clipped(output)}</pre></div>}
      {detail?.tool_output && !output && <p>No readable result in this excerpt. Open the session for raw details.</p>}
      {!detail?.tool_input && !detail?.tool_output && !content && <p>{pending ? 'Loading tool details…' : 'Tool preview unavailable.'}</p>}
    </> : <div className="tip-preview"><b>{ev.k === 'user' ? 'Your prompt' : 'Agent response'}</b>
      <p>{setup ? 'Workspace instructions or environment context, not a user request.' : content ? clipped(content) : pending ? 'Loading preview…' : 'Text preview unavailable.'}</p></div>}
    {detail?.truncated && <p className="srmeta">Excerpt only; source record was larger.</p>}
    <div className="f">Click to open this session</div>
  </div>;
}

const label = (e: Ev) =>
  e.k === 'tool' ? `${toolLabel(e.n)} — ${isFailed(e.st) ? 'failed' : isSucceeded(e.st) ? 'worked' : e.st}`
  : e.k === 'user' ? 'You asked for something' : 'Agent replied';
