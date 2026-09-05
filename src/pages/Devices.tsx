import { useState } from 'react';
import InstallCommand from '../InstallCommand';
import { revokeDevice, type Device } from '../api';
import { useDevices } from '../useDevices';

export default function DevicesPage({ token }: { token: string | null }) {
  const { devices, error, reload } = useDevices(token);
  const [addingIds, setAddingIds] = useState<string[] | null>(null);
  const [confirm, setConfirm] = useState<Device | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const added = addingIds && devices?.find(d => d.status === 'connected' && !addingIds.includes(d.id));

  const revoke = async () => {
    if (!confirm || !token) return;
    setRevoking(true); setActionError(null);
    try {
      await revokeDevice(confirm.id, token);
      setMessage(`${confirm.name} revoked. Its uploads are blocked; existing activity is retained.`);
      setConfirm(null);
      reload();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : String(caught));
    } finally { setRevoking(false); }
  };

  return (
    <main>
      <div className="dvh">
        <div>
          <h1>Devices</h1>
          <p>Every computer sending activity to this account.</p>
        </div>
        <button className="pill" disabled={!token || !devices} onClick={() => setAddingIds(ids => ids ? null : devices!.map(d => d.id))}>
          <span className="plus">+</span> Add device
        </button>
      </div>

      {(error || (!confirm && actionError)) && <p className="formmsg error" role="alert">
        {error || actionError} <button className="link" onClick={reload}>Try again</button>
      </p>}
      {message && <p className="formmsg" role="status">{message}</p>}
      {addingIds && (
        <section className="sec">
          <div className="sec-h">
            <h2>Connect another computer</h2>
            <button className="link" style={{ marginLeft: 'auto' }} onClick={() => setAddingIds(null)}>{added ? 'Done' : 'Cancel'}</button>
          </div>
          <div className="panel" style={{ padding: 20 }}>
            {added ? <div role="status">
              <strong>Device connected</strong><p>{added.name} is linked to your account.</p>
              <p>{added.last_upload_at ? 'History is arriving.' : 'Waiting for its first upload. Keep Linus running.'}</p>
            </div> : <>
              <InstallCommand token={token} />
              <p className="icmeta" role="status">Waiting for Linus. Run it on the computer you want to connect.</p>
            </>}
          </div>
        </section>
      )}

      <div className="panel">
        {!token && <div className="empty">Sign in to manage your connected computers.</div>}
        {token && devices === null && !error && <div className="empty" role="status">Loading devices…</div>}
        {devices?.length === 0 && (
          <div className="empty">No devices connected. Use <b>Add device</b> to connect one.</div>
        )}
        {devices?.map(d => (
          <article className="dv" key={d.id}>
            <div className="dvmain">
              <h3>
                <i aria-hidden="true" className={`on${d.status === 'connected' ? '' : ' off'}`} />
                {d.name}
                <span className={`tflag${d.status === 'connected' ? '' : ' warn'}`}>{d.status}</span>
              </h3>
              <p className="dvmeta">
                <span>{d.platform}</span><i>/</i>
                <span>extractor v{d.extractor_version}</span>
              </p>
              <p className="dvsub">
                Linked {new Date(d.created_at).toLocaleDateString()} · {d.sessions.toLocaleString()} sessions received
              </p>
            </div>
            <dl className="dvstats">
              <div><dt>Last upload</dt><dd>{d.last_upload_at ? new Date(d.last_upload_at).toLocaleString() : 'Awaiting first upload'}</dd></div>
            </dl>
            <button className="pill ghost danger" disabled={d.status === 'revoked'} onClick={() => { setConfirm(d); setActionError(null); }}>Revoke</button>
          </article>
        ))}
      </div>

      {confirm && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Revoke device">
          <div className="mbox">
            <h3>Revoke {confirm.name}?</h3>
            <p>
              Its token stops working immediately and it can no longer upload. Activity
              already collected stays on your dashboard. Reconnecting needs a new command.
            </p>
            {actionError && <p className="formmsg error" role="alert">{actionError}</p>}
            <div className="mact">
              <button className="pill ghost" disabled={revoking} onClick={() => setConfirm(null)}>Cancel</button>
              <button className="pill danger-solid" disabled={revoking} onClick={revoke}>{revoking ? 'Revoking…' : 'Revoke device'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
