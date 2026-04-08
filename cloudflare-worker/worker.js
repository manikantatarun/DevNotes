/**
 * Cloudflare Worker – GitHub OAuth + KV-backed metadata search + note CRUD
 *
 * Endpoints:
 *   POST /oauth/token
 *   GET  /notes/meta
 *   POST /notes/sync
 *   POST /notes/create
 *   POST /notes/update
 *   POST /notes/delete
 */

const CORS = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-GitHub-Token',
  'Access-Control-Max-Age': '86400',
});

const json = (body, status = 200, origin = '*', cacheControl = 'no-store') =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
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

function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function noteToMeta(note) {
  const preview =
    (note.question || '').slice(0, 200) ||
    (note.problem || '').slice(0, 200) ||
    (note.content || '').slice(0, 200) ||
    '';

  const languages = note.solutions?.length
    ? note.solutions.map((s) => s.language)
    : note.language
    ? [note.language]
    : [];

  return {
    id: note.id,
    type: note.type,
    category: note.category,
    title: note.title,
    language: note.language,
    languages: uniq(languages),
    tags: (note.tags || []).map((tag) => String(tag)),
    preview,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

function githubHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'devnotes-worker',
  };
  if (token) {
    headers.Authorization = `token ${token.trim()}`;
  }
  return headers;
}

function repoContentUrl(env, path) {
  const { owner, repo, branch } = getRepoConfig(env);
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
}

function repoContentWriteUrl(env, path) {
  const { owner, repo } = getRepoConfig(env);
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
}

function encodeBase64Json(data) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
}

function decodeBase64Json(content) {
  return JSON.parse(decodeURIComponent(escape(atob(content.replace(/\n/g, '')))));
}

function parseAuthToken(request) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^(Bearer|token)\s+(.+)$/i);
  if (match?.[2]) return match[2].trim();

  const alt = request.headers.get('X-GitHub-Token') || request.headers.get('x-github-token');
  if (alt) return alt.trim();

  return null;
}

async function githubGetUser(token) {
  const res = await fetch('https://api.github.com/user', {
    headers: githubHeaders(token),
  });

  if (res.ok) {
    return res.json();
  }

  // Fallback for environments expecting Bearer token format
  if (res.status === 401) {
    const retry = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${token}`,
      },
    });
    if (retry.ok) return retry.json();
  }

  return null;
}

async function checkWriteAccess(token, env, userLogin) {
  const { owner, repo } = getRepoConfig(env);
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/collaborators/${userLogin}/permission`,
    { headers: githubHeaders(token) },
  );
  if (res.status === 403 || res.status === 404) return false;
  if (!res.ok) return false;
  const data = await res.json();
  const permission = data.role_name ?? data.permission ?? '';
  return ['admin', 'maintain', 'write'].includes(permission);
}

async function assertWriteAuthorized(request, env, origin) {
  const token = parseAuthToken(request);
  if (!token) {
    return { ok: false, response: json({ error: 'Missing Authorization token' }, 401, origin) };
  }

  const user = await githubGetUser(token);
  if (!user?.login) {
    return { ok: false, response: json({ error: 'Invalid GitHub token' }, 401, origin) };
  }

  const allowed = await checkWriteAccess(token, env, user.login);
  if (!allowed) {
    return { ok: false, response: json({ error: 'No write access to data repo' }, 403, origin) };
  }

  return { ok: true, token };
}

async function githubGetFile(path, env, token) {
  const res = await fetch(repoContentUrl(env, path), {
    headers: githubHeaders(token),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read error ${res.status} on ${path}`);
  const payload = await res.json();
  return {
    sha: payload.sha,
    data: decodeBase64Json(payload.content),
  };
}

async function githubPutFile(path, data, env, token, message, sha = '') {
  const body = {
    message,
    content: encodeBase64Json(data),
    branch: getRepoConfig(env).branch,
    ...(sha ? { sha } : {}),
  };

  const res = await fetch(repoContentWriteUrl(env, path), {
    method: 'PUT',
    headers: {
      ...githubHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub write error ${res.status}`);
  }
}

