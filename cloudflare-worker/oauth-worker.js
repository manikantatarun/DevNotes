/**
 * Cloudflare Worker – GitHub OAuth + metadata query API
 *
 * Deploy with:
 *   cd cloudflare-worker && npx wrangler deploy
 *
 * Required Worker environment variables (set via wrangler secret or dashboard):
 *   GITHUB_CLIENT_ID      – your GitHub OAuth App client ID
 *   GITHUB_CLIENT_SECRET  – your GitHub OAuth App client secret
 *   ALLOWED_ORIGIN        – the origin of your DevNotes app,
 *                           e.g. https://manikantatarun.github.io
 *   DATA_REPO_OWNER       – data repo owner (default: manikantatarun)
 *   DATA_REPO_NAME        – data repo name  (default: devnotes-data)
 *   DATA_REPO_BRANCH      – data repo branch(default: main)
 *
 * Optional secret for higher GitHub API rate limits:
 *   GITHUB_API_TOKEN
 */

const CORS = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
});

const CACHE_KEY = 'https://devnotes-worker.internal/meta-index';
const CACHE_MAX_AGE_SECONDS = 120;

const json = (body, status = 200, origin = '*') =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_MAX_AGE_SECONDS}`,
      ...CORS(origin),
    },
  });

function getRepoConfig(env) {
  return {
    owner: env.DATA_REPO_OWNER || 'manikantatarun',
    repo: env.DATA_REPO_NAME || 'devnotes-data',
    branch: env.DATA_REPO_BRANCH || 'main',
  };
}

function githubHeaders(env) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (env.GITHUB_API_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_API_TOKEN}`;
  }
  return headers;
}

async function fetchMetaIndexFromGitHub(env) {
  const { owner, repo, branch } = getRepoConfig(env);
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;

  const treeRes = await fetch(treeUrl, { headers: githubHeaders(env) });
  if (!treeRes.ok) {
    throw new Error(`Tree API error: ${treeRes.status}`);
  }

  const tree = await treeRes.json();
  const metaPaths = (tree.tree || [])
    .filter((item) => item.type === 'blob' && item.path.startsWith('meta/') && item.path.endsWith('.json'))
    .map((item) => item.path);

  const baseCdn = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}`;
  const chunks = [];
  const chunkSize = 16;

  for (let i = 0; i < metaPaths.length; i += chunkSize) {
    chunks.push(metaPaths.slice(i, i + chunkSize));
  }

  const allMeta = [];
  for (const chunk of chunks) {
    const rows = await Promise.all(
      chunk.map(async (path) => {
        try {
          const res = await fetch(`${baseCdn}/${path}`);
          if (!res.ok) return null;
          return await res.json();
        } catch {
          return null;
        }
      })
    );
    for (const row of rows) {
      if (row) allMeta.push(row);
    }
  }

  allMeta.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return allMeta;
}

function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

function applyMetaFilters(data, params) {
  const q = normalizeText(params.get('q'));
  const type = normalizeText(params.get('type'));
  const category = normalizeText(params.get('category'));
  const language = normalizeText(params.get('language'));
  const tag = normalizeText(params.get('tag'));

  return data.filter((note) => {
    if (type && type !== 'all' && normalizeText(note.type) !== type) return false;
    if (category && category !== 'all' && normalizeText(note.category) !== category) return false;

    if (language && language !== 'all') {
      const langs = [note.language, ...(note.languages || [])]
        .map(normalizeText)
        .filter(Boolean);
      if (!langs.includes(language)) return false;
    }

    if (tag && tag !== 'all') {
      const tags = (note.tags || []).map(normalizeText);
      if (!tags.includes(tag)) return false;
    }

    if (q) {
      const words = q.split(/\s+/).filter(Boolean);
      const haystack = [
        note.title,
        note.preview,
        ...(note.tags || []),
        note.category,
        note.type,
        note.language,
        ...(note.languages || []),
      ]
        .map((part) => normalizeText(part))
        .join(' ');

      if (!words.every((word) => haystack.includes(word))) return false;
    }

    return true;
  });
}

function paginate(items, params) {
  const page = Math.max(1, Number(params.get('page') || 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize') || 50)));
  const start = (page - 1) * pageSize;
  const rows = items.slice(start, start + pageSize);
  return {
    page,
    pageSize,
    total: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    rows,
  };
}

async function getCachedMetaIndex(env, origin, refresh = false) {
  const cache = caches.default;
  const request = new Request(CACHE_KEY);

  if (!refresh) {
    const cached = await cache.match(request);
    if (cached) {
      const cachedData = await cached.json();
      return cachedData;
    }
  }

  const freshData = await fetchMetaIndexFromGitHub(env);
  await cache.put(request, json(freshData, 200, origin).clone());
  return freshData;
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const url = new URL(request.url);

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS(origin) });
    }

    if (url.pathname === '/notes/meta' && request.method === 'GET') {
      try {
        const refresh = url.searchParams.get('refresh') === '1';
        const full = await getCachedMetaIndex(env, origin, refresh);
        const filtered = applyMetaFilters(full, url.searchParams);
        const payload = paginate(filtered, url.searchParams);
        return json(payload, 200, origin);
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : 'Failed to load metadata' },
          500,
          origin,
        );
      }
    }

    if (url.pathname === '/oauth/token' && request.method === 'POST') {
      let code;
      try {
        ({ code } = await request.json());
      } catch {
        return json({ error: 'Invalid JSON body' }, 400, origin);
      }

      if (!code) {
        return json({ error: 'Missing code' }, 400, origin);
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
        return json({ error: data.error_description || data.error }, 400, origin);
      }

      return json({ access_token: data.access_token }, 200, origin);
    }

    return json({ error: 'Not found' }, 404, origin);
  },
};
