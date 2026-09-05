import { useId, useState } from 'react';
import { SOURCES, type Ev, type Sess, type Story } from '../data';
import Ribbon from './Ribbon';
import Timeline from './Timeline';

/** Ribbon first — it is the shape of the day and reads at a glance. The written
 *  detail (TLDR, prompts, tool calls, corrections) sits underneath it, and only
 *  the per-exchange list is collapsible. */
export default function ActivityTimeline({ day, sessions, events, story, token, onOpen }: {
  day: string; sessions: Sess[]; events: Ev[]; story: Story[];
  token: string | null; onOpen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const detailId = useId();

  return <>
    <div className="sec-h">
      <h2>When it happened</h2>
      <span className="n">one mark per event · hover to inspect</span>
    </div>
    <Ribbon day={day} events={events} sessions={sessions} story={story} token={token} onOpen={onOpen} />

    <div className="sec-h timeline-expanded">
      <h2>What happened</h2>
      <span className="n">TLDR, prompts, tool calls, and corrections</span>
      <button className="link timeline-toggle" aria-expanded={expanded} aria-controls={detailId}
              onClick={() => setExpanded(value => !value)}>
        {expanded ? 'Hide exchanges' : 'Show exchanges'}
      </button>
    </div>

    <div className="panel">
      {sessions.length ? <ul className="timeline-summaries">
        {sessions.map(session => <li key={session.id}>
          <div className="timeline-summary-heading">
            <span className="srmeta">{SOURCES.find(source => source.id === session.src)?.label}</span>
            <button className="link" onClick={() => onOpen(session.id)}>{session.title}</button>
          </div>
          <p>{session.summary || (session.summary_state === 'pending' ? 'TLDR is being prepared…'
            : session.summary_state === 'failed' ? 'TLDR unavailable. Retry from Sessions below.'
            : `${events.filter(event => event.s === session.id && event.k === 'tool').length} tool calls recorded. TLDR not generated yet.`)}</p>
          {session.summary && session.summary_state === 'pending' && <span className="srmeta">Updating TLDR…</span>}
        </li>)}
      </ul> : <div className="empty">Nothing happened on this day.</div>}
    </div>

    <div id={detailId} hidden={!expanded}>
      {expanded && <div className="timeline-expanded">
        <Timeline story={story} events={events} onOpen={onOpen} />
      </div>}
    </div>
  </>;
}
