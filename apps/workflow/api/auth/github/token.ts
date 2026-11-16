// Serverless (Web-standard Request/Response) token exchange. Lives outside src/ so secrets never reach the bundle.
const CORS = {
  'Access-Control-Allow-Origin': process.env.AUTH_ALLOWED_ORIGIN ?? '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { code?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { code, platform } = body;
  if (!code || (platform !== 'web' && platform !== 'desktop')) {
    return json({ error: 'invalid_request' }, 400);
  }

  const prefix = platform === 'web' ? 'GITHUB_WEB' : 'GITHUB_DESKTOP';
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) return json({ error: 'server_misconfigured' }, 500);

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  const data = await res.json();

  if (!res.ok || data.error || !data.access_token) {
    return json({ error: data.error ?? 'exchange_failed', error_description: data.error_description }, 401);
  }
  return json({ access_token: data.access_token, scope: data.scope, token_type: data.token_type });
}
