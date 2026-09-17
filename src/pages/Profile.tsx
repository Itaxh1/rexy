import type { ReactNode } from 'react';
import { profile as demoProfile } from './profile.stub';
import type { Achievement, ProfileData, ProfileResponse } from '../insightTypes';
import { useSaved } from '../useSaved';

/** Profile: totals, consistency, personal records and achievements.
 *  STUB — renders a snapshot (profile.stub.ts); nothing here calls the API.
 *  Reuses dashboard primitives: .panel, .sec-h headings, calendar .c cells on
 *  the same --a ramp, .tbar bars and .pill buttons. */

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
const n = (v: number | null) => v === null ? '—' : v.toLocaleString();

/** Same five-step ramp as the calendar: 0, 1–2, 3–4, 5–6, 7 active days. */
const weekStep = (days: number) => (days === 0 ? 0 : days < 3 ? 1 : days < 5 ? 2 : days < 7 ? 3 : 4);

export function LiveProfile({ who, account, token }: { who: string; account: string; token: string }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data, error, cached, reload } = useSaved<ProfileResponse>(`/v1/profile?tz=${encodeURIComponent(tz)}`, account, token);
  return <>
    <div className="connection-status" role="status">
      {error ? `Could not refresh: ${error}. Saved data stays visible.` : cached ? 'Saved profile · checking for updates…' : data?.updating ? 'Updating profile from imported history…' : 'Profile from saved account data'}
      {error && <button className="link" onClick={reload}>Retry</button>}
    </div>
    {data?.profile ? <ProfilePage who={who} profile={data.profile} />
      : <main><div className="panel empty">{error ? 'Profile is temporarily unavailable.' : 'Preparing your profile from imported history…'}</div></main>}
  </>;
}

