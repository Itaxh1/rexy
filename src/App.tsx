import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import Auth from './auth/Auth';
import Connect from './Connect';
import RexyLogo from './RexyLogo';
import DevicesPage from './pages/Devices';
import ProfilePage, { LiveProfile } from './pages/Profile';
import ProjectsPage, { LiveProjects } from './pages/Projects';
import { clearSaved } from './savedCache';
import Rail from './zones/Rail';
import Stats from './zones/Stats';
import ActivityTimeline from './zones/ActivityTimeline';
import TokenUsage from './zones/TokenUsage';
import Sessions from './zones/Sessions';
import Tools from './zones/Tools';
import { requestSummary } from './api';
import { useActivity } from './useActivity';
import { getSupabase } from './lib/supabase';
import { applyTheme, readTheme, type Theme } from './theme';
import { addDays, dayKey, fmtDay, yearDays, SOURCES } from './data';
import { isSetupText, sessionTitle } from './sessionTitle';
import { toolStats } from './activityStats';
import EventPreview from './EventPreview';
import type { EventDetail } from './data';
import { toolLabel } from './eventPresentation';


export default function App() {
  const demo = new URLSearchParams(location.search).has('demo');
  const [session, setSession] = useState<Session | null>(null);
  const accountRef = useRef<string | null>(null);
  const [authReady, setAuthReady] = useState(demo);
  const [authError, setAuthError] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [year, setYear] = useState(
    () => Number(new URLSearchParams(location.search).get('year')) || new Date().getFullYear(),
  );
  const [day, setDay] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [showConnect, setShowConnect] = useState<boolean | null>(null);
  const [view, setView] = useState<'activity' | 'devices' | 'projects' | 'profile'>(() => {
    const requested = new URLSearchParams(location.search).get('view');
    return requested === 'projects' || requested === 'profile' ? requested : 'activity';
  });
  const savedView = view === 'profile' || view === 'projects';
  const { fx, setFx, ribbon, error, dayLoading, extrasLoading, extrasAsOf, storyLoading, storyMore,
    storyNewer, loadMoreStory, reloadStory, rollupsPending, calendarReady } = useActivity({ demo, token: savedView && !demo ? null : session?.access_token ?? null, accountId: session?.user.id, year, day, setDay, refresh });
  const err = authError || error;
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(
    () => (new URLSearchParams(location.search).get('theme') as Theme) || readTheme(),
  );

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    const url = new URL(location.href); url.searchParams.set('view', view);
    history.replaceState(null, '', url);
  }, [view]);

  useEffect(() => {
    if (demo) return;
    let active = true;
    let unsubscribe = () => {};
    getSupabase().then(async supabase => {
      const { data } = await supabase.auth.getSession();
      if (active) {
        accountRef.current = data.session?.user.id ?? null;
        setSession(data.session);
        setAuthReady(true);
      }
      const listener = supabase.auth.onAuthStateChange((_event, next) => {
        if (active) {
          if (accountRef.current && accountRef.current !== next?.user.id) void clearSaved(accountRef.current);
          accountRef.current = next?.user.id ?? null;
          setSession(next);
        }
      });
      unsubscribe = () => listener.data.subscription.unsubscribe();
    }).catch(error => {
      if (active) {
        setAuthError(String(error));
        setAuthReady(true);
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [demo]);

  useEffect(() => { setShowConnect(null); }, [session?.user.id]);
  useEffect(() => {
    if (fx && calendarReady) setShowConnect(current => current ?? (!demo && !rollupsPending && fx.stats.strokes === 0));
  }, [demo, fx, rollupsPending, calendarReady]);

  const days = useMemo(() => yearDays(year), [year]);
  const dayEvents = useMemo(() => (fx ? fx.events.filter(e => e.d === day) : []), [fx, day]);
  useEffect(() => {
    if (!fx || !calendarReady || day.startsWith(String(year))) return;
    const inYear = Object.keys(fx.rollups).filter(d => d.startsWith(String(year))).sort();
    setDay(inYear.length ? inYear[inYear.length - 1] : `${year}-01-01`);
  }, [year, fx, day, calendarReady]);

  const dayStory = useMemo(
    () => (fx ? fx.story.filter(s => s.d === day) : []),
    [fx, day],
  );

  const daySessions = useMemo(
    () => (fx ? fx.sessions.filter(s => s.d === day).map(s => ({ ...s, title: sessionTitle(s, dayStory) }))
      .sort((a, b) => a.start - b.start) : []),
    [fx, day, dayStory],
  );

  const inactiveSources = useMemo(() => (demo || ribbon?.date === day && ribbon.snapshot_complete)
    ? SOURCES.filter(source => !daySessions.some(s => s.src === source.id) && !dayEvents.some(e => e.src === source.id))
      .map(source => source.id) : [], [demo, ribbon, day, daySessions, dayEvents]);

  const dayTools = useMemo(() => toolStats(dayEvents), [dayEvents]);

  const logout = async () => {
    if (session?.user.id) await clearSaved(session.user.id);
    if (!demo) await (await getSupabase()).auth.signOut();
    setSession(null);
    setFx(null);
  };

  const summarize = async (sessionId: string) => {
    if (!session) return;
    setActionErr(null);
    setFx(current => current ? {
      ...current,
      sessions: current.sessions.map(item => item.id === sessionId
        ? { ...item, summary_state: 'pending' } : item),
    } : current);
    try {
      await requestSummary(sessionId, session.access_token);
      window.setTimeout(() => setRefresh(value => value + 1), 2_000);
    } catch (error) {
      setFx(current => current ? {
        ...current,
        sessions: current.sessions.map(item => item.id === sessionId
          ? { ...item, summary_state: 'failed' } : item),
      } : current);
      setActionErr(error instanceof Error ? error.message : String(error));
    }
  };

  if (!authReady) return <main><div className="panel"><div className="empty">Loading Rexy…</div></div></main>;
  if (err && !demo && !session) return <main><div className="panel"><div className="empty">Could not start Rexy.<br /><code>{err}</code></div></div></main>;
  if (!demo && !session) return <Auth />;
  if (err && !fx && !savedView) return <main><div className="panel"><div className="empty">Could not load data.<br /><code>{err}</code><br /><button className="link" onClick={() => setRefresh(value => value + 1)}>Try again</button></div></div></main>;
  if (!fx && !savedView) return <main><div className="panel"><div className="empty">Loading your activity…</div></div></main>;
  if (!demo && session && showConnect && !savedView) {
    return <Connect key={session.user.id} token={session.access_token}
      onContinue={() => { setShowConnect(false); setDay(''); setRefresh(value => value + 1); }}
      onRefresh={() => setRefresh(value => value + 1)} onLogout={logout} />;
  }

  return (
    <>
      {(actionErr || err) && <div className="action-error" role="alert">{actionErr || `Could not refresh activity. Retrying automatically. ${err}`}</div>}
      <header className="top">
        <RexyLogo />
        <nav className="nav">
          <span className="sl">/</span>
          <button aria-current={view === 'activity'}
                  onClick={() => { setView('activity'); document.getElementById('activity')?.scrollIntoView(); }}>Activity</button>
          <span className="sl">/</span>
          <button onClick={() => { setView('activity'); setTimeout(() => document.getElementById('sessions')?.scrollIntoView(), 0); }}>Sessions</button>
          <span className="sl">/</span>
          <button aria-current={view === 'projects'} onClick={() => setView('projects')}>Projects</button>
          <span className="sl">/</span>
          <button aria-current={view === 'devices'} onClick={() => setView('devices')}>Devices</button>
          <span className="sl">/</span>
          <button aria-current={view === 'profile'} onClick={() => setView('profile')}>Profile</button>
        </nav>
        <div className="spacer" />
        <span className="who">{demo ? 'Demo' : session?.user.email}</span>
        <button className="pill ghost" onClick={logout}>Log out</button>
        <div className="tog" role="group" aria-label="Theme">
          {(['light', 'system', 'dark'] as Theme[]).map(t => (
            <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)} title={`${t} theme`}>
              {t === 'light' ? '☀' : t === 'dark' ? '☾' : 'Auto'}
            </button>
          ))}
        </div>
      </header>

      {view === 'devices' ? <DevicesPage token={session?.access_token ?? null} />
        : view === 'projects' ? demo ? <ProjectsPage /> : <LiveProjects key={session!.user.id} account={session!.user.id} token={session!.access_token} />
        : view === 'profile' ? demo ? <ProfilePage who="" /> : <LiveProfile key={session!.user.id} who={session!.user.email ?? ''} account={session!.user.id} token={session!.access_token} /> : fx && (
      <main>
        {/* Only claim there is no activity once the counts have settled. While
            rollups are being recomputed the year total can read 0, which made this
            multi-line block appear and disappear, shoving the page up and down.
            Line 66 already guards showConnect the same way. */}
        {!demo && !rollupsPending && fx.stats.strokes === 0 && <div className="connection-status" role="status">
          <strong>Waiting for activity</strong>
          <p>Keep Linus running. This dashboard refreshes automatically as history arrives.
            {' '}<button className="link" onClick={() => setView('devices')}>Check devices</button></p>
        </div>}
        <section className="sec" id="activity">
          <div className="sec-h">
            <h2>Your agents</h2>
            <span className="n">Click any day to see what happened</span>
          </div>
          <Rail fx={fx} days={days} selected={day} onSelect={setDay}
                year={year} onYear={setYear} />
          <div className="statusslot" role="status">{rollupsPending ? 'Updating calendar counts from received history…' : ''}</div>
        </section>

        <div className="dayhead">
          <h1>{day ? fmtDay(day) : '—'}</h1>
          <button className="link" onClick={() => setDay(dayKey(new Date()))}>Jump to today</button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button className="btn sq" onClick={() => setDay(d => addDays(d, -1))} aria-label="Previous day">‹</button>
            <input className="date" type="date" value={day} onChange={e => setDay(e.target.value)} aria-label="Pick a day" />
            <button className="btn sq" onClick={() => setDay(d => addDays(d, 1))} aria-label="Next day">›</button>
          </span>
        </div>

        {/* Fixed-height slot: the message fades in place instead of pushing
            everything below it down and pulling it back up. */}
        <div className="statusslot" role="status">{dayLoading ? 'Loading this day’s details…' : ''}</div>
        <div className={`daybody${dayLoading ? ' is-stale' : ''}`} aria-busy={dayLoading}>
        <section className="sec" id="sessions">
          <Stats events={dayEvents} sessions={daySessions} tools={dayTools} />
        <TokenUsage usage={fx.tokens_by_source?.[day]} loading={extrasLoading || dayLoading} inactiveSources={inactiveSources} />
        {extrasAsOf && <p className="usage-note">Summaries and usage as of {new Date(extrasAsOf).toLocaleTimeString()}{extrasLoading ? ' · updating' : ''}</p>}
        </section>

        <section className="sec">
          <ActivityTimeline key={`${session?.user.id ?? 'demo'}:${day}:${ribbon?.purge_revision ?? ''}`} day={day}
            events={dayEvents} sessions={daySessions} story={dayStory}
            ribbon={ribbon?.date === day ? ribbon : null} loading={dayLoading}
            storyLoading={storyLoading} storyMore={storyMore} storyNewer={storyNewer}
            onMoreStory={loadMoreStory} onReloadStory={reloadStory}
            token={session?.access_token ?? null} onOpen={setOpenSession} />
        </section>

        <section className="sec">
          <div className="sec-h">
            <h2>Sessions</h2>
            <span className="n">{daySessions.length} on this day</span>
          </div>
          <Sessions sessions={daySessions} events={dayEvents} onOpen={setOpenSession} onSummarize={summarize} />
        </section>

        <section className="sec">
          <div className="sec-h">
            <h2>Tool calls</h2>
            <span className="n">completed results and measured latency</span>
          </div>
          <Tools tools={dayTools} />
        </section>
        </div>
      </main>
      )}
      {openSession && (
        <SessionInspector
          key={`${session?.user.id ?? 'demo'}:${day}:${openSession}:${ribbon?.purge_revision ?? ''}`}
          token={session?.access_token ?? null}
          session={daySessions.find(item => item.id === openSession)}
          events={dayEvents.filter(item => item.s === openSession)}
          story={dayStory.filter(item => item.s === openSession)}
          onClose={() => setOpenSession(null)}
        />
      )}
    </>
  );
}

function SessionInspector({ session, events, story, onClose, token }: {
  session: import('./data').Sess | undefined;
  events: import('./data').Ev[];
  story: import('./data').Story[];
  onClose: () => void;
  token: string | null;
}) {
  const [limit, setLimit] = useState(100);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const previews = useRef(new Map<string, EventDetail>());
  const ordered = useMemo(() => [...events].sort((a, b) => a.t - b.t), [events]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);
  if (!session) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="session-modal" role="dialog" aria-modal="true" aria-label={session.title}
               onMouseDown={event => event.stopPropagation()}>
        <header><h2>{session.title}</h2><button className="btn" onClick={onClose}>Close</button></header>
        <p className="srmeta">{session.src} / {session.proj} / {events.length} events</p>
        {session.summary && <p className="modal-summary">{session.summary}</p>}
        <ol className="modal-story">
          {ordered.slice(0, limit).map((item, index) => {
            const id = item.id ?? `demo-${index}`;
            const text = story.find(s => s.s === item.s && s.t === item.t && s.k === item.k)?.x;
            const setup = item.k === 'user' && Boolean(text && isSetupText(text));
            return <li key={id}>
              <time>{new Date(item.t).toLocaleTimeString()}</time>
              <button className="link" aria-expanded={expandedEvent === id} onClick={() => setExpandedEvent(value => value === id ? null : id)}>
                {setup ? 'Session setup' : item.k === 'user' ? 'Your prompt' : item.k === 'agent' ? 'Agent response' : `${toolLabel(item.n)} · ${item.st}`}
              </button>
              {text && <p>{setup ? 'Workspace instructions or environment context.' : text}</p>}
              {expandedEvent === id && <EventPreview id={id} kind={item.k} toolName={item.n} allowRaw token={token} cache={previews.current} />}
            </li>;
          })}
        </ol>
        {limit < ordered.length && <button className="link" onClick={() => setLimit(value => value + 100)}>Load more events ({ordered.length - limit} remaining)</button>}
      </section>
    </div>
  );
}
