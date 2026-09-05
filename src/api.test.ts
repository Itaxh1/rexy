import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInstallCommand } from './api';

describe('install command', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the published Linus package and the backend-issued single-use claim', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      claim_token: 'linus_once_test',
      expires_at: '2026-09-04T18:10:00Z',
    }), { status: 201, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createInstallCommand('browser-token');

    expect(result.command).toBe(
      'npx --yes rexy-linus@latest --claim linus_once_test --api http://127.0.0.1:8000',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/v1/install/claims',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
