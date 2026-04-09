/**
 * Cloudflare Worker – GitHub App + D1 metadata + KV query cache
 *
 * Architecture:
 * - D1: Metadata storage with full-text search (SQLite)
 * - KV: Cache for D1 query results (60s TTL) and GitHub App tokens (1hr TTL)
 * - GitHub App: Authentication for write operations (5000 req/hr rate limit)
 * - jsDelivr CDN: Note content read directly by frontend (not cached here)
 *
 * Endpoints:
 *   POST /oauth/token         - Exchange OAuth code for user token
 *   GET  /notes/meta          - Query metadata from D1 (cached, tracks tag filters)
 *   GET  /notes/tags/popular  - Get popular tags (usage-weighted)
 *   POST /notes/sync          - Sync metadata from GitHub to D1 (auth required)
 *   POST /notes/create        - Create new note (auth required)
 *   POST /notes/update        - Update existing note (auth required)
 *   POST /notes/delete        - Delete note (auth required)
 */

import { getGitHubAppToken } from './github-app-auth.js';
import {
  CACHE_KEYS,
  CACHE_TTL,
  PAGINATION,
  GITHUB,
  WRITE_PERMISSIONS,
  getRepoConfig,
  getAllowedOrigin,
  getOAuthConfig,
  getCDNUrl,
} from './config.js';

const CORS = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
    'X-GitHub-Api-Version': GITHUB.API_VERSION,
    'User-Agent': GITHUB.USER_AGENT,
  };
  if (token) {
    headers.Authorization = `token ${token.trim()}`;
  }
  return headers;
}

