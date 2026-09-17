// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Connect from './Connect';
import Devices from './pages/Devices';
import { loadDevices, revokeDevice } from './api';

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
