import { useState } from 'react';
import { createInstallCommand } from './api';

/** Shared by first-run Connect and the Devices page, so the install flow can't
 *  drift between the two places it appears. */
export default function InstallCommand({ token }: { token: string | null }) {
  const [command, setCommand] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!token) { setError('Sign in first.'); return; }
    setBusy(true); setError(null);
    try {
      const result = await createInstallCommand(token);
      setCommand(result.command);
      setExpiresAt(result.expiresAt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!command) return;
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  if (!command) {
    return (
      <div className="ic">
        <button className="pill" onClick={generate} disabled={busy}>
          {busy ? 'Generating…' : 'Generate install command'}
        </button>
        {error && <p className="formmsg error" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="ic">
      <div className="cb">
        <code>{command}</code>
        <button onClick={copy} aria-label={copied ? 'Copied' : 'Copy command'} title="Copy">
          {copied ? <Check /> : <Copy />}
        </button>
      </div>
      <p className="icmeta">
        {expiresAt && <>Expires {new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · </>}
        one device · <button className="link" onClick={generate} disabled={busy}>new key</button>
      </p>
      {error && <p className="formmsg error" role="alert">{error}</p>}
    </div>
  );
}

const Copy = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.8" stroke="currentColor" strokeWidth="1.4" />
    <path d="M10.5 5.5v-1a1.8 1.8 0 0 0-1.8-1.8H4.3A1.8 1.8 0 0 0 2.5 4.5v4.4a1.8 1.8 0 0 0 1.8 1.8h1.2"
          stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);
const Check = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="1.7"
          strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