function repoContentUrl(env, path) {
  const { owner, repo, branch } = getRepoConfig(env);
  return `${GITHUB.API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
}

function repoContentWriteUrl(env, path) {
  const { owner, repo } = getRepoConfig(env);
  return `${GITHUB.API_BASE}/repos/${owner}/${repo}/contents/${path}`;
}

function encodeBase64Json(data) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
}

function decodeBase64Json(content) {
  return JSON.parse(decodeURIComponent(escape(atob(content.replace(/\n/g, '')))));
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

// ============================================================================
// User Authentication & Authorization
// ============================================================================

/**
 * Parse authentication token from request headers
 */
function parseAuthToken(request) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^(Bearer|token)\s+(.+)$/i);
  if (match?.[2]) return match[2].trim();

  const alt = request.headers.get('X-GitHub-Token') || request.headers.get('x-github-token');
  if (alt) return alt.trim();

  return null;
}

/**
 * Fetch GitHub user information
 */
async function githubGetUser(token) {
  const res = await fetch(`${GITHUB.API_BASE}/user`, {
    headers: githubHeaders(token),
  });

  if (res.ok) {
    return res.json();
  }

  // Fallback for environments expecting Bearer token format
  if (res.status === 401) {
    const retry = await fetch(`${GITHUB.API_BASE}/user`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB.API_VERSION,
        Authorization: `Bearer ${token}`,
      },
    });
    if (retry.ok) return retry.json();
  }

  return null;
}

/**
 * Check if user has write access to the data repository
 */
async function checkWriteAccess(token, env, userLogin) {
  const { owner, repo } = getRepoConfig(env);
  const res = await fetch(
    `${GITHUB.API_BASE}/repos/${owner}/${repo}/collaborators/${userLogin}/permission`,
    { headers: githubHeaders(token) },
  );
  
  if (res.status === 403 || res.status === 404) return false;
  if (!res.ok) return false;
  
  const data = await res.json();
  const permission = data.role_name ?? data.permission ?? '';
  return WRITE_PERMISSIONS.includes(permission);
}

/**
 * Assert user is authenticated and has write access
 * Returns { ok: true, token, user } if authorized
 * Returns { ok: false, response } with error response if not
 */
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
    return { 
      ok: false, 
      response: json({ error: 'No write access to data repo' }, 403, origin) 
    };
  }

  return { ok: true, token, user };
}

// ============================================================================
// D1 Database Functions
// ============================================================================

async function d1InsertMeta(env, meta) {
  const stmt = env.DB.prepare(`
    INSERT OR REPLACE INTO notes_meta
    (id, type, category, title, language, tags, languages, preview, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  await stmt.bind(
    meta.id,
    meta.type,
    meta.category,
    meta.title,
    meta.language || '',
    JSON.stringify(meta.tags || []),
    JSON.stringify(meta.languages || []),
    meta.preview || '',
    meta.createdAt || Date.now(),
    meta.updatedAt || Date.now()
  ).run();
}

async function d1DeleteMeta(env, id) {
  await env.DB.prepare('DELETE FROM notes_meta WHERE id = ?').bind(id).run();
}

async function d1GetMeta(env, id) {
  const result = await env.DB.prepare('SELECT * FROM notes_meta WHERE id = ?').bind(id).first();
  if (!result) return null;
  return rowToMeta(result);
}

async function d1QueryMeta(env, params) {
  let query = 'SELECT * FROM notes_meta WHERE 1=1';
  const bindings = [];

  // Filter by type
  const type = normalizeText(params.get('type'));
  if (type && type !== 'all') {
    query += ' AND type = ?';
    bindings.push(type);
  }

  // Filter by categories (multi-select)
  const categories = params.getAll('category').filter(Boolean);
  if (categories.length > 0) {
    const placeholders = categories.map(() => '?').join(',');
    query += ` AND category IN (${placeholders})`;
    bindings.push(...categories);
  }

  // Filter by languages (multi-select)
  const languages = params.getAll('language').filter(Boolean);
  if (languages.length > 0) {
    const langConditions = languages.map(() => '(language = ? OR languages LIKE ?)').join(' OR ');
    query += ` AND (${langConditions})`;
    languages.forEach(lang => {
      bindings.push(lang, `%"${lang}"%`);
    });
  }

  // Filter by tags (multi-select - match any)
  const tags = params.getAll('tag').filter(Boolean);
  if (tags.length > 0) {
    const tagConditions = tags.map(() => 'tags LIKE ?').join(' OR ');
    query += ` AND (${tagConditions})`;
    tags.forEach(tag => {
      bindings.push(`%"${tag}"%`);
    });
  }

  // Full-text search
  const q = params.get('q');
  if (q && q.trim()) {
    // Use FTS if available
    const ftsQuery = `
      SELECT notes_meta.* FROM notes_meta
      JOIN notes_fts ON notes_meta.rowid = notes_fts.rowid
      WHERE notes_fts MATCH ?
    `;
    const ftsBindings = [q.trim()];
    
    // If we have filters, we need to apply them too
    if (bindings.length > 0) {
      query += ' AND id IN (' + ftsQuery.replace('SELECT notes_meta.*', 'SELECT notes_meta.id') + ')';
      bindings.push(...ftsBindings);
    } else {
      query = ftsQuery;
      bindings.push(...ftsBindings);
    }
  }

  // Order by updated_at descending
  query += ' ORDER BY updated_at DESC';

  // Pagination
  const page = Math.max(PAGINATION.DEFAULT_PAGE, Number(params.get('page') || PAGINATION.DEFAULT_PAGE));
  const pageSize = Math.min(
    PAGINATION.MAX_PAGE_SIZE,
    Math.max(1, Number(params.get('pageSize') || PAGINATION.DEFAULT_PAGE_SIZE))
  );
  const offset = (page - 1) * pageSize;

  query += ' LIMIT ? OFFSET ?';
  bindings.push(pageSize, offset);

  const stmt = env.DB.prepare(query);
  const result = await stmt.bind(...bindings).all();

  // Get total count for pagination
  let countQuery = 'SELECT COUNT(*) as count FROM notes_meta WHERE 1=1';
  const countBindings = bindings.slice(0, bindings.length - 2); // Remove LIMIT and OFFSET

  if (type && type !== 'all') {
    countQuery += ' AND type = ?';
  }
  if (category && category !== 'all') {
    countQuery += ' AND category = ?';
  }
  if (language && language !== 'all') {
    countQuery += ' AND (language = ? OR languages LIKE ?)';
  }
  if (tag && tag !== 'all') {
    countQuery += ' AND tags LIKE ?';
  }
  if (q && q.trim()) {
    countQuery += ' AND id IN (SELECT notes_meta.id FROM notes_meta JOIN notes_fts ON notes_meta.rowid = notes_fts.rowid WHERE notes_fts MATCH ?)';
  }

  const countStmt = env.DB.prepare(countQuery);
  const countResult = countBindings.length > 0 
    ? await countStmt.bind(...countBindings).first()
    : await countStmt.first();

  const total = countResult?.count || 0;

  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    rows: result.results.map(rowToMeta),
  };
}

