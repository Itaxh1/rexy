import { SOURCES, fmtTok, type AgentTokens, type Src } from '../data';

export default function TokenUsage({ usage, loading = false }: { usage?: Partial<Record<Src, AgentTokens>>; loading?: boolean }) {
  return <div className="panel token-usage" aria-label="Tokens used by agent on the selected date">
    {SOURCES.map(source => {
      const tokens = usage?.[source.id];
      return <div className="toks" key={source.id}>
        <strong>{source.label}</strong>
        {tokens ? <>
          <span title={`${tokens.total.toLocaleString()} total tokens`}><b>{fmtTok(tokens.total)}</b>total tokens</span>
          <span title={tokens.in.toLocaleString()}><b>{fmtTok(tokens.in)}</b>fresh input</span>
          <span title={tokens.cr.toLocaleString()}><b>{fmtTok(tokens.cr)}</b>cached input</span>
          {tokens.cw > 0 && <span title={tokens.cw.toLocaleString()}><b>{fmtTok(tokens.cw)}</b>cache writes</span>}
          <span title={tokens.out.toLocaleString()}><b>{fmtTok(tokens.out)}</b>output</span>
          {tokens.th > 0 && <span title={tokens.th.toLocaleString()}><b>{fmtTok(tokens.th)}</b>thinking, included in output</span>}
        </> : <span>{loading ? 'Loading usage…' : 'Usage unavailable'}</span>}
      </div>;
    })}
    <p className="usage-note">Recorded usage for this date; counts fill in as history imports. Cache and thinking are not counted twice.</p>
  </div>;
}
