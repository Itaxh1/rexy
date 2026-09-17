import { isFailed, SOURCES, fmtDur, type Ev, type Sess } from '../data';

/** Title priority is source title → project → untitled. A model summary is
 *  supporting copy; it never replaces a useful source title. Auto-summaries cover
 *  the last 7 days only — older sessions offer a button rather than spending. */
export default function Sessions({
  sessions, events, onOpen, onSummarize,
}: {
  sessions: Sess[]; events: Ev[]; onOpen: (id: string) => void;
  onSummarize: (id: string) => Promise<void>;
}) {

  if (!sessions.length) {
    return (
      <div className="panel">
        <div className="empty">
          No sessions on this day.<br />
          <span style={{ fontSize: 12 }}>Checked <code>~/.claude/projects</code> and <code>~/.codex/sessions</code>.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      {sessions.map(s => {
        const evs = events.filter(e => e.s === s.id);
        const tools = evs.filter(e => e.k === 'tool');
        const fails = tools.filter(e => isFailed(e.st)).length;
        const prompts = evs.filter(e => e.k === 'user').length;
        const src = SOURCES.find(x => x.id === s.src)!;
        const state = s.summary_state ?? 'not_requested';

        return (
          <article className="sr" key={s.id} onClick={() => onOpen(s.id)}>
            <div className="srmain">
              <h3 className="srt">
                <i className="chip" style={{ background: `var(${src.varName})` }} />
                {s.title}
                {fails > 0 && <span className="tflag">{fails} failed</span>}
              </h3>

              <p className="srsum">
                {s.summary || (state === 'ready' ? 'Summary unavailable.' : null)}
                {(state === 'pending' || s.refresh_state === 'pending') && <span className="pend">{s.summary ? ' Updating saved TLDR…' : 'Summarising…'}</span>}
                {state === 'failed' && <span className="pend">Summary failed. You can retry.</span>}
                {state === 'not_requested' && (
                  <button className="ghost" onClick={e => {
                    e.stopPropagation();
                    void onSummarize(s.id);
                  }}>Load summary</button>
                )}
                {state === 'failed' && (
                  <button className="ghost" onClick={e => {
                    e.stopPropagation();
                    void onSummarize(s.id);
                  }}>Retry</button>
                )}
              </p>

              <p className="srmeta">
                <span>{src.label}</span><i>/</i>
                <span>{s.proj}</span>
                {s.model && <><i>/</i><span>{s.model}</span></>}
              </p>
            </div>

            <dl className="srstats">
              <div><dt>Asked</dt><dd>{prompts}</dd></div>
              <div><dt>Actions</dt><dd>{tools.length}</dd></div>
              <div><dt>Ran for</dt><dd>{fmtDur(s.end - s.start)}</dd></div>
              <div><dt>Started</dt><dd>{new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</dd></div>
            </dl>
          </article>
        );
      })}
    </div>
  );
}
