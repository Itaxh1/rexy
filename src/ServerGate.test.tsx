// @vitest-environment jsdom
import { act, StrictMode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ServerGate from './ServerGate';

let root: Root;
let container: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
const mounted = vi.fn();
function Dashboard() {
  useEffect(mounted, []);
  return <div>Saved activity</div>;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});
const render = () => act(async () => root.render(<ServerGate><Dashboard /></ServerGate>));
const ready = () => Response.json({ status: 'ready' });

it('holds dashboard requests until API and database readiness, then stops checking', async () => {
  fetchMock.mockResolvedValueOnce(new Response('', { status: 503 })).mockImplementation(async () => ready());
  await render();
  expect(container.textContent).toContain('Starting the server');
  expect(mounted).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/readyz', expect.objectContaining({
    cache: 'no-store', credentials: 'omit',
  }));
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(container.textContent).toContain('Saved activity');
  expect(mounted).toHaveBeenCalledOnce();
  await act(async () => vi.advanceTimersByTimeAsync(180_000));
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('does not impose a minimum wait on an already-running backend', async () => {
  fetchMock.mockImplementation(async () => ready());
  await render();
  expect(container.textContent).toBe('Saved activity');
  expect(fetchMock).toHaveBeenCalledOnce();
});

it('rejects HTML startup pages, liveness-only JSON and network failures', async () => {
  fetchMock.mockResolvedValueOnce(new Response('<html>Starting</html>', { status: 200 }))
    .mockResolvedValueOnce(Response.json({ status: 'ok' }))
    .mockRejectedValueOnce(new TypeError('network failed'))
    .mockImplementation(async () => ready());
  await render();
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(mounted).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(container.textContent).toBe('Saved activity');
});

it('aborts hung requests without overlapping retries and cancels on unmount', async () => {
  fetchMock.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  await render();
  await act(async () => vi.advanceTimersByTimeAsync(7999));
  expect(fetchMock).toHaveBeenCalledOnce();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => root.render(null));
  expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(180_000));
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('offers manual retry after two minutes instead of an endless spinner', async () => {
  fetchMock.mockImplementation(async () => new Response('', { status: 503 }));
  await render();
  await act(async () => vi.advanceTimersByTimeAsync(120_000));
  expect(container.textContent).toContain('The server isn’t responding');
  const calls = fetchMock.mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(fetchMock).toHaveBeenCalledTimes(calls);
  fetchMock.mockImplementation(async () => ready());
  await act(async () => container.querySelector('button')!.click());
  expect(container.textContent).toBe('Saved activity');
});

it('does not call the backend offline and resumes automatically on reconnect', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  await render();
  expect(container.textContent).toContain('You’re offline');
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockImplementation(async () => ready());
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  await act(async () => window.dispatchEvent(new Event('online')));
  expect(container.textContent).toBe('Saved activity');
});

it('keeps demo available without an API', async () => {
  window.history.replaceState({}, '', '/?demo=1');
  await render();
  expect(container.textContent).toBe('Saved activity');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('ignores stale readiness completions during StrictMode remount', async () => {
  const resolve: Array<(response: Response) => void> = [];
  fetchMock.mockImplementation(() => new Promise<Response>(done => resolve.push(done)));
  await act(async () => root.render(<StrictMode><ServerGate><Dashboard /></ServerGate></StrictMode>));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => resolve[0](ready()));
  expect(mounted).not.toHaveBeenCalled();
  await act(async () => resolve[1](ready()));
  expect(container.textContent).toBe('Saved activity');
});
