export type Src = 'claude-code' | 'codex';
export type Kind = 'user' | 'agent' | 'tool';
export type St = 'unknown' | 'running' | 'succeeded' | 'failed' | 'interrupted' | 'canceled' | 'ok' | 'fail' | 'run';

export interface Ev { t:number; d:string; src:Src; s:string; k:Kind; st:St; n?:string; ms?:number; id?:string }
export interface Sess {
  id:string; src:Src; title:string; proj:string; model:string|null;
  start:number; end:number; d:string; summary?:string|null;
  summary_state?:'ready'|'pending'|'not_requested'|'failed';
}
export interface Tool { name:string; count:number; ok:number; fail:number; p50:number; p90:number; max:number }
export interface Roll { sessions:number; events:number; tools:number; ok:number; fail:number }
export interface Tk { in:number; out:number; cr:number; cw:number; th:number }
export interface Story { t:number; d:string; s:string; src:Src; k:'user'|'agent'; x:string }
export interface Fixture {
  generated:string;
  rollups:Record<string, Partial<Record<Src, Roll>>>;
  sessions:Sess[]; events:Ev[]; tools:Tool[];
  tokens:Record<string,Tk>; story:Story[];
  stats:{ files:number; corpus_gb:number; strokes:number };
}

export const SOURCES: { id:Src; label:string; varName:string }[] = [
  { id:'claude-code', label:'Claude Code', varName:'--claude' },
  { id:'codex',       label:'Codex',       varName:'--codex' },
];

export async function loadFixture(): Promise<Fixture> {
  const r = await fetch('/fixture.json');
  if (!r.ok) throw new Error(`fixture ${r.status}`);
  return r.json();
}

/** Calendar key for controls. Captured event buckets use the originating local_day
 *  supplied by Linus; browsing in another timezone never rewrites that history. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

export const addDays = (k: string, n: number) => {
  const [y,m,d] = k.split('-').map(Number);
  const dt = new Date(y, m-1, d + n);
  return dayKey(dt);
};

/** Every day of a calendar year, so the remainder of the year renders as empty
 *  cells instead of the grid simply stopping. */
export function yearDays(year: number) {
  const out: string[] = [];
  const d = new Date(year, 0, 1);
  while (d.getFullYear() === year) { out.push(dayKey(d)); d.setDate(d.getDate() + 1); }
  return out;
}

export const FIRST_YEAR = 2023;

export function yearOptions() {
  const now = new Date().getFullYear();
  const out: number[] = [];
  for (let y = now; y >= FIRST_YEAR; y--) out.push(y);
  return out;
}

/** Health is derived, and an idle day is grey — never red. A day you did not
 *  code is not an outage, and conflating the two makes the rail meaningless. */
export type Health = 'idle' | 'ok' | 'degraded' | 'outage';
export function health(r?: Roll): Health {
  if (!r || r.sessions === 0 && r.events === 0) return 'idle';
  const done = r.ok + r.fail;
  if (done > 0 && r.fail / done > 0.25) return 'outage';
  if (r.fail > 0) return 'degraded';
  return 'ok';
}

/** Completed successes over calls with a known outcome. Running and unknown are
 *  excluded rather than counted as failures. */
export function successRate(rolls: (Roll|undefined)[]) {
  let ok = 0, done = 0;
  for (const r of rolls) { if (!r) continue; ok += r.ok; done += r.ok + r.fail; }
  return done === 0 ? null : (ok / done) * 100;
}

export const isSucceeded = (status: St) => status === 'succeeded' || status === 'ok';
export const isFailed = (status: St) => status === 'failed' || status === 'fail';
export const isRunning = (status: St) => status === 'running' || status === 'run';

export const fmtMs = (ms:number) =>
  ms < 1000 ? `${Math.round(ms)}ms` : ms < 60000 ? `${(ms/1000).toFixed(1)}s` : `${Math.round(ms/60000)}m`;

export const fmtDur = (ms:number) => {
  const m = Math.round(ms/60000);
  return m < 60 ? `${m}m` : `${Math.floor(m/60)}h${String(m%60).padStart(2,'0')}m`;
};

export const fmtDay = (k:string) => {
  const [y,m,d] = k.split('-').map(Number);
  return new Date(y,m-1,d).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'});
};

export const fmtTok = (n:number) =>
  n >= 1e9 ? `${(n/1e9).toFixed(1)}B` : n >= 1e6 ? `${(n/1e6).toFixed(1)}M`
  : n >= 1e3 ? `${(n/1e3).toFixed(0)}K` : String(n);

/** Corrective phrasing, used to mark work that had to be redone. Sentence-initial
 *  or multi-word only — a bare "no" inside a sentence is not a correction. */
export const CORRECTIVE =
  /(^|[.!?]\s+)(no|nope|wrong|not what|i said|as i said|you didn'?t|that'?s wrong|i asked|instead|revert|undo|stop)\b/i;
