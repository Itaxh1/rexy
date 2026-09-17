import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const API_BASE = (import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');

let client: Promise<SupabaseClient> | null = null;

export function getSupabase(): Promise<SupabaseClient> {
  if (!client) client = create();
  return client;
}

async function create() {
  let url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  let key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  const cacheKey = `rexy:public-auth-config:${API_BASE}`;
  if (!url || !key) {
    try {
      const saved = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (saved && Date.now() - saved.saved < 7 * 86_400_000) {
        url = saved.url; key = saved.key;
      }
    } catch { /* Unavailable storage must not block sign-in. */ }
  }
  if (!url || !key) {
    const response = await fetch(`${API_BASE}/v1/public/config`);
    if (!response.ok) throw new Error(`Could not load authentication config (${response.status})`);
    const config = await response.json() as {
      supabase_url: string;
      supabase_publishable_key: string;
    };
    url = config.supabase_url;
    key = config.supabase_publishable_key;
    // These are public identifiers, never a provider or service-role secret.
    try { localStorage.setItem(cacheKey, JSON.stringify({url,key,saved:Date.now()})); } catch { /* optional */ }
  }
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}
