import { SOURCES, fmtDay, successRate, type Fixture } from '../data';
import YearPicker from '../YearPicker';

const PITCH = 20; // 16px cell + 4px gap
const DOW = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** One combined calendar for all agents, with the per-agent split beneath it.
 *  Two side-by-side grids made the eye compare shapes that were never comparable;
 *  a single grid answers "when did I work", and the split answers "with what". */
export default function Rail({
  fx, days, selected, onSelect, year, onYear,
}: {
  fx: Fixture; days: string[]; selected: string; onSelect: (d: string) => void;
  year: number; onYear: (y: number) => void;
}) {

  const total = (d: string) =>
    SOURCES.reduce((n, s) => n + (fx.rollups[d]?.[s.id]?.events ?? 0), 0);
  const fails = (d: string) =>
    SOURCES.reduce((n, s) => n + (fx.rollups[d]?.[s.id]?.fail ?? 0), 0);

  const today = new Date().toISOString().slice(0, 10);
  const lead = new Date(days[0] + 'T00:00:00').getDay();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);

  const max = Math.max(1, ...days.map(total));
  const activeDays = days.filter(d => total(d) > 0).length;
  const grand = days.reduce((n, d) => n + total(d), 0);

  // Anchor each label to the column holding the 1st of that month, not to the
  // first non-empty day of a week — the lead padding otherwise shifts every label.
  const ticks: { label: string; col: number }[] = [];
  for (let m = 0; m < 12; m++) {
    const first = cells.findIndex(d => !!d && Number(d.split('-')[1]) - 1 === m && d.endsWith('-01'));
    if (first < 0) continue;
    const col = Math.floor(first / 7);
    if (ticks.length && col - ticks[ticks.length - 1].col < 2) continue;
    ticks.push({ label: MON[m], col });
  }

  return (
    <div className="panel">
      <div className="cal">
        <div className="calhead">
          <b>{grand.toLocaleString()} events</b>
          <span>across {activeDays} active {activeDays === 1 ? 'day' : 'days'}</span>
          <YearPicker value={year} onChange={onYear} />
        </div>

        <div className="months">
          {ticks.map(t => <span key={t.label + t.col} style={{ left: t.col * PITCH }}>{t.label}</span>)}
        </div>

        <div className="calbody">
          <div className="dows">{DOW.map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="cells">
            {cells.map((d, i) => {
              if (!d) return <span key={`e${i}`} className="c" data-e="1" />;
              const n = total(d);
              const step = n === 0 ? 0 : Math.min(4, 1 + Math.floor((Math.log1p(n) / Math.log1p(max)) * 3.99));
              return (
                <button
                  key={d}
                  className="c"
                  data-sel={d === selected ? 1 : 0}
                  data-fail={fails(d) > 0 ? 1 : 0}
                  style={{ background: `var(--a${step})` }}
                  onClick={() => onSelect(d)}
                  data-future={d > today ? 1 : 0}
                  title={`${fmtDay(d)}\n${n} events${fails(d) ? ` · ${fails(d)} failed` : ''}`}
                  aria-label={`${fmtDay(d)}, ${n} events`}
                />
              );
            })}
          </div>
        </div>

        <div className="calfoot">
          <span className="sp" />
          Less {[0, 1, 2, 3, 4].map(k => <i key={k} style={{ background: `var(--a${k})` }} />)} More
        </div>
      </div>

      <div className="split">
        {SOURCES.map(src => {
          const rolls = days.map(d => fx.rollups[d]?.[src.id]);
          const ev = rolls.reduce((n, r) => n + (r?.events ?? 0), 0);
          const active = rolls.filter(r => (r?.events ?? 0) > 0).length;
          const rate = successRate(rolls);
          return (
            <div className="arow" key={src.id}>
              <i className="chip" style={{ background: `var(${src.varName})` }} />
              <span className="aname">{src.label}</span>
              <span className="ashare">
                <i style={{ width: `${grand ? (ev / grand) * 100 : 0}%`, background: `var(${src.varName})` }} />
              </span>
              <span className="astat">
                <b>{ev.toLocaleString()}</b> events · {active} days
                {rate !== null && <> · <b>{rate.toFixed(0)}%</b> ok</>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
