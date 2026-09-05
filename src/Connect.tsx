import { useState } from 'react';
import { createInstallCommand } from './api';

export default function Connect({ token, onRefresh, onLogout }: {
  token: string;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  const [command, setCommand] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
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

  return (
    <>
      <header className="top">
        <span className="logo">Rexy</span>
        <span className="spacer" />
        <button className="btn" onClick={onLogout}>Log out</button>
      </header>
      <main className="connect">
        <section className="connect-copy">
          <h1>Connect your coding history</h1>
          <p>Linus reads Claude Code and Codex transcripts on this computer, redacts bounded previews, and uploads the normalized timeline to your Rexy account.</p>
        </section>
        <section className="panel connect-box">
          <div className="connect-step">
            <b>1</b>
            <div>
              <h2>Generate a one-time install key</h2>
              <p>The key expires in ten minutes and can connect only one device.</p>
            </div>
            <button className="btn primary" onClick={generate} disabled={busy}>
              {busy ? 'Generating…' : command ? 'Generate another' : 'Get install command'}
            </button>
          </div>
          {command && (
            <div className="command-wrap">
              <code>{command}</code>
              <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
              {expiresAt && <span>Expires {new Date(expiresAt).toLocaleTimeString()}</span>}
            </div>
          )}
          <div className="connect-step">
            <b>2</b>
            <div>
              <h2>Paste it into a terminal</h2>
              <p>Keep the command running for the first import. Rexy checks for uploaded events automatically.</p>
            </div>
            <button className="btn" onClick={onRefresh}>Check now</button>
          </div>
          {error && <p className="formmsg error" role="alert">{error}</p>}
        </section>
      </main>
    </>
  );
}
