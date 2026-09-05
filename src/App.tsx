import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import Auth from './auth/Auth';
import Connect from './Connect';
import Rail from './zones/Rail';
import Stats from './zones/Stats';
import Ribbon from './zones/Ribbon';
import Sessions from './zones/Sessions';
import Timeline from './zones/Timeline';
import Tools from './zones/Tools';
import { loadDashboard, requestSummary } from './api';
import { getSupabase } from './lib/supabase';
import { applyTheme, readTheme, type Theme } from './theme';
import { addDays, dayKey, fmtDay, fmtTok, isFailed, isSucceeded, loadFixture, yearDays, type Fixture, type Tool } from './data';


export default function App() {
  const demo = new URLSearchParams(location.search).has('demo');
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(demo);
  const [fx, setFx] = useState<Fixture | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [year, setYear] = useState(
    () => Number(new URLSearchParams(location.search).get('year')) || new Date().getFullYear(),
  );
  const [day, setDay] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(
    () => (new URLSearchParams(location.search).get('theme') as Theme) || readTheme(),
  );

  useEffect(() => { applyTheme(theme); }, [theme]);

  useEffect(() => {
    if (demo) return;
    let active = true;
    let unsubscribe = () => {};
    getSupabase().then(async supabase => {
      const { data } = await supabase.auth.getSession();
      if (active) {
        setSession(data.session);
        setAuthReady(true);
      }
      const listener = supabase.auth.onAuthStateChange((_event, next) => {
        if (active) setSession(next);
      });
      unsubscribe = () => listener.data.subscription.unsubscribe();
    }).catch(error => {
      if (active) {
        setErr(String(error));
        setAuthReady(true);
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [demo]);

  useEffect(() => {
    const token = session?.access_token;
    if (!demo && !token) {
      setFx(null);
      return;
    }
    setErr(null);
    const requestedDay = day.startsWith(String(year)) ? day : undefined;
    const source = demo ? loadFixture() : loadDashboard(year, token!, requestedDay);
    source
      .then(f => {
        setFx(f);
        const ds = Object.keys(f.rollups).sort();
        setDay(current => current.startsWith(String(year)) ? current : ds[ds.length - 1] ?? `${year}-01-01`);
      })
      .catch(e => setErr(String(e)));
  }, [demo, session?.access_token, year, day, refresh]);

  useEffect(() => {
    if (demo || !session || !fx) return;
    const timer = window.setInterval(() => setRefresh(value => value + 1), 5_000);
    return () => window.clearInterval(timer);
  }, [demo, session, fx]);

  const days = useMemo(() => yearDays(year), [year]);
  const dayEvents = useMemo(() => (fx ? fx.events.filter(e => e.d === day) : []), [fx, day]);
  useEffect(() => {
    if (!fx || day.startsWith(String(year))) return;
    const inYear = Object.keys(fx.rollups).filter(d => d.startsWith(String(year))).sort();
    setDay(inYear.length ? inYear[inYear.length - 1] : `${year}-01-01`);
  }, [year, fx, day]);

  const dayStory = useMemo(
    () => (fx ? fx.story.filter(s => s.d === day) : []),
    [fx, day],
  );
  const dayTokens = fx?.tokens?.[day];

  const daySessions = useMemo(
    () => (fx ? fx.sessions.filter(s => s.d === day).sort((a, b) => a.start - b.start) : []),
    [fx, day],
  );

  const dayTools = useMemo<Tool[]>(() => {
    const m = new Map<string, { d: number[]; count: number; ok: number; fail: number }>();
    for (const e of dayEvents) {
      if (e.k !== 'tool' || !e.n) continue;
      const g = m.get(e.n) ?? { d: [], count: 0, ok: 0, fail: 0 };
      g.count++;
      if (e.ms != null) g.d.push(e.ms);
      if (isFailed(e.st)) g.fail++;
      if (isSucceeded(e.st)) g.ok++;
      m.set(e.n, g);
    }
    return [...m.entries()].map(([name, g]) => {
      const s = g.d.sort((a, b) => a - b);
      return {
        name, count: g.count, ok: g.ok, fail: g.fail,
        p50: s.length ? s[s.length >> 1] : 0,
        p90: s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] : 0,
        max: s.length ? s[s.length - 1] : 0,
      };
    }).sort((a, b) => b.count - a.count);
  }, [dayEvents]);

  const logout = async () => {
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
  if (err) return <main><div className="panel"><div className="empty">Could not load data.<br /><code>{err}</code></div></div></main>;
  if (!fx) return <main><div className="panel"><div className="empty">Loading your activity…</div></div></main>;
  if (!demo && session && fx.stats.strokes === 0) {
    return <Connect token={session.access_token} onRefresh={() => setRefresh(value => value + 1)} onLogout={logout} />;
  }

  return (
    <>
      {actionErr && <div className="action-error" role="alert">{actionErr}</div>}
      <header className="top">
        <span className="logo">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <rect x="1" y="1" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M5 13.5 9 6.5l3 5 1.2-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Rexy
        </span>
        <nav className="nav">
          <span className="sl">/</span>
          <button aria-current="true" onClick={() => document.getElementById('activity')?.scrollIntoView()}>Activity</button>
          <span className="sl">/</span>
          <button onClick={() => document.getElementById('sessions')?.scrollIntoView()}>Sessions</button>
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

      <main>
        <section className="sec" id="activity">
          <div className="sec-h">
            <h2>Your agents</h2>
            <span className="n">Click any day to see what happened</span>
          </div>
          <Rail fx={fx} days={days} selected={day} onSelect={setDay}
                year={year} onYear={setYear} />
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

        <section className="sec" id="sessions">
          <Stats events={dayEvents} sessions={daySessions} tools={dayTools} />
          {dayTokens && (
            <div className="panel" style={{ marginTop: 10 }}>
              <div className="toks">
                {/* Cache read dwarfs fresh input by ~100,000x, so the breakdown is
                    shown rather than one meaningless "tokens used" total. */}
                <span><b>{fmtTok(dayTokens.out)}</b>written by the agent</span>
                <span><b>{fmtTok(dayTokens.th)}</b>of that was thinking</span>
                <span><b>{fmtTok(dayTokens.cr)}</b>re-read from cache</span>
                <span><b>{fmtTok(dayTokens.in)}</b>fresh input</span>
              </div>
            </div>
          )}
        </section>

        <section className="sec">
          <div className="sec-h">
            <h2>When it happened</h2>
            <span className="n">every mark is one event · hover to inspect</span>
          </div>
          <Ribbon day={day} events={dayEvents} sessions={daySessions} onOpen={setOpenSession} />
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
            <h2>What happened</h2>
            <span className="n">each exchange, top to bottom · red marks work that had to be redone</span>
          </div>
          <Timeline story={dayStory} events={dayEvents} onOpen={setOpenSession} />
        </section>

        <section className="sec">
          <div className="sec-h">
            <h2>Tool calls</h2>
            <span className="n">completed results and measured latency</span>
          </div>
          <Tools tools={dayTools} />
        </section>
      </main>
      {openSession && (
        <SessionInspector
          session={daySessions.find(item => item.id === openSession)}
          events={dayEvents.filter(item => item.s === openSession)}
          story={dayStory.filter(item => item.s === openSession)}
          onClose={() => setOpenSession(null)}
        />
      )}
    </>
  );
}

function SessionInspector({ session, events, story, onClose }: {
  session: import('./data').Sess | undefined;
  events: import('./data').Ev[];
  story: import('./data').Story[];
  onClose: () => void;
}) {
  if (!session) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="session-modal" role="dialog" aria-modal="true" aria-label={session.title}
               onMouseDown={event => event.stopPropagation()}>
        <header><h2>{session.title}</h2><button className="btn" onClick={onClose}>Close</button></header>
        <p className="srmeta">{session.src} / {session.proj} / {events.length} events</p>
        {session.summary && <p className="modal-summary">{session.summary}</p>}
        <ol className="modal-story">
          {story.map((item, index) => (
            <li key={`${item.t}-${index}`}>
              <time>{new Date(item.t).toLocaleTimeString()}</time>
              <b>{item.k === 'user' ? 'You' : 'Agent'}</b>
              <p>{item.x}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
