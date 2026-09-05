import { CORRECTIVE, isFailed, SOURCES, type Ev, type Story } from '../data';

const NOISE = /^\s*(\[Request interrupted|<ide_opened_file|<system-reminder|<local-command|<command-)/;

type Item = {
  t: number; s: string; src: Story['src'];
  ask: string; did: string[]; failed: number;
  slop: null | 'repeated' | 'interrupted';
};

/** Each entry is one exchange, summarised mechanically: what you asked, what was
 *  actually done between that prompt and the next, and whether it had to be redone.
 *  No model needed — the "did" line is derived from tool names, so it renders
 *  instantly while the Grok TLDR is still pending. */
export default function Timeline({
  story, events, onOpen,
}: { story: Story[]; events: Ev[]; onOpen: (id: string) => void }) {

  const asks = story.filter(s => s.k === 'user');
  const items: Item[] = [];
  const prev: string[] = [];

  asks.forEach((a, i) => {
    const next = asks[i + 1]?.t ?? Infinity;
    const span = events.filter(e => e.t >= a.t && e.t < next && e.k === 'tool');
    const byTool = new Map<string, number>();
    for (const e of span) if (e.n) byTool.set(e.n, (byTool.get(e.n) ?? 0) + 1);

    const interrupted = NOISE.test(a.x);
    const repeated = !interrupted &&
      (CORRECTIVE.test(a.x.slice(0, 300)) || prev.slice(-3).some(p => overlap(p, a.x) > 0.6));
    if (!interrupted) prev.push(a.x);

    items.push({
      t: a.t, s: a.s, src: a.src,
      ask: interrupted ? 'Stopped the agent mid-run' : firstSentence(a.x),
      did: [...byTool.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([n, c]) => `${n} ×${c}`),
      failed: span.filter(e => isFailed(e.st)).length,
      slop: interrupted ? 'interrupted' : repeated ? 'repeated' : null,
    });
  });

  if (!items.length) {
    return <div className="panel"><div className="empty">Nothing was asked on this day.</div></div>;
  }

  return (
    <div className="panel">
      <ol className="tl">
        {items.map((it, i) => {
          const src = SOURCES.find(x => x.id === it.src)!;
          return (
            <li key={i} className={`ti${it.slop ? ' slop' : ''}`} onClick={() => onOpen(it.s)}>
              <time>{new Date(it.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              <span className="tdot" style={{ background: it.slop ? 'var(--crit)' : `var(${src.varName})` }} />
              <div className="tbody">
                <div className="tkind">
                  {src.label}
                  {it.slop === 'repeated' && <span className="tflag">you had to repeat yourself</span>}
                  {it.slop === 'interrupted' && <span className="tflag">you stopped it</span>}
                  {it.failed > 0 && <span className="tflag warn">{it.failed} failed</span>}
                </div>
                <p className="ttext">{it.ask}</p>
                {it.did.length > 0 && (
                  <p className="tdid">
                    {it.did.map(d => <code key={d}>{d}</code>)}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function firstSentence(s: string) {
  const clean = s.replace(/```[\s\S]*?```/g, '').replace(/\s+/g, ' ').trim();
  const cut = clean.split(/(?<=[.?!])\s/)[0];
  return (cut.length > 8 && cut.length < 150 ? cut : clean.slice(0, 150)) + (clean.length > 150 ? '…' : '');
}

function overlap(a: string, b: string) {
  const A = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const B = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  if (!A.size || !B.size) return 0;
  let hit = 0; for (const w of B) if (A.has(w)) hit++;
  return hit / Math.min(A.size, B.size);
}
