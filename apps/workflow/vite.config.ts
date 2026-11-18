import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const githubTokenExchange = (env: Record<string, string>): Plugin => ({
  name: 'github-token-exchange',
  configureServer(server) {
    server.middlewares.use('/api/auth/github/token', async (req, res, next) => {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'method_not_allowed' }));
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));

      let body: { code?: string; platform?: string };
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'invalid_json' }));
        return;
      }

      const { code, platform } = body;
      if (!code || (platform !== 'web' && platform !== 'desktop')) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'invalid_request' }));
        return;
      }

      const prefix = platform === 'web' ? 'GITHUB_WEB' : 'GITHUB_DESKTOP';
      const clientId = env[`${prefix}_CLIENT_ID`];
      const clientSecret = env[`${prefix}_CLIENT_SECRET`];
      if (!clientId || !clientSecret) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'server_misconfigured' }));
        return;
      }

      const response = await fetch(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
        },
      );
      const data = await response.json();
      if (!response.ok || data.error || !data.access_token) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            error: data.error ?? 'exchange_failed',
            error_description: data.error_description,
          }),
        );
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          access_token: data.access_token,
          scope: data.scope,
          token_type: data.token_type,
        }),
      );
    });
  },
});

const mode = process.env.NODE_ENV ?? 'development';
const env = {
  ...loadEnv(mode, '../../', ''),
  ...loadEnv(mode, '.', ''),
};

export default defineConfig({
  plugins: [react(), githubTokenExchange(env)],
  server: {
    port: 5174,
    strictPort: true,
  },
});
