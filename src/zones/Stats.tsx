import { fmtDur, isFailed, type Ev, type Sess, type Tool } from '../data';
import { activeTime } from '../activityStats';

/** Plain-language day summary. Deterministic — nothing here waits on a model. */
export default function Stats({
  events, sessions, tools,
}: { events: Ev[]; sessions: Sess[]; tools: Tool[] }) {
  const toolEvents = events.filter(e => e.k === 'tool');
  const failed = toolEvents.filter(e => isFailed(e.st)).length;
  const prompts = events.filter(e => e.k === 'user').length;

  const active = activeTime(events);
  const measured = tools.filter((tool): tool is Tool & { max: number } => tool.max !== null);
  const slowest = measured.length ? measured.reduce((a, b) => (a.max > b.max ? a : b)) : null;

  const items: [string, string, string?][] = [
    [String(sessions.length), sessions.length === 1 ? 'session' : 'sessions'],
    [String(prompts), 'things you asked for'],
    [String(toolEvents.length), 'actions taken'],
    [failed ? String(failed) : 'None', failed ? (failed === 1 ? 'action failed' : 'actions failed') : 'failed'],
    [active !== null ? '≈ ' + fmtDur(active) : '—', 'active time (estimate)'],
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
