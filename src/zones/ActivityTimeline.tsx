import { useId, useState } from 'react';
import { SOURCES, type Ev, type Sess, type Story } from '../data';
import Ribbon from './Ribbon';
import Timeline from './Timeline';

export default function ActivityTimeline({ day, sessions, events, story, token, onOpen }: {
  day: string; sessions: Sess[]; events: Ev[]; story: Story[];
  token: string | null; onOpen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  return <>
    <div className="sec-h">
      <h2>When it happened</h2>
      <span className="n">TLDR first · expand for prompts and tool calls</span>
      <button className="link timeline-toggle" aria-expanded={expanded} aria-controls={detailId}
              onClick={() => setExpanded(value => !value)}>
        {expanded ? 'Collapse timeline' : 'Expand timeline'}
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
      {expanded && <>
        <div className="timeline-expanded">
          <Ribbon day={day} events={events} sessions={sessions} story={story} token={token} onOpen={onOpen} />
        </div>
        <div className="sec-h timeline-expanded"><h2>Each exchange</h2><span className="n">prompts, tools, and possible corrections</span></div>
        <Timeline story={story} events={events} onOpen={onOpen} />
      </>}
    </div>
  </>;
}
