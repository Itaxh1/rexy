import { fmtDur, isFailed, type Ev, type Sess, type Tool } from '../data';

/** Plain-language day summary. Deterministic — nothing here waits on a model. */
export default function Stats({
  events, sessions, tools,
}: { events: Ev[]; sessions: Sess[]; tools: Tool[] }) {
  const toolEvents = events.filter(e => e.k === 'tool');
  const failed = toolEvents.filter(e => isFailed(e.st)).length;
  const prompts = events.filter(e => e.k === 'user').length;

  // Gaps over five minutes count as idle, or a session left open overnight
  // reads as fourteen hours of work.
  let active = 0;
  for (let i = 1; i < events.length; i++) {
    const gap = events[i].t - events[i - 1].t;
    if (gap > 0 && gap < 300_000) active += gap;
  }
  const slowest = tools.length ? tools.reduce((a, b) => (a.max > b.max ? a : b)) : null;

  const items: [string, string, string?][] = [
    [String(sessions.length), sessions.length === 1 ? 'session' : 'sessions'],
    [String(prompts), 'things you asked for'],
    [String(toolEvents.length), 'actions taken'],
    [failed ? String(failed) : 'None', failed ? (failed === 1 ? 'action failed' : 'actions failed') : 'failed'],
    [active ? fmtDur(active) : '—', 'spent working'],
  ];

  return (
    <div className="panel">
      <div className="strip">
        {items.map(([v, l]) => (
          <span className="m" key={l}><b>{v}</b><span>{l}</span></span>
        ))}
        {slowest && (
          <span className="m">
            <b>{(slowest.max / 1000).toFixed(0)}s</b>
            <span>longest wait ({slowest.name})</span>
          </span>
        )}
      </div>
    </div>
  );
}
