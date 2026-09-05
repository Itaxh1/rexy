// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Connect from './Connect';
import Devices from './pages/Devices';
import { useActivity } from './useActivity';
import { loadCalendar, loadDay, loadDevices, revokeDevice } from './api';

vi.mock('./api', () => ({
  loadDevices: vi.fn(), revokeDevice: vi.fn(), createInstallCommand: vi.fn(),
  loadCalendar: vi.fn(), loadDay: vi.fn(),
}));

const device = { id: 'real-device', name: 'My connected computer', platform: 'darwin',
  extractor_version: 1, created_at: '2026-09-04T20:00:00Z', last_seen_at: null,
  last_upload_at: null, sessions: 0, status: 'connected' as const };
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-04T20:01:00Z')); vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });
const button = (label: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent === label)!;

it('detects a connection before uploads and provides an explicit dashboard action', async () => {
  vi.mocked(loadDevices).mockResolvedValue([]);
  const proceed = vi.fn();
  await act(async () => root.render(<Connect token="browser" onContinue={proceed} onRefresh={vi.fn()} onLogout={vi.fn()} />));
  expect(container.textContent).toContain('Waiting for Linus');
  vi.mocked(loadDevices).mockResolvedValue([device]);
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(container.textContent).toContain('Device connected');
  expect(container.textContent).toContain('Waiting for the first upload');
  expect(container.textContent).not.toContain('Generate install command');
  await act(async () => button('View dashboard').click());
  expect(proceed).toHaveBeenCalledOnce();
});

it('recovers from connection polling failures and stops polling after unmount', async () => {
  vi.mocked(loadDevices).mockRejectedValueOnce(new Error('temporary 503')).mockResolvedValue([device]);
  await act(async () => root.render(<Connect token="browser" onContinue={vi.fn()} onRefresh={vi.fn()} onLogout={vi.fn()} />));
  expect(container.textContent).toContain('Retrying automatically');
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(container.textContent).toContain('Device connected');
  await act(async () => root.render(null));
  const calls = vi.mocked(loadDevices).mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  expect(loadDevices).toHaveBeenCalledTimes(calls);
});

it('shows only real devices and waits for server confirmation when revoking', async () => {
  vi.mocked(loadDevices).mockResolvedValue([device]);
  vi.mocked(revokeDevice).mockRejectedValueOnce(new Error('revoke unavailable')).mockImplementation(async () => {
    vi.mocked(loadDevices).mockResolvedValue([{ ...device, status: 'revoked' }]);
  });
  await act(async () => root.render(<Devices token="browser" />));
  expect(container.textContent).toContain(device.name);
  expect(container.textContent).not.toContain('work-linux');
  await act(async () => button('Revoke').click());
  await act(async () => button('Revoke device').click());
  expect(container.textContent).toContain('revoke unavailable');
  expect(container.textContent).toContain(device.name);
  await act(async () => button('Revoke device').click());
  expect(revokeDevice).toHaveBeenCalledWith('real-device', 'browser');
  expect(container.textContent).toContain('revoked');
  expect(button('Revoke').disabled).toBe(true);
});

function ActivityHarness() {
  const [day, setDay] = useState('2026-09-04');
  const { fx, dayLoading } = useActivity({ demo: false, token: 'browser', year: 2026, day, setDay, refresh: 0 });
  return <div>{fx ? `Calendar: ${fx.stats.strokes}` : 'No calendar'} · {dayLoading ? 'Loading details' : `${fx?.events.length ?? 0} details`}
    {fx?.sessions.map(session => <p key={session.id}>{session.summary}</p>)}</div>;
}

it('paints the calendar before slow day detail and polls idle calendars every 30 seconds', async () => {
  vi.mocked(loadCalendar).mockResolvedValue({ generated: '', revision: 1, refresh_after_ms: 30_000, rollups_pending: false,
    rollups: { '2026-09-04': { codex: { sessions: 1, events: 12, tools: 4, ok: 4, fail: 0 } } } });
  let finish!: (value: any) => void;
  vi.mocked(loadDay).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => root.render(<ActivityHarness />));
  expect(container.textContent).toContain('Calendar: 12');
  expect(container.textContent).toContain('Loading details');
  await act(async () => vi.advanceTimersByTimeAsync(29_999));
  expect(loadCalendar).toHaveBeenCalledOnce();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(loadCalendar).toHaveBeenCalledTimes(2);
});

it('finishes a slow day request despite live revisions and retains saved TLDRs during refresh', async () => {
  let revision = 0;
  vi.mocked(loadCalendar).mockImplementation(async () => ({ generated: '', revision: ++revision,
    refresh_after_ms: 3000, rollups_pending: true,
    rollups: { '2026-09-04': { codex: { sessions: 1, events: 12, tools: 4, ok: 4, fail: 0 } } } }));
  let finish!: (value: any) => void;
  vi.mocked(loadDay).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => root.render(<ActivityHarness />));
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(loadCalendar).toHaveBeenCalledTimes(3);
  expect(loadDay).toHaveBeenCalledTimes(1);
  expect(vi.mocked(loadDay).mock.calls[0][2]?.aborted).toBe(false);
  await act(async () => finish({ sessions: [{ id: 's', summary: 'Saved TLDR from database' }],
    events: [{ id: '1' }], tools: [], tokens: {}, story: [] }));
  expect(container.textContent).toContain('1 details');
  expect(container.textContent).toContain('Saved TLDR from database');
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(loadDay).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain('Saved TLDR from database');
  expect(container.textContent).not.toContain('Loading details');
});

it('restores an early day response when the calendar arrives afterwards', async () => {
  let calendarReady!: (value: any) => void;
  vi.mocked(loadCalendar).mockImplementation(() => new Promise(resolve => { calendarReady = resolve; }));
  vi.mocked(loadDay).mockResolvedValue({ sessions: [], events: [{ id: '1' } as any], tools: [], tokens: {}, story: [] });
  await act(async () => root.render(<ActivityHarness />));
  await act(async () => calendarReady({ generated: '', revision: 0, refresh_after_ms: 30000, rollups_pending: false,
    rollups: { '2026-09-04': { codex: { sessions: 1, events: 1, tools: 0, ok: 0, fail: 0 } } } }));
  expect(container.textContent).toContain('Calendar: 1');
  expect(container.textContent).toContain('1 details');
});