async function githubDeleteFile(path, env, token, sha, message) {
  const body = {
    message,
    sha,
    branch: getRepoConfig(env).branch,
  };

  const res = await fetch(repoContentWriteUrl(env, path), {
    method: 'DELETE',
    headers: {
      ...githubHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub delete error ${res.status}`);
  }
}

function kvNoteKey(id) {
  return `note:${id}`;
}

function kvIndexKey(kind, value) {
  return `idx:${kind}:${normalizeText(value)}`;
}

const KV_ALL_IDS = 'idx:all';
const KV_BOOTSTRAPPED = 'sys:bootstrapped';
const KV_SYNC_TIMESTAMP = 'sys:sync-timestamp';

async function kvGetIdSet(env, key) {
  const raw = await env.META_KV.get(key, 'json');
  if (!Array.isArray(raw)) return [];
  return uniq(raw.map((id) => String(id)));
}

async function kvPutIdSet(env, key, ids) {
  await env.META_KV.put(key, JSON.stringify(uniq(ids)));
}

async function kvAddId(env, key, id) {
  const ids = await kvGetIdSet(env, key);
  if (!ids.includes(id)) {
    ids.push(id);
    await kvPutIdSet(env, key, ids);
  }
}

async function kvRemoveId(env, key, id) {
  const ids = await kvGetIdSet(env, key);
  const filtered = ids.filter((x) => x !== id);
  await kvPutIdSet(env, key, filtered);
}

async function kvGetMeta(env, id) {
  return env.META_KV.get(kvNoteKey(id), 'json');
}

async function kvPutMeta(env, meta) {
  await env.META_KV.put(kvNoteKey(meta.id), JSON.stringify(meta));
}

function metaIndexKeys(meta) {
  const keys = [
    kvIndexKey('type', meta.type),
    kvIndexKey('category', meta.category),
  ];

  const languages = uniq([meta.language, ...(meta.languages || [])].map(normalizeText));
  for (const lang of languages) {
    keys.push(kvIndexKey('language', lang));
  }

  for (const tag of uniq((meta.tags || []).map(normalizeText))) {
    keys.push(kvIndexKey('tag', tag));
  }

  return keys;
}

async function kvAttachMetaToIndexes(env, meta) {
  await kvPutMeta(env, meta);
  await kvAddId(env, KV_ALL_IDS, meta.id);
  const keys = metaIndexKeys(meta);
  await Promise.all(keys.map((key) => kvAddId(env, key, meta.id)));
}

async function kvDetachMetaFromIndexes(env, meta) {
  await env.META_KV.delete(kvNoteKey(meta.id));
  await kvRemoveId(env, KV_ALL_IDS, meta.id);
  const keys = metaIndexKeys(meta);
  await Promise.all(keys.map((key) => kvRemoveId(env, key, meta.id)));
}

function intersectIdSets(sets) {
  if (sets.length === 0) return [];
  const [first, ...rest] = sets;
  return first.filter((id) => rest.every((set) => set.includes(id)));
}

// Fetch meta index via GitHub Tree API (always fresh, requires token)
async function fetchMetaIndexViaGitHubAPI(env, token) {
  const { owner, repo, branch } = getRepoConfig(env);
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: githubHeaders(token) },
  );
  if (!treeRes.ok) throw new Error(`GitHub tree API error ${treeRes.status}`);
  const tree = await treeRes.json();

  const metaPaths = (tree.tree || [])
    .filter((f) => f.type === 'blob' && f.path?.startsWith('meta/') && f.path.endsWith('.json'))
    .map((f) => f.path);

  const chunkSize = 10;
  const allMeta = [];

  for (let i = 0; i < metaPaths.length; i += chunkSize) {
    const chunk = metaPaths.slice(i, i + chunkSize);
    const rows = await Promise.all(
      chunk.map(async (path) => {
        try {
          const file = await githubGetFile(path, env, token);
          return file?.data || null;
        } catch {
          return null;
        }
      }),
    );
    for (const row of rows) {
      if (row?.id) allMeta.push(row);
    }
  }

  allMeta.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return allMeta;
}

// Fetch meta index via jsDelivr CDN (no auth needed, may be stale — only for bootstrap)
async function fetchMetaIndexFromCDN(env) {
  const { owner, repo, branch } = getRepoConfig(env);

  const version = Date.now();

  const jsdUrl = `https://data.jsdelivr.com/v1/package/gh/${owner}/${repo}@${branch}/flat?v=${version}`;

  const jsdRes = await fetch(jsdUrl);

  if (!jsdRes.ok) {
    throw new Error(`Failed to list metadata files from jsDelivr (${jsdRes.status})`);
  }

  const flat = await jsdRes.json();

  const files = Array.isArray(flat.files) ? flat.files : [];

  const metaPaths = files
    .map((file) => file.name)
    .filter((name) => typeof name === "string" && name.startsWith("/meta/") && name.endsWith(".json"))
    .map((name) => name.slice(1));

  const baseCdn = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}`;

  const chunkSize = 10;
  const allMeta = [];

  for (let i = 0; i < metaPaths.length; i += chunkSize) {
    const chunk = metaPaths.slice(i, i + chunkSize);

    const rows = await Promise.all(
      chunk.map(async (path) => {
        try {
          const res = await fetch(`${baseCdn}/${path}?v=${version}`); // ✅ FIXED

          if (!res.ok) return null;

          return await res.json();
        } catch (err) {
          console.warn(`Failed to fetch ${path}`, err);
          return null;
        }
      })
    );

    for (const row of rows) {
      if (row?.id) allMeta.push(row);
    }
  }

  allMeta.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  return allMeta;
}

async function kvDeleteByPrefix(env, prefix) {
  let cursor = undefined;
  do {
    const listed = await env.META_KV.list({ prefix, cursor, limit: 1000 });
    await Promise.all(listed.keys.map((k) => env.META_KV.delete(k.name)));
    cursor = listed.list_complete ? undefined : listed.cursor;
  } while (cursor);
}

async function rebuildKvFromMetas(env, metas) {
  await kvDeleteByPrefix(env, 'note:');
  await kvDeleteByPrefix(env, 'idx:');

  for (const meta of metas) {
    await kvAttachMetaToIndexes(env, meta);
  }

  await env.META_KV.put(KV_BOOTSTRAPPED, '1');
}

async function ensureKvBootstrapped(env) {
  const marked = await env.META_KV.get(KV_BOOTSTRAPPED);
  if (marked) return; // Already bootstrapped

  // Bootstrap from CDN (no auth needed; acceptable for first-time setup)
  const allMeta = await fetchMetaIndexFromCDN(env);
  await rebuildKvFromMetas(env, allMeta);
  await env.META_KV.put(KV_SYNC_TIMESTAMP, String(Date.now()));
}

function applySearchFilter(data, query) {
  const q = normalizeText(query);
  if (!q) return data;
  const words = q.split(/\s+/).filter(Boolean);

  return data.filter((note) => {
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

    return words.every((word) => haystack.includes(word));
  });
}

function paginate(items, params) {
  const page = Math.max(1, Number(params.get('page') || 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize') || 50)));
  const start = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    total: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    rows: items.slice(start, start + pageSize),
  };
}

function buildIndexKeysFromQuery(params) {
  const keys = [];
  const type = normalizeText(params.get('type'));
  const category = normalizeText(params.get('category'));
  const language = normalizeText(params.get('language'));
  const tag = normalizeText(params.get('tag'));

  if (type && type !== 'all') keys.push(kvIndexKey('type', type));
  if (category && category !== 'all') keys.push(kvIndexKey('category', category));
  if (language && language !== 'all') keys.push(kvIndexKey('language', language));
  if (tag && tag !== 'all') keys.push(kvIndexKey('tag', tag));

  return keys;
}

async function handleNotesMeta(request, env, origin) {
  await ensureKvBootstrapped(env);
  const url = new URL(request.url);

  const indexKeys = buildIndexKeysFromQuery(url.searchParams);
  const candidateSets = await Promise.all(indexKeys.map((key) => kvGetIdSet(env, key)));
  const candidateIds = indexKeys.length > 0
    ? intersectIdSets(candidateSets)
    : await kvGetIdSet(env, KV_ALL_IDS);

  const metas = await Promise.all(candidateIds.map((id) => kvGetMeta(env, id)));
  let rows = metas.filter(Boolean);

  rows = applySearchFilter(rows, url.searchParams.get('q'));
  rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  return json(paginate(rows, url.searchParams), 200, origin, 'public, max-age=20');
}

async function handleNotesSync(env, origin, token) {
  // Use GitHub API directly (requires token) so we always get fresh data, not stale CDN
  const metas = await fetchMetaIndexViaGitHubAPI(env, token);
  await rebuildKvFromMetas(env, metas);
  await env.META_KV.put(KV_SYNC_TIMESTAMP, String(Date.now()));
  return json({ ok: true, count: metas.length }, 200, origin);
}

function nowMs() {
  return Date.now();
}

function generateId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function parseJsonBody(request, origin) {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: json({ error: 'Invalid JSON body' }, 400, origin) };
  }
}

async function handleCreate(request, env, origin, token) {
  const parsed = await parseJsonBody(request, origin);
  if (!parsed.ok) return parsed.response;

  const incoming = parsed.body?.note;
  if (!incoming || !incoming.type || !incoming.category || !incoming.title) {
    return json({ error: 'Missing note payload' }, 400, origin);
  }

  const id = generateId();
  const ts = nowMs();
  const note = { ...incoming, id, createdAt: ts, updatedAt: ts };
  const meta = noteToMeta(note);

  await githubPutFile(`notes/${id}.json`, note, env, token, `add note: ${note.title}`);
  await githubPutFile(`meta/${id}.json`, meta, env, token, `add meta: ${note.title}`);
  await kvAttachMetaToIndexes(env, meta);

  return json({ note }, 200, origin);
}

async function handleUpdate(request, env, origin, token) {
  const parsed = await parseJsonBody(request, origin);
  if (!parsed.ok) return parsed.response;

  const { id, updates } = parsed.body || {};
  if (!id || !updates) {
    return json({ error: 'Missing id or updates' }, 400, origin);
  }

  const currentNoteFile = await githubGetFile(`notes/${id}.json`, env, token);
  if (!currentNoteFile?.data) {
    return json({ error: 'Note not found' }, 404, origin);
  }

  const currentMetaFile = await githubGetFile(`meta/${id}.json`, env, token);
  const previousMeta = currentMetaFile?.data || (await kvGetMeta(env, id));

  const baseNote = currentNoteFile.data;
  const updated = {
    ...baseNote,
    ...updates,
    id,
    createdAt: baseNote.createdAt,
    updatedAt: nowMs(),
  };
  const meta = noteToMeta(updated);

  await githubPutFile(`notes/${id}.json`, updated, env, token, `update note: ${updated.title}`, currentNoteFile.sha);
  await githubPutFile(`meta/${id}.json`, meta, env, token, `update meta: ${updated.title}`, currentMetaFile?.sha || '');

  if (previousMeta?.id) {
    await kvDetachMetaFromIndexes(env, previousMeta);
  }
  await kvAttachMetaToIndexes(env, meta);

  return json({ note: updated }, 200, origin);
}

async function handleDelete(request, env, origin, token) {
  const parsed = await parseJsonBody(request, origin);
  if (!parsed.ok) return parsed.response;

  const id = parsed.body?.id;
  if (!id) {
    return json({ error: 'Missing id' }, 400, origin);
  }

  const currentMetaFile = await githubGetFile(`meta/${id}.json`, env, token);
  const currentNoteFile = await githubGetFile(`notes/${id}.json`, env, token);

  if (!currentMetaFile && !currentNoteFile) {
    return json({ ok: true }, 200, origin);
  }

  const title = currentNoteFile?.data?.title || currentMetaFile?.data?.title || id;

  if (currentNoteFile?.sha) {
    await githubDeleteFile(`notes/${id}.json`, env, token, currentNoteFile.sha, `delete note: ${title}`);
  }
  if (currentMetaFile?.sha) {
    await githubDeleteFile(`meta/${id}.json`, env, token, currentMetaFile.sha, `delete meta: ${title}`);
  }

  const meta = currentMetaFile?.data || (await kvGetMeta(env, id));
  if (meta?.id) {
    await kvDetachMetaFromIndexes(env, meta);
  }

  return json({ ok: true }, 200, origin);
}

export default {
  async scheduled(event, env) {
    // Scheduled sync every hour via Cloudflare Cron (from CDN, no auth needed)
    try {
      const metas = await fetchMetaIndexFromCDN(env);
      await rebuildKvFromMetas(env, metas);
      await env.META_KV.put(KV_SYNC_TIMESTAMP, String(Date.now()));
      console.log(`[Cron] Synced KV with ${metas.length} notes from CDN`);
    } catch (error) {
      console.error('[Cron] Sync failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  },

  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS(origin) });
    }

    try {
      if (url.pathname === '/notes/meta' && request.method === 'GET') {
        return await handleNotesMeta(request, env, origin);
      }

      if (url.pathname === '/notes/sync' && request.method === 'POST') {
        const auth = await assertWriteAuthorized(request, env, origin);
        if (!auth.ok) return auth.response;
        return await handleNotesSync(env, origin, auth.token);
      }

      if (url.pathname === '/notes/create' && request.method === 'POST') {
        const auth = await assertWriteAuthorized(request, env, origin);
        if (!auth.ok) return auth.response;
        return await handleCreate(request, env, origin, auth.token);
      }

      if (url.pathname === '/notes/update' && request.method === 'POST') {
        const auth = await assertWriteAuthorized(request, env, origin);
        if (!auth.ok) return auth.response;
        return await handleUpdate(request, env, origin, auth.token);
      }

      if (url.pathname === '/notes/delete' && request.method === 'POST') {
        const auth = await assertWriteAuthorized(request, env, origin);
        if (!auth.ok) return auth.response;
        return await handleDelete(request, env, origin, auth.token);
      }

      if (url.pathname === '/oauth/token' && request.method === 'POST') {
        const parsed = await parseJsonBody(request, origin);
        if (!parsed.ok) return parsed.response;

        const code = parsed.body?.code;
        if (!code) return json({ error: 'Missing code' }, 400, origin);

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
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Internal worker error' },
        500,
        origin,
      );
    }
  },
};
