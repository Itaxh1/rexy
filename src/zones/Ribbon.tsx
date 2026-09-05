import { useMemo, useRef, useState } from 'react';
import { isFailed, isRunning, isSucceeded, SOURCES, fmtMs, type Ev, type Sess, type Src } from '../data';

/** Uniform bars in chronological order, one per event — the status-page pattern.
 *  Time-proportional placement left ~80% of a typical day empty and packed every
 *  event into an unhittable 100px band; sequence layout gives every event the same
 *  width and a real hit target, and overflow scrolls instead of compressing. */
export default function Ribbon({
  events, sessions, onOpen,
}: { day: string; events: Ev[]; sessions: Sess[]; onOpen: (id: string) => void }) {
  const [tip, setTip] = useState<{ ev: Ev; x: number; y: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

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
              <em>{fails ? `${fails} failed` : 'all worked'}</em>
            </div>
            <div className="slbars" ref={src.id === 'claude-code' ? scroller : undefined}
                 onScroll={e => {
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
                    aria-label={label(ev)}
                  />
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
        <div className="tip" style={{ left: Math.min(tip.x + 16, innerWidth - 310), top: tip.y + 16 }}>
          <div className="h">{label(tip.ev)}</div>
          <dl>
            <dt>Time</dt><dd>{new Date(tip.ev.t).toLocaleTimeString()}</dd>
            <dt>Session</dt><dd>{sessions.find(s => s.id === tip.ev.s)?.title ?? '—'}</dd>
            {/* Codex writes call and result together, so its durations are
                genuinely unknown — omitted rather than shown as zero. */}
            {tip.ev.ms != null && <><dt>Took</dt><dd>{fmtMs(tip.ev.ms)}</dd></>}
          </dl>
          <div className="f">Click to open this session</div>
        </div>
      )}
    </div>
  );
}

const label = (e: Ev) =>
  e.k === 'tool' ? `${e.n ?? 'Action'} — ${isFailed(e.st) ? 'failed' : isSucceeded(e.st) ? 'worked' : e.st}`
  : e.k === 'user' ? 'You asked for something' : 'Agent replied';
