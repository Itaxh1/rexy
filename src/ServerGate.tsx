import { useEffect, useState, type ReactNode } from 'react';
import { API_BASE } from './lib/supabase';
import { applyTheme, readTheme, type Theme } from './theme';

type State = 'checking' | 'starting' | 'offline' | 'unavailable' | 'ready';

export default function ServerGate({ children }: { children: ReactNode }) {
  const demo = new URLSearchParams(location.search).has('demo');
  const [state, setState] = useState<State>(demo ? 'ready' : 'checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    applyTheme((new URLSearchParams(location.search).get('theme') as Theme) || readTheme());
  }, []);

  useEffect(() => {
    if (demo) return;
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout>;
    let requestTimer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    const online = () => setAttempt(value => value + 1);
    window.addEventListener('online', online);
    setState(navigator.onLine ? 'checking' : 'offline');

    // A failed origin isn't necessarily asleep. Stop after two minutes and
    // offer a retry instead of promising an endless boot or fake progress.
    const deadline = setTimeout(() => {
      stopped = true;
      controller?.abort();
      clearTimeout(retryTimer);
      clearTimeout(requestTimer);
      setState(navigator.onLine ? 'unavailable' : 'offline');
    }, 120_000);

    const check = async () => {
      if (stopped) return;
      if (!navigator.onLine) { setState('offline'); return; }
      controller = new AbortController();
      requestTimer = setTimeout(() => controller?.abort(), 8_000);
      try {
        const response = await fetch(`${API_BASE}/readyz`, {
          signal: controller.signal, cache: 'no-store', credentials: 'omit',
        });
        // Render can return an HTML startup page with 200. Only our readiness
        // JSON confirms that FastAPI AND its database are available.
        const body = response.ok ? await response.json() : null;
        if (stopped) return;
        if (body?.status === 'ready') {
          stopped = true;
          clearTimeout(deadline);
          window.removeEventListener('online', online);
          setState('ready');
          return;
        }
      } catch {
        // Timeout, network failure and non-JSON startup pages all retry.
      } finally {
        clearTimeout(requestTimer);
      }
      if (!stopped) {
        setState(navigator.onLine ? 'starting' : 'offline');
        retryTimer = setTimeout(check, 3_000);
      }
    };
    void check();
    return () => {
      stopped = true;
      controller?.abort();
      clearTimeout(deadline);
      clearTimeout(retryTimer);
      clearTimeout(requestTimer);
      window.removeEventListener('online', online);
    };
  }, [demo, attempt]);

  if (state === 'ready') return <>{children}</>;
  const waiting = state === 'checking' || state === 'starting';
  return <main className="server-start">
    <section className="panel server-start-content" aria-busy={waiting}>
      <div className="logo">Rexy</div>
      <div role="status" aria-live="polite">
        <h1>{state === 'offline' ? 'You’re offline' : state === 'unavailable'
          ? 'The server isn’t responding' : state === 'checking'
            ? 'Connecting to Rexy…' : 'Starting the server…'}</h1>
        <p>{state === 'offline' ? 'Check your connection. We’ll try again when you’re back online.'
          : state === 'unavailable' ? 'This is taking longer than expected. The server may be unavailable. Please try again.'
            : 'Our free Render server may be waking up. This can take about a minute. Your dashboard will open automatically.'}</p>
      </div>
      {waiting ? <p className="server-start-note">Checking the API and database…</p>
        : <button className="btn" onClick={() => setAttempt(value => value + 1)}>Try again</button>}
    </section>
  </main>;
}
