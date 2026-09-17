import InstallCommand from './InstallCommand';
import RexyLogo from './RexyLogo';
import { useDevices } from './useDevices';

export default function Connect({ token, onContinue, onRefresh, onLogout }: {
  token: string;
  onContinue: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  const { devices, error, reload } = useDevices(token);
  const connected = devices?.find(device => device.status === 'connected');
  return (
    <>
      <header className="top">
        <RexyLogo />
        <span className="spacer" />
        <button className="pill ghost" onClick={onLogout}>Log out</button>
      </header>

      <main className="connect">
        <h1>Connect this computer</h1>
        <p className="lede">{connected ? 'Your computer is linked to Rexy.' : 'Run one command. Your history appears here.'}</p>

        {!connected && <InstallCommand token={token} />}

        <div className="connection-status" role="status" aria-live="polite">
          <strong>{connected ? 'Device connected' : devices === null ? 'Checking connection…' : 'Waiting for Linus…'}</strong>
          <p>{connected
            ? `${connected.name} · ${connected.platform}`
            : 'After you run the command, this screen updates automatically.'}</p>
          {connected && <p>{connected.last_upload_at
            ? `${connected.sessions.toLocaleString()} sessions received. Your timeline updates as more history arrives.`
            : 'Waiting for the first upload. Large histories can take a moment to scan. Keep Linus running in your terminal.'}</p>}
        </div>
        {error && <p className="formmsg error" role="alert">Could not check the connection. Retrying automatically. {error}</p>}
        {connected && <button className="pill" onClick={onContinue}>View dashboard</button>}

        <div className="cxfoot">
          <div>
            <h5>Reads</h5>
            <p><code>~/.claude/projects</code><br /><code>~/.codex/sessions</code></p>
          </div>
          <div>
            <h5>Uploads</h5>
            <p>Timestamps, tool names, short previews.<br />Transcripts stay on your machine.</p>
          </div>
        </div>

        <p className="icmeta">
          <button className="link" onClick={() => { reload(); onRefresh(); }}>Check again</button>
        </p>
      </main>
    </>
  );
}
