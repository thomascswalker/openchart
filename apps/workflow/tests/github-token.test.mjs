import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import handler, { config } from '../netlify/github-token.js';

const originalFetch = globalThis.fetch;
const originalId = process.env.GITHUB_WEB_CLIENT_ID;
const originalSecret = process.env.GITHUB_WEB_CLIENT_SECRET;

after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of [
    ['GITHUB_WEB_CLIENT_ID', originalId],
    ['GITHUB_WEB_CLIENT_SECRET', originalSecret],
  ]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('Netlify route invokes the token exchange handler', async () => {
  assert.equal(config.path, '/api/auth/github/token');
  process.env.GITHUB_WEB_CLIENT_ID = 'test-client-id';
  process.env.GITHUB_WEB_CLIENT_SECRET = 'test-client-secret';

  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://github.com/login/oauth/access_token');
    assert.deepEqual(JSON.parse(options.body), {
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
      code: 'test-code',
    });
    return Response.json({
      access_token: 'test-token',
      scope: 'repo,project',
      token_type: 'bearer',
    });
  };
  const response = await handler(
    new Request('https://example.test/api/auth/github/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'test-code', platform: 'web' }),
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    access_token: 'test-token',
    scope: 'repo,project',
    token_type: 'bearer',
  });
});

test('Netlify route returns an error for an invalid request', async () => {
  const response = await handler(
    new Request('https://example.test/api/auth/github/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'web' }),
    }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'invalid_request' });
});
