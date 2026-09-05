export type Theme = 'light' | 'dark' | 'system';
const KEY = 'rexy.theme';

/** Three states, matching the CSS scopes: an explicit choice stamps data-theme
 *  and wins over the OS; 'system' removes the stamp and lets the media query
 *  decide. Storage can throw (private mode, blocked site data), so every access
 *  is guarded and the app still renders with no stored value. */
export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* ignore */ }
  return 'system';
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
}
