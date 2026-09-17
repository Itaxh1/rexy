import type { Src } from '../data';
import { localDayAxis, type DayRibbon, type RibbonEvent, type SessionHeader, type ToolStatus } from '../dayRibbon';

/** STUB — synthetic day-ribbon data shaped like §7's DayRibbonResponse, for UI work
 *  before the split API is deployed. Deterministic per date, so a day always renders
 *  the same while different days vary. Replace with GET /v1/day/ribbon. */

interface Plan {
  src: Src; title: string; proj: string; model: string;
  startH: number; hours: number;
  burst: [number, number];   // tool calls per exchange, min..max
  idleMin: number;           // longest pause between exchanges, minutes
  measured: boolean;         // Claude records tool durations; Codex does not
  optional?: boolean;
}

const PLANS: Plan[] = [
  { src: 'claude-code', title: 'Day API contract review', proj: 'render-backend', model: 'claude-opus-5',
    startH: 9.2, hours: 1.3, burst: [1, 4], idleMin: 7, measured: true },
  { src: 'claude-code', title: 'Per-session ribbons', proj: 'Rexy', model: 'claude-opus-5',
    startH: 14.5, hours: 2.3, burst: [2, 7], idleMin: 5, measured: true },
  { src: 'claude-code', title: 'Light-mode contrast pass', proj: 'Rexy', model: 'claude-opus-5',
    startH: 20.1, hours: 0.5, burst: [1, 3], idleMin: 4, measured: true, optional: true },
  { src: 'codex', title: 'Overnight history import', proj: 'linus', model: 'gpt-5-codex',
    startH: -1.4, hours: 2.6, burst: [2, 6], idleMin: 12, measured: false },
  { src: 'codex', title: 'Split day endpoints', proj: 'render-backend', model: 'gpt-5-codex',
    startH: 11.0, hours: 2.8, burst: [4, 14], idleMin: 3, measured: false },
  { src: 'codex', title: 'Resume without a spent claim', proj: 'linus', model: 'gpt-5-codex',
    startH: 18.4, hours: 0.7, burst: [2, 5], idleMin: 6, measured: false, optional: true },
];

const TOOLS: Record<Src, string[]> = {
  'claude-code': ['Bash', 'Read', 'Edit', 'Grep', 'Write', 'Bash', 'Read'],
  codex: ['exec_command', 'apply_patch', 'exec_command', 'read_file', 'exec_command'],
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};

export function stubDayRibbon(day: string): DayRibbon {
  const axis = localDayAxis(day);
  const rand = mulberry32(hash(day));
  const between = (a: number, b: number) => a + rand() * (b - a);
  const int = (a: number, b: number) => Math.floor(between(a, b + 1));
  const idBase = String(hash(`${day}:ids`)).padStart(10, '0');
  let serial = 0;
  const nextId = () => `${idBase}${String(serial++).padStart(6, '0')}`;

  const sessions: SessionHeader[] = [];
  const events: RibbonEvent[] = [];

  for (const plan of PLANS) {
    if (plan.optional && rand() < 0.45) continue;
    const jitter = between(-0.5, 0.5);
    const start = axis.start_ms + (plan.startH + jitter) * 3_600_000;
    const stop = start + plan.hours * between(0.8, 1.15) * 3_600_000;
    const sessionId = nextId();
    const own: RibbonEvent[] = [];
    const push = (t: number, k: RibbonEvent['k'], st: ToolStatus = 'unknown', n: string | null = null, ms: number | null = null) =>
      own.push({ id: nextId(), t: Math.round(t), d: day, src: plan.src, s: sessionId, k, st, n, ms });

    let t = start;
    while (t < stop) {
      push(t, 'user');
      t += between(4, 40) * 1000;
      push(t, 'agent');
      const calls = int(plan.burst[0], plan.burst[1]);
      for (let i = 0; i < calls && t < stop; i++) {
        t += between(2, 26) * 1000;
        // ~1.5%, matching measured Claude sessions (2 failures in 129 tool calls).
        const failed = rand() < 0.015;
        // Log-uniform 40 ms – 45 s, the spread real tool calls show.
        const ms = plan.measured ? Math.round(Math.exp(between(Math.log(40), Math.log(45_000)))) : null;
        push(t, 'tool', failed ? 'failed' : 'succeeded', TOOLS[plan.src][int(0, TOOLS[plan.src].length - 1)]!, ms);
      }
      t += between(5, 30) * 1000;
      push(t, 'agent');
      // Mostly short pauses; occasionally a real break that leaves a visible gap.
      t += (rand() < 0.12 ? between(12, 26) : between(0.3, plan.idleMin)) * 60_000;
    }

    const inDay = own.filter(e => e.t >= axis.start_ms && e.t < axis.end_ms);
    if (!inDay.length) continue;
    sessions.push({
      id: sessionId, src: plan.src, title: plan.title, proj: plan.proj, model: plan.model,
      start: own[0]!.t, end: own[own.length - 1]!.t, d: day,
      day_first_ms: inDay[0]!.t, day_last_ms: inDay[inDay.length - 1]!.t,
    });
    events.push(...inDay);
  }

  sessions.sort((a, b) => a.day_first_ms - b.day_first_ms);
  events.sort((a, b) => a.t - b.t);
  return { date: day, axis, off_axis_event_ids: [], sessions, events };
}
