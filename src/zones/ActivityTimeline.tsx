import { useId, useMemo, useState } from 'react';
import { SOURCES, type Ev, type Sess, type Story } from '../data';
import SessionRibbons from './SessionRibbons';
import Ribbon from './Ribbon';
import { ribbonFromEvents, type DayRibbon } from '../dayRibbon';
import Timeline from './Timeline';

/** Ribbon first — it is the shape of the day and reads at a glance. The written
 *  detail (TLDR, prompts, tool calls, corrections) sits underneath it, and only
 *  the per-exchange list is collapsible. */
export default function ActivityTimeline({ day, sessions, events, story, token, onOpen, ribbon: loadedRibbon,
  loading = false, storyLoading = false, storyMore = false, storyNewer = false, onMoreStory, onReloadStory }: {
  day: string; sessions: Sess[]; events: Ev[]; story: Story[];
  token: string | null; onOpen: (id: string) => void;
  ribbon?: DayRibbon | null; loading?: boolean; storyLoading?: boolean; storyMore?: boolean; storyNewer?: boolean;
  onMoreStory?: () => void; onReloadStory?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [detailedRibbons, setDetailedRibbons] = useState(false);
  const detailId = useId();
  const ribbon = useMemo(() => {
    if (!loadedRibbon) return ribbonFromEvents(day, sessions, events);
    const titles = new Map(sessions.map(s => [s.id, s.title]));
    return { ...loadedRibbon, sessions: loadedRibbon.sessions.map(s => ({ ...s, title: titles.get(s.id) ?? s.title })) };
  }, [loadedRibbon, day, sessions, events]);

  return <>
    <div className="sec-h">
      <h2>Overall activity</h2>
      <span className="n">all sessions for this day · one mark per event</span>
    </div>
    {loading && !ribbon.events.length ? <div className="panel"><div className="empty" role="status">Loading overall ribbons…</div></div>
      : <Ribbon key={day} day={day} events={ribbon.events} sessions={sessions} story={story} token={token} onOpen={onOpen} />}

    <div className="sec-h timeline-expanded session-ribbon-heading">
      <h2>When it happened</h2>
      <span className="n">every session on its own ribbon · hover a mark to inspect</span>
      <button type="button" className="ribbon-view-toggle" aria-label="Detailed session view"
        aria-pressed={detailedRibbons}
        title={detailedRibbons ? 'Show the full-day clock for both agents' : 'Zoom into individual events for both agents'}
        onClick={() => setDetailedRibbons(value => !value)}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" /><path d="m12 12 5 5M5 8h6" />
          {!detailedRibbons && <path d="M8 5v6" />}
        </svg>
        {detailedRibbons ? 'Full-day view' : 'Detailed view'}
      </button>
    </div>
    {loading && !ribbon.events.length ? <div className="panel"><div className="empty" role="status">Loading session ribbons…</div></div>
      : <SessionRibbons key={`sessions-${day}`} ribbon={ribbon} detailed={detailedRibbons} story={story} onOpen={onOpen} token={token} />}

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
          {session.summary && (session.refresh_state === 'pending' || session.summary_state === 'pending' || session.is_stale) && <span className="srmeta">Saved TLDR · updating when new work is summarized</span>}
        </li>)}
      </ul> : <div className="empty">Nothing happened on this day.</div>}
    </div>

    <div id={detailId} hidden={!expanded} aria-busy={storyLoading}>
      {expanded && <div className="timeline-expanded">
        {storyLoading && !story.length ? <div className="panel"><div className="empty">Loading exchanges…</div></div>
          : <Timeline story={story} events={events} onOpen={onOpen} />}
        {storyMore && <button className="link" disabled={storyLoading} onClick={onMoreStory}>{storyLoading ? 'Loading…' : 'Load more exchanges'}</button>}
        {storyNewer && <button className="link" disabled={storyLoading} onClick={onReloadStory}>More exchanges available · refresh</button>}
      </div>}
    </div>
  </>;
}
