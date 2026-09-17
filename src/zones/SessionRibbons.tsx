import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { SOURCES, fmtDur, fmtMs, type EventDetail, type Story } from '../data';
import { isSetupText } from '../sessionTitle';
import { toolLabel } from '../eventPresentation';
import EventPreview from '../EventPreview';
import {
  CLUSTER_PX, axisPosition, axisTicks, clusterByPixel, estimatedActiveMs,
  type Cluster, type DayRibbon, type RibbonEvent, type SessionHeader,
} from '../dayRibbon';

/** One ribbon per session, grouped under its agent, on a shared local-day axis.
 *  Saturated colour is reserved for exceptions: violet caps mark your prompts and red
 *  marks failures. Volume is neutral and shown by height, so a busy moment stands
 *  taller rather than louder. */

type Tip = { cluster: Cluster; session: SessionHeader; x: number; y: number };

const FALLBACK_WIDTH = 960;

/** 7 px for a single event rising to 22 px around 60 events, log-scaled so one busy
 *  minute doesn't flatten the rest of the day. */
const barHeight = (n: number) => Math.round(7 + 15 * Math.min(1, Math.log2(n + 1) / 6));

const clusterClass = (c: Cluster) =>
  c.failed ? 'failed' : c.running ? 'running' : c.responses ? 'agent' : 'tool';

