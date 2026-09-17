import type { EventDetail, Fixture } from './data';
import type { DayRibbon } from './dayRibbon';
import { API_BASE } from './lib/supabase';

export async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
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
    throw new ApiError(body?.detail || `API request failed (${response.status})`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export type DayRevisions = { ribbon: string; extras: string; story: string; purge: string };
export type RibbonData = DayRibbon & {
  contract_version: 1; generated: string; revision: string; purge_revision: string;
  snapshot_complete: boolean; markers_state: 'unsupported' | 'partial' | 'ready';
};
export type ExtrasData = {
  contract_version: 1; date: string; generated: string; revision: string;
  ribbon_revision: string; purge_revision: string;
  sections: { summaries: 'ready' | 'failed'; tokens: 'ready' | 'failed'; findings: 'ready' | 'failed' | 'unsupported' };
  summaries_by_session: Record<string, {
    summary: string | null; summary_state: 'ready' | 'pending' | 'failed' | 'not_requested';
    refresh_state: 'idle' | 'pending' | 'failed'; is_stale: boolean;
    generated_at: string | null; input_revision: string | null; model: string | null;
  }>;
  tokens: Fixture['tokens']; tokens_by_source: NonNullable<Fixture['tokens_by_source']>;
  usage_only_session_count: number | null;
};
export type StoryData = {
  contract_version: 1; date: string; generated: string; revision: string;
  series_revision: string; purge_revision: string; has_newer_data: boolean;
  story: (Fixture['story'][number] & { id: string; truncated: boolean })[];
  next_cursor: string | null;
};

export function loadRibbon(date: string, token: string, signal?: AbortSignal) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return request<RibbonData>(`/v1/day/ribbon?${new URLSearchParams({ date, tz })}`, token, { signal, cache: 'no-store' });
}

export function loadExtras(date: string, token: string, signal?: AbortSignal) {
  return request<ExtrasData>(`/v1/day/extras?${new URLSearchParams({ date })}`, token, { signal, cache: 'no-store' });
}

export function loadStory(date: string, token: string, signal?: AbortSignal, cursor?: string) {
  const params = new URLSearchParams({ date, limit: '200' });
  if (cursor) params.set('cursor', cursor);
  return request<StoryData>(`/v1/day/story?${params}`, token, { signal, cache: 'no-store' });
}

export function loadDashboard(year: number, token: string, day?: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ year: String(year) });
  if (day) params.set('day', day);
  return request<Fixture>(`/v1/dashboard?${params}`, token, { signal });
}

export type CalendarData = Pick<Fixture, 'generated' | 'rollups'> & {
  revision: number; rollups_pending: boolean; refresh_after_ms: number;
  day_revisions: Record<string, DayRevisions>;
};
export type DayData = Pick<Fixture, 'sessions' | 'events' | 'story' | 'tools' | 'tokens' | 'tokens_by_source'>;

export function loadEvent(id: string, token: string, signal?: AbortSignal) {
  return request<EventDetail>(`/v1/events/${encodeURIComponent(id)}`, token, { signal, cache: 'no-store' });
}

export function loadCalendar(year: number, token: string, signal?: AbortSignal) {
  return request<CalendarData>(`/v1/calendar?year=${year}`, token, { signal, cache: 'no-store' });
}

export function loadDay(date: string, token: string, signal?: AbortSignal) {
  return request<DayData>(`/v1/day?date=${encodeURIComponent(date)}`, token, { signal, cache: 'no-store' });
}

export type Device = {
  id: string;
  name: string;
  platform: string;
  extractor_version: number;
  created_at: string;
  last_seen_at: string | null;
  last_upload_at: string | null;
  status: 'connected' | 'revoked' | 'expired';
  sessions: number;
};

export function loadDevices(token: string, signal?: AbortSignal) {
  return request<Device[]>('/v1/devices', token, { signal, cache: 'no-store' });
}

export function revokeDevice(id: string, token: string) {
  return request<void>(`/v1/devices/${encodeURIComponent(id)}/revoke`, token, { method: 'POST' });
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
