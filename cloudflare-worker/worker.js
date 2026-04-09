/**
 * Cloudflare Worker – GitHub App + D1 metadata + KV cache + CDN content
 *
 * Architecture:
 * - D1: Metadata storage with full-text search
 * - KV: Cache for CDN responses and GitHub App tokens
 * - GitHub App: Authentication for write operations
 * - jsDelivr CDN: Reading note content (cached in KV)
 *
 * Endpoints:
 *   GET  /notes/meta         - Query metadata from D1
 *   GET  /notes/:id          - Get note content from CDN (cached)
 *   POST /notes/sync         - Sync metadata from GitHub to D1
 *   POST /notes/create       - Create new note
 *   POST /notes/update       - Update existing note
 *   POST /notes/delete       - Delete note
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

  // Filter by category
  const category = normalizeText(params.get('category'));
  if (category && category !== 'all') {
    query += ' AND category = ?';
    bindings.push(category);
  }

  // Filter by language
  const language = normalizeText(params.get('language'));
  if (language && language !== 'all') {
    query += ' AND (language = ? OR languages LIKE ?)';
    bindings.push(language, `%"${language}"%`);
  }

  // Filter by tag
  const tag = normalizeText(params.get('tag'));
  if (tag && tag !== 'all') {
    query += ' AND tags LIKE ?';
    bindings.push(`%"${tag}"%`);
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
// CDN + KV Cache Functions
// ============================================================================

async function getCDNNoteContent(env, id) {
  const cacheKey = `${CACHE_KEYS.CDN_NOTE_PREFIX}${id}`;
  
  // Try cache first
  const cached = await env.CACHE_KV.get(cacheKey, 'json');
  if (cached) {
    return cached;
  }

  // Fetch from CDN
  const { owner, repo, branch } = getRepoConfig(env);
  const cdnUrl = getCDNUrl(owner, repo, branch, `notes/${id}.json`);
  
  const response = await fetch(cdnUrl);
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`CDN fetch failed: ${response.status}`);
  }

  const data = await response.json();
  
  // Cache with TTL
  await env.CACHE_KV.put(cacheKey, JSON.stringify(data), {
    expirationTtl: CACHE_TTL.CDN_CONTENT,
  });

  return data;
}

async function invalidateCDNCache(env, id) {
  await env.CACHE_KV.delete(`${CACHE_KEYS.CDN_NOTE_PREFIX}${id}`);
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
  const result = await d1QueryMeta(env, url.searchParams);
  return json(result, 200, origin, `public, max-age=${CACHE_TTL.D1_QUERY}`);
}

async function handleNoteGet(request, env, origin, id) {
  try {
    const content = await getCDNNoteContent(env, id);
    if (!content) {
      return json({ error: 'Note not found' }, 404, origin);
    }
    return json(content, 200, origin, `public, max-age=${CACHE_TTL.CDN_CONTENT}`);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Failed to fetch note' },
      500,
      origin
    );
  }
}

async function handleNotesSync(env, origin) {
  const token = await getGitHubAppToken(env);
  const count = await syncD1FromGitHub(env, token);
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
  const parsed = await parseJsonBody(request, origin);
  if (!parsed.ok) return parsed.response;

  const incoming = parsed.body?.note;
  if (!incoming || !incoming.type || !incoming.category || !incoming.title) {
    return json({ error: 'Missing note payload' }, 400, origin);
  }

  const token = await getGitHubAppToken(env);
  const id = generateId();
  const ts = nowMs();
  const note = { ...incoming, id, createdAt: ts, updatedAt: ts };
  const meta = noteToMeta(note);

  await githubPutFile(`notes/${id}.json`, note, env, token, `add note: ${note.title}`);
  await githubPutFile(`meta/${id}.json`, meta, env, token, `add meta: ${note.title}`);
  await d1InsertMeta(env, meta);

  return json({ note }, 200, origin);
}

async function handleUpdate(request, env, origin) {
  const parsed = await parseJsonBody(request, origin);
  if (!parsed.ok) return parsed.response;

  const { id, updates } = parsed.body || {};
  if (!id || !updates) {
    return json({ error: 'Missing id or updates' }, 400, origin);
  }

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
  await invalidateCDNCache(env, id);

  return json({ note: updated }, 200, origin);
}

async function handleDelete(request, env, origin) {
  const parsed = await parseJsonBody(request, origin);
  if (!parsed.ok) return parsed.response;

  const id = parsed.body?.id;
  if (!id) {
    return json({ error: 'Missing id' }, 400, origin);
  }

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
  await invalidateCDNCache(env, id);

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

      // Specific routes BEFORE pattern matching
      if (url.pathname === '/notes/sync' && request.method === 'POST') {
        return await handleNotesSync(env, origin);
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

      // GET /notes/:id - Get note content from CDN (must be AFTER specific routes)
      const noteMatch = url.pathname.match(/^\/notes\/([^\/]+)$/);
      if (noteMatch && request.method === 'GET') {
        return await handleNoteGet(request, env, origin, noteMatch[1]);
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