export default function ProfilePage({ who, profile = demoProfile }: { who: string; profile?: ProfileData }) {
  const { streak } = profile;
  const qualifying = profile.weeks.filter(([, d]) => d >= 3).length;
  const initial = who.match(/[a-z0-9]/i)?.[0]?.toUpperCase();
  const daysSince = profile.since ? Math.round((Date.parse(profile.asOf) - Date.parse(profile.since)) / 86_400_000) + 1 : 0;
  const totals = [
    { label: 'Active days', value: profile.activeDays, note: `of ${n(daysSince)} days` },
    { label: 'Prompts', value: profile.prompts, note: `${profile.activeDays ? Math.round(profile.prompts / profile.activeDays) : 0} per active day` },
    { label: 'Tool calls', value: profile.toolCalls, note: profile.prompts ? `${Math.round(profile.toolCalls / profile.prompts)} per prompt` : 'No prompts recorded' },
    { label: 'Sub-agents', value: profile.subagents, note: profile.subagents === null ? 'Not tracked yet' : `in ${profile.subagentSessions} sessions` },
    { label: profile.coverage ? 'Project labels' : 'Projects', value: profile.projectsTotal, note: `${profile.projectsActive} active on 5+ days` },
  ];

  return (
    <main className="pf">
      <header className="panel pf-hero">
        <div className="pf-id">
          <span className="pf-avatar" aria-hidden="true">
            {initial ?? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.2-3.6 3.8-5.5 7-5.5s5.8 1.9 7 5.5" />
              </svg>
            )}
          </span>
          <div>
            <h1>{who || 'Your profile'}</h1>
            <p>Claude Code and Codex · {profile.since ? `since ${fmtDate(profile.since)}` : 'No imported activity yet'}</p>
          </div>
          <span className="pf-asof">As of {fmtDate(profile.asOf)}</span>
        </div>
        <dl className="pf-totals">
          {totals.map(t => (
            <div key={t.label}><dt>{t.label}</dt><dd>{n(t.value)}</dd><p>{t.note}</p></div>
          ))}
        </dl>
      </header>

      {profile.coverage && <p className="pf-muted">{profile.coverage} Streaks use recorded local dates; work pattern uses {profile.timezone}.</p>}
      <section className="sec">
        <div className="sec-h">
          <h2>Consistency</h2>
          <span className="n">a week counts when you are active on 3 or more days</span>
        </div>
        <div className="panel pf-streak">
          <dl className="pf-figures">
            <div><dt>Weekly streak</dt><dd>{streak.weeklyCurrent}<small>weeks</small></dd><p>Best {streak.weeklyBest} weeks</p></div>
            <div><dt>Daily streak</dt><dd>{streak.dailyCurrent}<small>days</small></dd>
              <p>Best {streak.dailyBest} days · {shortRange(streak.dailyBestRange)}</p></div>
            <div><dt>Streak freeze</dt><dd>{streak.freezes ?? '—'}{streak.freezes !== null && <small>available</small>}</dd><p>{streak.freezes === null ? 'Not tracked yet' : 'One is added each week'}</p></div>
          </dl>

          <div className="pf-weeks">
            <div className="pf-weeks-head">
              <span className="pf-label">Last 26 weeks</span>
              <span className="pf-muted">{qualifying} of 26 weeks counted</span>
            </div>
            <div className="pf-cells" role="list" aria-label="Active days per week, last 26 weeks">
              {profile.weeks.map(([start, days], i) => {
                const end = profile.weeks.length - (profile.weeks.at(-1)![1] < 3 ? 1 : 0);
                const inCurrentRun = i < end && i >= end - streak.weeklyCurrent;
                return (
                  <span key={start} role="listitem" className="c pf-cell"
                    data-run={inCurrentRun ? 1 : 0}
                    style={{ background: `var(--a${weekStep(days)})` }}
                    title={`Week of ${fmtDate(start)}: ${days} active ${days === 1 ? 'day' : 'days'}`}
                    aria-label={`Week of ${fmtDate(start)}, ${days} active days`} />
                );
              })}
            </div>
            <div className="pf-months" aria-hidden="true">
              {profile.weeks.map(([start], i) => {
                const month = new Date(`${start}T00:00:00`).getMonth();
                const prev = i > 0 ? new Date(`${profile.weeks[i - 1]![0]}T00:00:00`).getMonth() : -1;
                return <span key={start}>{month !== prev ? new Date(`${start}T00:00:00`).toLocaleDateString([], { month: 'short' }) : ''}</span>;
              })}
            </div>
            <div className="calfoot pf-legend">
              <span className="pf-muted">Outlined: current run</span>
              <span className="sp" />
              Fewer {[0, 1, 2, 3, 4].map(k => <i key={k} style={{ background: `var(--a${k})` }} />)} More
            </div>
          </div>
        </div>
      </section>

      <div className="pf-cols">
        <section className="sec">
          <div className="sec-h"><h2>Personal records</h2><span className="n">only against your past self</span></div>
          <div className="panel">
            {profile.records.map(r => (
              <div className="pf-rec" key={r.label}>
                <span className="pf-rec-label">{r.label}</span>
                <b>{r.value}</b>
                <span className="pf-muted">{r.date}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="sec">
          <div className="sec-h"><h2>Work pattern</h2><span className="n">share of prompts by time of day</span></div>
          <div className="panel pf-pattern">
            <div className="pf-seg" role="img"
              aria-label={profile.hours.map(h => `${h.label} ${h.pct}%`).join(', ')}>
              {profile.hours.map((h, i) => <i key={h.label} style={{ width: `${h.pct}%`, background: `var(--a${i + 1})` }} />)}
            </div>
            <div className="pf-seg-key">
              {profile.hours.map((h, i) => (
                <span key={h.label}><i style={{ background: `var(--a${i + 1})` }} />
                  <b>{h.pct}%</b> {h.label} <em>{h.range}</em></span>
              ))}
            </div>
            <div className="pf-label pf-sub">{profile.coverage ? 'Most-used agent tools' : 'Most-run agent commands'}</div>
            {profile.commands.map(c => (
              <div className="pf-cmd" key={c.name}>
                <code>{c.name}</code>
                <div className="tbar"><i style={{ width: `${(c.runs / profile.commands[0]!.runs) * 100}%`, background: 'var(--tool)' }} /></div>
                <span>{n(c.runs)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="sec">
        <div className="sec-h">
          <h2>Achievements</h2>
          <span className="n">{profile.achievements.filter(a => a.status === 'earned').length} earned</span>
        </div>
        <div className="pf-badges">
          {profile.achievements.map(a => <Badge key={a.id} a={a} />)}
        </div>
      </section>
    </main>
  );
}

function shortRange(range: readonly [string, string] | null) {
  if (!range) return 'No streak yet';
  const [a, b] = range;
  const f = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${f(a)} – ${f(b)}`;
}

function Badge({ a }: { a: Achievement }) {
  const pct = a.value !== undefined && a.target ? Math.min(100, (a.value / a.target) * 100) : a.status === 'earned' ? 100 : 0;
  const shown = a.display ?? (a.value !== undefined && a.target !== undefined ? `${n(a.value)} / ${n(a.target)}` : '');
  return (
    <div className="pf-badge" data-status={a.status}>
      <span className="pf-icon" aria-hidden="true"><Icon id={a.id} /></span>
      <div className="pf-badge-body">
        <div className="pf-badge-top">
          <b>{a.name}</b>
          <span className="pf-badge-state">
            {a.status === 'earned' && <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="m3 8 3.2 3.2L13 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>}
            {a.status === 'earned' ? 'Earned' : a.status === 'progress' ? `${Math.floor(pct)}%` : 'Not tracked yet'}
          </span>
        </div>
        <p>{a.rule}</p>
        {a.status !== 'untracked' && <>
          <div className="pf-bar" role="progressbar" aria-label={`${a.name} progress`}
            aria-valuenow={Math.floor(pct)} aria-valuemin={0} aria-valuemax={100}
            aria-valuetext={a.status === 'earned' ? `Earned${shown ? ` · ${shown}` : ''}` : `${shown} toward ${a.name}`}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <span className="pf-muted pf-badge-value">
            {shown}{a.status === 'progress' && a.value !== undefined && a.target !== undefined ? ` · ${n(a.target - a.value)} to go` : ''}
          </span>
        </>}
      </div>
    </div>
  );
}

function Icon({ id }: { id: Achievement['id'] }) {
  // Original emblems: Diffusion-inspired precision lines and dotted geometry,
  // using Rexy's existing palette. No external artwork, fonts or animation.
  const shapes: Record<Achievement['id'], ReactNode> = {
    fire: <>
      <path d="M25 5c2 9-8 12-5 19 1 3 5 3 6 0 1-2 0-4-1-6 9 4 13 10 11 17-2 6-7 9-13 9S10 39 10 32C10 20 23 17 25 5Z" fill="currentColor" fillOpacity=".1" />
      <path d="M25 5c2 9-8 12-5 19 1 3 5 3 6 0 1-2 0-4-1-6 9 4 13 10 11 17-2 6-7 9-13 9S10 39 10 32C10 20 23 17 25 5Z" />
      <path d="M16 33c0 5 3 8 7 8M29 31c2 4 0 8-3 9" opacity=".5" />
      <circle cx="10" cy="15" r="1" fill="currentColor" stroke="none" /><circle cx="35" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>,
    steady: <>
      <rect x="7" y="11" width="34" height="31" rx="3" /><path d="M7 20h34M16 6v10M32 6v10" />
      <path d="M8 12h32v8H8Z" fill="currentColor" fillOpacity=".1" stroke="none" />
      {[14, 24, 34].flatMap(x => [26, 34].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill="currentColor" stroke="none" />))}
      <path d="m19 33 4 4 10-11" strokeWidth="2" />
    </>,
    comeback: <>
      <path d="M39 23a15 15 0 1 1-5-11M39 6v10H29" /><path d="M14 26a10 10 0 0 0 18 5" opacity=".45" />
      <path d="m19 26 4-5 4 5M23 21v13" />
      <circle cx="41" cy="32" r="1" fill="currentColor" stroke="none" /><circle cx="37" cy="39" r="1" fill="currentColor" stroke="none" />
    </>,
    bigday: <>
      <path d="M5 39h38" opacity=".45" />
      <path d="M9 34V24M16.5 34V17M24 34V7M31.5 34V20M39 34V12" strokeWidth="3" />
      {[9, 16.5, 24, 31.5, 39].map(x => <circle key={x} cx={x} cy="44" r="1" fill="currentColor" stroke="none" />)}
      <path d="M9 18v-3M39 6V3" opacity=".45" />
    </>,
    owl: <>
      <path d="M29 7A17 17 0 1 0 41 30 16 16 0 0 1 29 7Z" fill="currentColor" fillOpacity=".1" />
      <path d="M29 7A17 17 0 1 0 41 30 16 16 0 0 1 29 7Z" />
      <path d="M14 22c-3 7 0 13 6 16" opacity=".45" />
      <path d="M38 8v8M34 12h8" /><circle cx="43" cy="22" r="1" fill="currentColor" stroke="none" />
      <circle cx="17" cy="6" r="1" fill="currentColor" stroke="none" />
    </>,
    early: <>
      <path d="M12 31a12 12 0 0 1 24 0" fill="currentColor" fillOpacity=".1" />
      <path d="M12 31a12 12 0 0 1 24 0M5 31h38M24 5v6M7 14l4 4M41 14l-4 4" />
      <path d="M10 37h28M17 42h14" opacity=".45" /><path d="M24 25v-7m-4 4 4-4 4 4" />
      <circle cx="4" cy="24" r="1" fill="currentColor" stroke="none" /><circle cx="44" cy="24" r="1" fill="currentColor" stroke="none" />
    </>,
    club: <>
      <path d="m24 5 18 9-18 9L6 14Z" fill="currentColor" fillOpacity=".1" />
      <path d="m24 5 18 9-18 9L6 14ZM6 23l18 9 18-9M6 32l18 9 18-9" />
      <path d="M24 23v18M6 14v4m36-4v4M6 23v4m36-4v4" opacity=".4" />
      <circle cx="24" cy="14" r="2" fill="currentColor" stroke="none" />
    </>,
    clean: <>
      <path d="m24 5 16 6v13c0 9-7 14-16 19C15 38 8 33 8 24V11Z" fill="currentColor" fillOpacity=".08" />
      <path d="m24 5 16 6v13c0 9-7 14-16 19C15 38 8 33 8 24V11Z" />
      <path d="m16 24 5 5 11-12" strokeWidth="2" /><path d="M13 15v8c0 5 2 8 6 11" opacity=".4" />
    </>,
    quick: <>
      <path d="M28 4 13 26h11l-3 18 15-24H25Z" fill="currentColor" fillOpacity=".1" />
      <path d="M28 4 13 26h11l-3 18 15-24H25ZM6 17h7M3 24h5M5 31h8M37 9l3-3M40 16h5" />
    </>,
    tag: <>
      <path d="m15 14 11 6v13l-11 6-11-6V20Zm18-9 11 6v13l-11 6-11-6V11Z" fill="currentColor" fillOpacity=".07" />
      <path d="m15 14 11 6v13l-11 6-11-6V20Zm18-9 11 6v13l-11 6-11-6V11Z" />
      <path d="m4 20 11 6 11-6M15 26v13m7-28 11 6 11-6M33 17v13" opacity=".45" />
      <circle cx="31" cy="40" r="1" fill="currentColor" stroke="none" /><circle cx="37" cy="36" r="1" fill="currentColor" stroke="none" />
    </>,
  };
  return (
    <svg className="pf-badge-art" width="48" height="48" viewBox="0 0 48 48" data-emblem={id}
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {shapes[id]}
    </svg>
  );
}
