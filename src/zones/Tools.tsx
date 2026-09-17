import { fmtMs, type Tool } from '../data';

/** Latency shown in plain words. Claude timestamps tool results independently so
 *  the timing is real; Codex writes call and result together, so its durations
 *  are absent rather than invented. */
export default function Tools({ tools }: { tools: Tool[] }) {
  if (!tools.length) {
    return <div className="panel"><div className="empty">No actions with a known result on this day.</div></div>;
  }
  const top = Math.max(...tools.map(t => t.count));
  const scale = Math.max(...tools.map(t => t.max ?? 0)) || 1;

  return (
    <div className="panel">
      {tools.map(t => (
        <div className="trow" key={t.name}>
          <div className="tn">{t.name}</div>
          <div>
            <div className="tbar">
              <i style={{ width: `${(t.ok / top) * 100}%`, background: 'var(--tool)' }} />
              {t.fail > 0 && <i style={{ width: `${Math.max(3, (t.fail / top) * 100)}%`, background: 'var(--crit)' }} />}
            </div>
            {t.max !== null && t.p50 !== null && t.p90 !== null && (
              <>
                <div className="lat">
                  <span className="tr" />
                  <u className="a" style={{ left: `${(t.p50 / scale) * 100}%` }} />
                  <u className="b" style={{ left: `${(t.p90 / scale) * 100}%` }} />
                  <u className="c" style={{ left: `${(t.max / scale) * 100}%` }} />
                </div>
                <div className="latl">
                  usually {fmtMs(t.p50)} · slow ones {fmtMs(t.p90)} · worst {fmtMs(t.max)}
                </div>
              </>
            )}
          </div>
          <div className="tnum">
            {t.count}
            <small>{t.ok} succeeded · {t.fail} failed{t.count > t.ok + t.fail ? ` · ${t.count - t.ok - t.fail} other/unknown` : ''}</small>
            {t.max === null && <small>Duration not recorded</small>}
          </div>
        </div>
      ))}
    </div>
  );
}
