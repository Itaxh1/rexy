import { useState, type FormEvent } from 'react';
import { getSupabase } from '../lib/supabase';
import RexyLogo from '../RexyLogo';

export default function Auth() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'google' | 'email'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const google = async () => {
    setBusy('google');
    setError(null);
    try {
      const supabase = await getSupabase();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin },
      });
      if (authError) throw authError;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(null);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('email');
    setError(null);
    setNotice(null);
    try {
      const supabase = await getSupabase();
      if (mode === 'in') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: location.origin },
        });
        if (authError) throw authError;
        if (!data.session) setNotice('Check your email to confirm the account, then return here.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="auth">
      <div className="aleft">
        <RexyLogo className="amark" size={42} />
        <p className="atag">Every prompt, every action, every day — one page.</p>
        <div className="afoot">
          <span>Claude Code</span><i>/</i><span>Codex</span><i>/</i><span>Private sync</span>
        </div>
      </div>

      <div className="aright">
        <div className="acard">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={mode === 'in'} onClick={() => setMode('in')}>Sign in</button>
            <button role="tab" aria-selected={mode === 'up'} onClick={() => setMode('up')}>Sign up</button>
          </div>

          <button className="google" onClick={google} disabled={busy !== null}>
            <GoogleMark />
            {busy === 'google' ? 'Redirecting…' : 'Continue with Google'}
          </button>
          <div className="or">or</div>

          <form onSubmit={submit}>
            <label className="field">
              <span>Email</span>
              <input required type="email" autoComplete="email" placeholder="you@company.com"
                     value={email} onChange={event => setEmail(event.target.value)} />
            </label>
            <label className="field">
              <span>Password</span>
              <input required minLength={8} type="password" placeholder="••••••••"
                     value={password} onChange={event => setPassword(event.target.value)}
                     autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
            </label>
            {error && <p className="formmsg error" role="alert">{error}</p>}
            {notice && <p className="formmsg" role="status">{notice}</p>}
            <button className="pill wide" type="submit" disabled={busy !== null}>
              {busy === 'email' ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="swap">
            {mode === 'in'
              ? <>No account yet? <button onClick={() => setMode('up')}>Create one</button></>
              : <>Already have one? <button onClick={() => setMode('in')}>Sign in</button></>}
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12.1c-.2 2-1.6 5-4.5 7l-.1.3 6.5 5 .5.1c4.1-3.8 6.6-9.5 6.6-15.7z"/>
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.9l-.3.1-6.7 5.2-.1.3C7.9 40.6 15.4 46 24 46z"/>
      <path fill="#FBBC05" d="M11.5 27.6c-.5-1.4-.7-2.9-.7-4.4s.3-3.1.7-4.4v-.4l-6.8-5.3-.2.1A22 22 0 0 0 2 23.2c0 3.5.9 6.9 2.5 9.9l7-5.5z"/>
      <path fill="#EA4335" d="M24 9.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 3.3 29.9 1 24 1 15.4 1 7.9 6.4 4.5 13.3l7 5.5C13.3 13.3 18.2 9.5 24 9.5z"/>
    </svg>
  );
}
