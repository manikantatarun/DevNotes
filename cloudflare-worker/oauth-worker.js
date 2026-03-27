/**
 * Cloudflare Worker – GitHub OAuth token exchange
 *
 * Deploy with:
 *   cd cloudflare-worker && npx wrangler deploy
 *
 * Required Worker environment variables (set via wrangler secret or dashboard):
 *   GITHUB_CLIENT_ID      – your GitHub OAuth App client ID
 *   GITHUB_CLIENT_SECRET  – your GitHub OAuth App client secret
 *   ALLOWED_ORIGIN        – the origin of your DevNotes app,
 *                           e.g. https://manikantatarun.github.io
 */

const CORS = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
});

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const url = new URL(request.url);

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS(origin) });
    }

    if (url.pathname === '/oauth/token' && request.method === 'POST') {
      let code;
      try {
        ({ code } = await request.json());
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS(origin) },
        });
      }

      if (!code) {
        return new Response(JSON.stringify({ error: 'Missing code' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS(origin) },
        });
      }

      const ghRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });

      const data = await ghRes.json();

      if (data.error) {
        return new Response(JSON.stringify({ error: data.error_description || data.error }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS(origin) },
        });
      }

      return new Response(JSON.stringify({ access_token: data.access_token }), {
        headers: { 'Content-Type': 'application/json', ...CORS(origin) },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