const timeOf = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function SessionRibbons({ ribbon, onOpen, token = null, story = [] }: {
  ribbon: DayRibbon;
  onOpen?: (sessionId: string) => void;
  token?: string | null;
  story?: Story[];
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [tip, setTip] = useState<Tip | null>(null);
  const previews = useRef(new Map<string, EventDetail>());
  useEffect(() => { previews.current.clear(); setTip(null); }, [token, ribbon]);

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setMeasured(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const width = measured || FALLBACK_WIDTH;

  const offAxis = useMemo(() => new Set(ribbon.off_axis_event_ids), [ribbon.off_axis_event_ids]);
  const bySession = useMemo(() => {
    const map = new Map<string, RibbonEvent[]>();
    for (const ev of ribbon.events) {
      const list = map.get(ev.s);
      if (list) list.push(ev); else map.set(ev.s, [ev]);
    }
    return map;
  }, [ribbon.events]);

  const clusters = useMemo(() => {
    const map = new Map<string, Cluster[]>();
    for (const [id, evs] of bySession) {
      map.set(id, clusterByPixel(evs.filter(e => !offAxis.has(e.id)), ribbon.axis, width));
    }
    return map;
  }, [bySession, offAxis, ribbon.axis, width]);

  const ticks = useMemo(() => axisTicks(ribbon.axis), [ribbon.axis]);
  const now = Date.now();
  const nowPos = now >= ribbon.axis.start_ms && now < ribbon.axis.end_ms ? axisPosition(now, ribbon.axis) : null;
  const minutesPerMark = Math.round((CLUSTER_PX / width) * ((ribbon.axis.end_ms - ribbon.axis.start_ms) / 60_000));

  const groups = SOURCES.map(src => ({
    src,
    sessions: ribbon.sessions.filter(s => s.src === src.id).sort((a, b) => a.day_first_ms - b.day_first_ms),
  }));

  const showTip = (e: MouseEvent<HTMLButtonElement>, cluster: Cluster, session: SessionHeader) =>
    setTip({ cluster, session, x: e.clientX, y: e.clientY });

  const move = (e: KeyboardEvent<HTMLButtonElement>) => {
    const marks = Array.from(e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('.srb-mark') ?? []);
    const i = marks.indexOf(e.currentTarget);
    const target = e.key === 'ArrowRight' ? marks[i + 1] : e.key === 'ArrowLeft' ? marks[i - 1]
      : e.key === 'Home' ? marks[0] : e.key === 'End' ? marks[marks.length - 1] : undefined;
    if (e.key === 'Escape') setTip(null);
    if (target) { e.preventDefault(); target.focus(); }
  };

  const grid = (pos: number) => ({ left: pos * width });

  return (
    <div className="panel srb" onMouseLeave={() => setTip(null)}>
      <div className="srb-grid srb-axis" aria-hidden="true">
        <div className="srb-zone">Local time</div>
        <div className="srb-track srb-ticks" ref={trackRef}>
          {ticks.map(t => (
            <span key={t.ms} className={`srb-tick${t.edge ? ` ${t.edge}` : ''}`} style={grid(t.pos)}>{t.label}</span>
          ))}
          {nowPos !== null && <span className="srb-tick srb-now-label" style={grid(nowPos)}>Now</span>}
        </div>
      </div>

      {groups.map(({ src, sessions }) => {
        const evs = sessions.flatMap(s => bySession.get(s.id) ?? []);
        const failed = evs.filter(e => e.st === 'failed').length;
        const open = !collapsed[src.id] && sessions.length > 0;
        return (
          <section key={src.id} className="srb-agent" aria-label={src.label}>
            <button className="srb-grid srb-agent-head" disabled={!sessions.length}
              aria-expanded={sessions.length ? open : undefined}
              onClick={() => setCollapsed(v => ({ ...v, [src.id]: !v[src.id] }))}>
              <span className="srb-agent-name">
                <i className="chip" style={{ background: `var(${src.varName})` }} />
                {src.label}
              </span>
              <span className="srb-agent-sum">
                {sessions.length
                  ? <>{sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} · {evs.length.toLocaleString()} events
                      {failed > 0 && <b className="srb-bad"> · {failed} failed</b>}</>
                  : 'No sessions on this day'}
                {sessions.length > 0 && <svg className="srb-caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M2 3.5 5 6.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>}
              </span>
            </button>

            {open && sessions.map(session => {
              const own = bySession.get(session.id) ?? [];
              const marks = clusters.get(session.id) ?? [];
              const active = estimatedActiveMs(own);
              const sessionFailed = own.filter(e => e.st === 'failed').length;
              const outside = own.filter(e => offAxis.has(e.id)).length;
              const fromBefore = session.start < ribbon.axis.start_ms;
              const intoAfter = session.end >= ribbon.axis.end_ms;
              const spanLeft = Math.max(0, Math.min(width, axisPosition(session.day_first_ms, ribbon.axis) * width));
              const spanRight = Math.max(0, Math.min(width, axisPosition(session.day_last_ms, ribbon.axis) * width));
              return (
                <div key={session.id} className="srb-grid srb-row" role="group"
                  style={{ ['--srb-hue' as string]: `var(${src.varName})` }}
                  aria-label={`${session.title}, ${own.length} events${active !== null ? `, about ${fmtDur(active)} active` : ''}`}>
                  <div className="srb-label">
                    <div className="srb-title" title={session.title}>{session.title}</div>
                    <div className="srb-meta">
                      <span className="srb-proj">{session.proj}</span>
                      <span className="srb-num">{own.length.toLocaleString()} events</span>
                      {active !== null && <span className="srb-num"
                        title="Estimated active time: gaps under five minutes within this session">≈ {fmtDur(active)}</span>}
                      {sessionFailed > 0 && <span className="srb-num srb-bad">{sessionFailed} failed</span>}
                      {fromBefore && <span className="srb-num srb-cont">from previous day</span>}
                      {intoAfter && <span className="srb-num srb-cont">continues next day</span>}
                      {outside > 0 && <button className="link srb-num srb-cont" onClick={() => onOpen?.(session.id)}>{outside} outside this day · inspect</button>}
                    </div>
                  </div>

                  <div className="srb-track">
                    {ticks.map(t => <i key={t.ms} className="srb-line" style={grid(t.pos)} />)}
                    {nowPos !== null && <i className="srb-now" style={grid(nowPos)} />}
                    <i className={`srb-span${fromBefore ? ' from-before' : ''}${intoAfter ? ' into-after' : ''}`}
                      style={{ left: spanLeft, width: Math.max(0, Math.min(width - spanLeft, spanRight - spanLeft + CLUSTER_PX)) }} />
                    {marks.map((c, i) => {
                      const markWidth = Math.max(3, Math.min(c.x1 - c.x0 + 3, CLUSTER_PX - 1));
                      return (
                      <button key={c.key} type="button"
                        className={`srb-mark ${clusterClass(c)}`}
                        tabIndex={i === 0 ? 0 : -1}
                        // An event at 11:59 PM sits at x = width; keep its mark inside the track.
                        style={{ left: Math.min(c.x0, width - markWidth), width: markWidth, height: barHeight(c.events.length) }}
                        aria-label={clusterLabel(c)}
                        onMouseEnter={e => showTip(e, c, session)}
                        onMouseMove={e => showTip(e, c, session)}
                        onFocus={e => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setTip({ cluster: c, session, x: r.left + r.width / 2, y: r.bottom });
                        }}
                        onBlur={() => setTip(null)}
                        onKeyDown={move}
                        onClick={() => onOpen?.(session.id)}>
                        {c.prompts > 0 && <span className="srb-prompt" aria-hidden="true" />}
                        {c.failed > 0 && <span className="srb-flag" aria-hidden="true">❌</span>}
                        {!c.failed && c.events.some(e => e.st === 'interrupted') && <span className="srb-flag" aria-hidden="true">🛑</span>}
                      </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}

      <div className="srb-legend">
        <span><i className="srb-key tool" />Action</span>
        <span><i className="srb-key agent" />Agent replied</span>
        <span><i className="srb-key prompt" />You asked</span>
        <span><i className="srb-key failed" />Failed ❌</span>
        <span className="srb-legend-note">Taller = more events · each mark ≈ {minutesPerMark} min</span>
      </div>

      {tip && <ClusterTip key={tip.cluster.key} tip={tip} story={story} token={token} cache={previews.current} />}
    </div>
  );
}

function clusterLabel(c: Cluster) {
  const span = c.t0 === c.t1 ? timeOf(c.t0) : `${timeOf(c.t0)} to ${timeOf(c.t1)}`;
  const parts = [`${c.events.length} ${c.events.length === 1 ? 'event' : 'events'}`];
  if (c.prompts) parts.push(`${c.prompts} ${c.prompts === 1 ? 'prompt' : 'prompts'}`);
  if (c.actions) parts.push(`${c.actions} ${c.actions === 1 ? 'action' : 'actions'}`);
  if (c.failed) parts.push(`${c.failed} failed`);
  return `${span}, ${parts.join(', ')}`;
}

function eventTitle(e: RibbonEvent) {
  if (e.k === 'user') return 'You asked';
  if (e.k === 'agent') return 'Agent replied';
  const verdict = e.st === 'succeeded' ? 'worked' : e.st === 'unknown' ? 'result not recorded' : e.st;
  return `${toolLabel(e.n)} — ${verdict}`;
}

function ClusterTip({ tip, token, cache, story }: { tip: Tip; token: string | null; cache: Map<string, EventDetail>; story: Story[] }) {
  const { cluster: c, session } = tip;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: tip.x + 14, top: tip.y + 14 });
  useLayoutEffect(() => {
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const top = tip.y + 14 + r.height > innerHeight - 8 ? tip.y - r.height - 12 : tip.y + 14;
      setPos({ left: Math.max(8, Math.min(tip.x + 14, innerWidth - r.width - 8)), top: Math.max(8, top) });
    };
    place();
    if (typeof ResizeObserver === 'undefined' || !ref.current) return;
    const observer = new ResizeObserver(place); observer.observe(ref.current);
    return () => observer.disconnect();
  }, [tip.x, tip.y]);

  const single = c.events.length === 1 ? c.events[0]! : null;
  const tools = new Map<string, number>();
  for (const e of c.events) if (e.k === 'tool' && e.n) tools.set(e.n, (tools.get(e.n) ?? 0) + 1);
  const topTools = [...tools.entries()].sort((a, b) => b[1] - a[1]);
  const prompt = c.events.find(e => e.k === 'user' && story.some(row => row.s === e.s && row.t === e.t && row.k === 'user' && !isSetupText(row.x)))
    ?? c.events.find(e => e.k === 'user');
  const previewEvents = single ? [single] : [prompt, c.events.find(e => e.k === 'tool')]
    .filter((e): e is RibbonEvent => Boolean(e));

  return (
    <div ref={ref} role="tooltip" className="tip srb-tip" style={pos}>
      {single ? <>
        <div className="h">{eventTitle(single)}</div>
        <dl>
          <dt>Time</dt><dd>{new Date(single.t).toLocaleTimeString()}</dd>
          <dt>Session</dt><dd>{session.title}</dd>
          {single.k === 'tool' && <><dt>Duration</dt>
            <dd>{single.ms !== null ? fmtMs(single.ms) : <span className="srb-muted">not recorded</span>}</dd></>}
        </dl>
      </> : <>
        <div className="h">{timeOf(c.t0)} – {timeOf(c.t1)}</div>
        <div className="srb-tip-count">
          <b>{c.events.length}</b> events
          <span className="srb-tip-mix">
            {c.prompts} {c.prompts === 1 ? 'prompt' : 'prompts'} · {c.responses} {c.responses === 1 ? 'response' : 'responses'} · {c.actions} {c.actions === 1 ? 'action' : 'actions'}
          </span>
        </div>
        <dl>
          {c.failed > 0 && <><dt>Failed</dt><dd className="srb-bad">{c.failed} ❌</dd></>}
          {topTools.length > 0 && <><dt>Tools</dt><dd>{topTools.map(([n, k]) => `${toolLabel(n)} ×${k}`).join(' · ')}</dd></>}
          <dt>Session</dt><dd>{session.title}</dd>
        </dl>
      </>}
      {c.actions > 1 && <p className="srmeta">Previewing 1 of {c.actions} tool calls · open the session for all calls</p>}
      {previewEvents.map(e => <EventPreview key={e.id} id={e.id} kind={e.k} toolName={e.n} token={token} cache={cache} />)}
      <div className="f">Click to open this session</div>
    </div>
  );
}
