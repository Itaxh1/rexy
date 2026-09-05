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
  if (!url || !key) {
    const response = await fetch(`${API_BASE}/v1/public/config`);
    if (!response.ok) throw new Error(`Could not load authentication config (${response.status})`);
    const config = await response.json() as {
      supabase_url: string;
      supabase_publishable_key: string;
    };
    url = config.supabase_url;
    key = config.supabase_publishable_key;
  }
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}