function rowToMeta(row) {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    title: row.title,
    language: row.language || '',
    languages: JSON.parse(row.languages || '[]'),
    tags: JSON.parse(row.tags || '[]'),
    preview: row.preview || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// D1 Query Cache Functions
// ============================================================================

function buildQueryCacheKey(params) {
  // Create a stable cache key from query parameters
  const parts = [];
  if (params.type) parts.push(`t:${params.type}`);
  if (params.category) parts.push(`c:${params.category}`);
  if (params.language) parts.push(`l:${params.language}`);
  if (params.tag) parts.push(`tag:${params.tag}`);
  if (params.q) parts.push(`q:${params.q}`);
  parts.push(`p:${params.page}`);
  parts.push(`ps:${params.pageSize}`);
  return `${CACHE_KEYS.D1_QUERY_PREFIX}${parts.join('|')}`;
}

async function getCachedQueryResult(env, params) {
  const cacheKey = buildQueryCacheKey(params);
  const cached = await env.CACHE_KV.get(cacheKey, 'json');
  return cached;
}

async function setCachedQueryResult(env, params, result) {
  const cacheKey = buildQueryCacheKey(params);
  await env.CACHE_KV.put(cacheKey, JSON.stringify(result), {
    expirationTtl: CACHE_TTL.D1_QUERY,
  });
}

async function invalidateAllQueryCache(env) {
  // Delete all query cache keys
  // Note: KV doesn't support prefix delete, so we rely on TTL expiration
  // For immediate invalidation, we could track keys in a list, but TTL is simpler
  // Cache will auto-expire in 60 seconds anyway
  
  // Invalidate popular tags cache when notes are modified
  await env.CACHE_KV.delete(CACHE_KEYS.POPULAR_TAGS);
}

// ============================================================================
// Sync Functions
// ============================================================================

async function fetchMetaIndexViaGitHubAPI(env, token) {
  const { owner, repo, branch } = getRepoConfig(env);
  const treeRes = await fetch(
    `${GITHUB.API_BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
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

  return allMeta;
}

async function syncD1FromGitHub(env, token) {
  const metas = await fetchMetaIndexViaGitHubAPI(env, token);
  
  // Clear existing data
  await env.DB.prepare('DELETE FROM notes_meta').run();
  
  // Insert all metadata
  for (const meta of metas) {
    await d1InsertMeta(env, meta);
  }

  // Update sync timestamp
  await env.DB.prepare(`
    INSERT OR REPLACE INTO sync_state (key, value, updated_at)
    VALUES ('last_sync', ?, ?)
  `).bind(String(Date.now()), Date.now()).run();

  return metas.length;
}

// ============================================================================
// Request Handlers
// ============================================================================

async function handleNotesMeta(request, env, origin) {
  const url = new URL(request.url);
  const params = url.searchParams;
  
  // Track tag filter usage (for popular tags algorithm)
  const tags = params.getAll('tag').filter(Boolean);
  if (tags.length > 0) {
    // Increment filter count for each tag (async, don't await)
    tags.forEach(async (tag) => {
      const filterKey = `${CACHE_KEYS.TAG_FILTER_PREFIX}${tag}`;
      const count = parseInt(await env.CACHE_KV.get(filterKey) || '0', 10);
      await env.CACHE_KV.put(filterKey, String(count + 1), {
        expirationTtl: CACHE_TTL.TAG_FILTER,
      });
    });
  }
  
  const result = await d1QueryMeta(env, params);
  return json(result, 200, origin, `public, max-age=${CACHE_TTL.D1_QUERY}`);
}

/**
 * Popular Tags Algorithm - Multi-Factor Usage Scoring
 * 
 * Combines multiple signals from actual user behavior:
 * 1. Recency: Tags from recently updated notes (time decay)
 * 2. User filters: How often users filter/search by this tag (from /notes/meta requests)
 * 3. Tag frequency: How many notes have this tag
 * 
 * Scoring formula:
 *   score = (recency_weight × tag_count) + (filter_usage_boost)
 * 
 * Weights:
 * - Recency: 7d=5×, 30d=3×, 90d=2×, older=1×
 * - Filter usage: +15 per filter request in last 30 days
 */
async function handlePopularTags(request, env, origin) {
  // Check cache first
  const cached = await env.CACHE_KV.get(CACHE_KEYS.POPULAR_TAGS, 'json');
  if (cached) {
    return json({ tags: cached }, 200, origin, `public, max-age=${CACHE_TTL.POPULAR_TAGS}`);
  }

  // Query all notes with tags and updated_at
  const query = 'SELECT tags, updated_at FROM notes_meta WHERE tags IS NOT NULL AND tags != "[]"';
  const result = await env.DB.prepare(query).all();
  
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const tagScores = new Map();
  
  // Factor 1: Recency-weighted tag frequency
  result.results.forEach(row => {
    const tags = JSON.parse(row.tags || '[]');
    const updatedAt = row.updated_at || 0;
    const ageInDays = (now - updatedAt) / DAY_MS;
    
    // Time decay weights
    let recencyWeight = 1;
    if (ageInDays <= 7) recencyWeight = 5;
    else if (ageInDays <= 30) recencyWeight = 3;
    else if (ageInDays <= 90) recencyWeight = 2;
    
    tags.forEach(tag => {
      const baseScore = tagScores.get(tag) || 0;
      tagScores.set(tag, baseScore + recencyWeight);
    });
  });
  
  // Factor 2: Filter usage boost (from actual user filter requests)
  const filterBoostPromises = Array.from(tagScores.keys()).map(async tag => {
    const filterKey = `${CACHE_KEYS.TAG_FILTER_PREFIX}${tag}`;
    const filterCount = parseInt(await env.CACHE_KV.get(filterKey) || '0', 10);
    return { tag, filterCount };
  });
  
  const filterData = await Promise.all(filterBoostPromises);
  filterData.forEach(({ tag, filterCount }) => {
    const currentScore = tagScores.get(tag) || 0;
    tagScores.set(tag, currentScore + (filterCount * 15)); // +15 per filter use
  });
  
  // Sort by final score and take top 15
  const popularTags = Array.from(tagScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag]) => tag);
  
  // Cache the result
  await env.CACHE_KV.put(
    CACHE_KEYS.POPULAR_TAGS,
    JSON.stringify(popularTags),
    { expirationTtl: CACHE_TTL.POPULAR_TAGS }
  );
  
  return json({ tags: popularTags }, 200, origin, `public, max-age=${CACHE_TTL.POPULAR_TAGS}`);
}

async function handleNotesSync(request, env, origin) {
  // Verify user has write access
  const auth = await assertWriteAuthorized(request, env, origin);
  if (!auth.ok) return auth.response;

  // Use GitHub App token for sync (higher rate limits)
  const token = await getGitHubAppToken(env);
  const count = await syncD1FromGitHub(env, token);
  await invalidateAllQueryCache(env);
  return json({ ok: true, count }, 200, origin);
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

async function handleCreate(request, env, origin) {
  // Verify user has write access
  const auth = await assertWriteAuthorized(request, env, origin);
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, origin);
  if (!parsed.ok) return parsed.response;

  const incoming = parsed.body?.note;
  if (!incoming || !incoming.type || !incoming.category || !incoming.title) {
    return json({ error: 'Missing note payload' }, 400, origin);
  }

  // Use GitHub App token for GitHub operations
  const token = await getGitHubAppToken(env);
  const id = generateId();
  const ts = nowMs();
  const note = { ...incoming, id, createdAt: ts, updatedAt: ts };
  const meta = noteToMeta(note);

  await githubPutFile(`notes/${id}.json`, note, env, token, `add note: ${note.title}`);
  await githubPutFile(`meta/${id}.json`, meta, env, token, `add meta: ${note.title}`);
  await d1InsertMeta(env, meta);
  await invalidateAllQueryCache(env);

  return json({ note }, 200, origin);
}

async function handleUpdate(request, env, origin) {
  // Verify user has write access
  const auth = await assertWriteAuthorized(request, env, origin);
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, origin);
  if (!parsed.ok) return parsed.response;

  const { id, updates } = parsed.body || {};
  if (!id || !updates) {
    return json({ error: 'Missing id or updates' }, 400, origin);
  }

  // Use GitHub App token for GitHub operations
  const token = await getGitHubAppToken(env);
  const currentNoteFile = await githubGetFile(`notes/${id}.json`, env, token);
  if (!currentNoteFile?.data) {
    return json({ error: 'Note not found' }, 404, origin);
  }

  const currentMetaFile = await githubGetFile(`meta/${id}.json`, env, token);
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
  await d1InsertMeta(env, meta);
  await invalidateAllQueryCache(env);

  return json({ note: updated }, 200, origin);
}

async function handleDelete(request, env, origin) {
  // Verify user has write access
  const auth = await assertWriteAuthorized(request, env, origin);
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, origin);
  if (!parsed.ok) return parsed.response;

  const id = parsed.body?.id;
  if (!id) {
    return json({ error: 'Missing id' }, 400, origin);
  }

  // Use GitHub App token for GitHub operations
  const token = await getGitHubAppToken(env);
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

  await d1DeleteMeta(env, id);
  await invalidateAllQueryCache(env);

  return json({ ok: true }, 200, origin);
}

// ============================================================================
// Worker Entry Points
// ============================================================================

export default {
  async scheduled(event, env) {
    // Scheduled sync every hour
    try {
      const token = await getGitHubAppToken(env);
      const count = await syncD1FromGitHub(env, token);
      console.log(`[Cron] Synced D1 with ${count} notes from GitHub`);
    } catch (error) {
      console.error('[Cron] Sync failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  },

  async fetch(request, env) {
    const origin = getAllowedOrigin(env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS(origin) });
    }

    try {
      // OAuth endpoint for frontend compatibility (user login)
      if (url.pathname === '/oauth/token' && request.method === 'POST') {
        const parsed = await parseJsonBody(request, origin);
        if (!parsed.ok) return parsed.response;

        const code = parsed.body?.code;
        if (!code) return json({ error: 'Missing code' }, 400, origin);

        const { clientId, clientSecret } = getOAuthConfig(env);
        const ghRes = await fetch(GITHUB.OAUTH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
          }),
        });

        const data = await ghRes.json();
        if (data.error) {
          return json({ error: data.error_description || data.error }, 400, origin);
        }

        return json({ access_token: data.access_token }, 200, origin);
      }

      if (url.pathname === '/notes/meta' && request.method === 'GET') {
        return await handleNotesMeta(request, env, origin);
      }

      if (url.pathname === '/notes/tags/popular' && request.method === 'GET') {
        return await handlePopularTags(request, env, origin);
      }

      // Specific routes BEFORE pattern matching
      if (url.pathname === '/notes/sync' && request.method === 'POST') {
        return await handleNotesSync(request, env, origin);
      }

      if (url.pathname === '/notes/create' && request.method === 'POST') {
        return await handleCreate(request, env, origin);
      }

      if (url.pathname === '/notes/update' && request.method === 'POST') {
        return await handleUpdate(request, env, origin);
      }

      if (url.pathname === '/notes/delete' && request.method === 'POST') {
        return await handleDelete(request, env, origin);
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
