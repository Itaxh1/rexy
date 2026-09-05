import type { Fixture } from './data';
import { API_BASE } from './lib/supabase';

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail || `API request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function loadDashboard(year: number, token: string, day?: string) {
  const params = new URLSearchParams({ year: String(year) });
  if (day) params.set('day', day);
  return request<Fixture>(`/v1/dashboard?${params}`, token);
}

export async function createInstallCommand(token: string) {
  const claim = await request<{ claim_token: string; expires_at: string }>(
    '/v1/install/claims', token, { method: 'POST' },
  );
  return {
    command: `npx --yes rexy-linus@latest --claim ${claim.claim_token} --api ${API_BASE}`,
    expiresAt: claim.expires_at,
  };
}

export function requestSummary(sessionId: string, token: string) {
  return request<{ session_id: string; state: 'pending' }>(
    `/v1/sessions/${encodeURIComponent(sessionId)}/summaries`, token, { method: 'POST' },
  );
}
