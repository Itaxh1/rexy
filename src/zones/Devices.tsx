import type { Fixture } from '../data';

/** Import progress is reported in bytes, not files — one 5,094 MB transcript is a
 *  single unit of a file counter, so a file-based bar sits visibly frozen. */
export default function Devices({ fx }: { fx: Fixture }) {
  return (
    <div className="panel">
      <div className="dev">
        <span><i className="on" /><b>MacBook</b> · online, last synced 2s ago</span>
        <span>{fx.stats.files} transcripts · {fx.stats.corpus_gb} GB read · {fx.stats.strokes.toLocaleString()} events</span>
        <span style={{ marginLeft: 'auto' }}>All history imported</span>
      </div>
    </div>
  );
}
