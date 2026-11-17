import { afterEach, expect, it, vi } from 'vitest';

import handler, { config } from '../netlify/github-token';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('invokes the token exchange handler at the Netlify route', async () => {
  expect(config.path).toBe('/api/auth/github/token');
  vi.stubEnv('GITHUB_WEB_CLIENT_ID', 'test-client-id');
  vi.stubEnv('GITHUB_WEB_CLIENT_SECRET', 'test-client-secret');

  const fetch = vi.fn(async (_url: string, _options: RequestInit) =>
    Response.json({
      access_token: 'test-token',
      scope: 'repo,project',
      token_type: 'bearer',
    }),
  );
  vi.stubGlobal('fetch', fetch);

  const response = await handler(
    new Request('https://example.test/api/auth/github/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'test-code', platform: 'web' }),
    }),
  );
  expect(fetch).toHaveBeenCalledOnce();
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('https://github.com/login/oauth/access_token');
  expect(JSON.parse(String(options.body))).toEqual({
    client_id: 'test-client-id',
    client_secret: 'test-client-secret',
    code: 'test-code',
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    access_token: 'test-token',
    scope: 'repo,project',
    token_type: 'bearer',
  });
});

it('returns an error for an invalid request', async () => {
  const response = await handler(
    new Request('https://example.test/api/auth/github/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'web' }),
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'invalid_request' });
});
