import type { Note, Folder } from '../../types';
import type { IStorageService } from './IStorageService';

export interface GitHubStorageConfig {
  owner: string;
  repo: string;
  branch: string;
  token?: string;
  workerUrl?: string;
}

interface GitHubFileResponse {
  sha: string;
  content: string; // base64
}

interface RepoFile<T> {
  data: T;
  sha: string;
}

interface WorkerMetaResponse {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  rows: NoteMeta[];
}

interface TreeItem {
  path: string;
  type: string;
  sha: string;
}

interface TreeResponse {
  tree: TreeItem[];
  truncated: boolean;
}

/** Fields kept in meta/{id}.json — everything needed for list + search, no heavy content */
type NoteMeta = Pick<
  Note,
  'id' | 'type' | 'category' | 'title' | 'language' | 'tags' | 'createdAt' | 'updatedAt'
> & {
  preview: string;   // first 200 chars of question / problem / blog content
  languages: string[]; // all languages across solutions array
};

const META_BATCH = 12; // parallel CDN fetches per batch

/**
 * Scalable storage backend using the GitHub Tree API:
 *
 *   meta/{id}.json   ← lightweight summary (~400B), fetched in parallel batches
 *   notes/{id}.json  ← full note body, fetched only when opening a note
 *
 * Public read:  jsDelivr CDN (fast, globally cached)
 * Writes:       GitHub Contents API (requires token with repo:write)
 *
 * No shared mutable index file → no race conditions, scales to any note count.
 * Backward compatible: falls back to legacy index.json / notes.json if meta/ is absent.
 */
export class GitHubStorageService implements IStorageService {
  private apiBase = 'https://api.github.com';
  private cdnBase = 'https://cdn.jsdelivr.net/gh';
  private metaDir = 'meta';
  private notesDir = 'notes';
  private imageDir = 'images';
  // legacy paths kept for read-only fallback
  private legacyIndexPath = 'index.json';
  private legacyNotesPath = 'notes.json';
  private cfg: GitHubStorageConfig;

  constructor(cfg: GitHubStorageConfig) {
    this.cfg = cfg;
  }

  private get workerUrl(): string {
    return (this.cfg.workerUrl ?? '').replace(/\/$/, '');
  }

  // ── encoding ─────────────────────────────────────────────────────────────

  private decode(encoded: string): string {
    return decodeURIComponent(escape(atob(encoded.replace(/\n/g, ''))));
  }

  private encode(content: string): string {
    return btoa(unescape(encodeURIComponent(content)));
  }

  private encodeBytes(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    return btoa(binary);
  }

  // ── paths ─────────────────────────────────────────────────────────────────

  private metaPath(id: string) { return `${this.metaDir}/${id}.json`; }
  private notePath(id: string) { return `${this.notesDir}/${id}.json`; }

  private sanitizeFileName(name: string): string {
    const trimmed = name.trim() || 'image';
    const parts = trimmed.split('.');
    const ext = parts.length > 1 ? `.${parts.pop()?.toLowerCase() ?? 'png'}` : '';
    const base = parts.join('.') || trimmed;

    const safeBase = base
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'image';

    return `${safeBase}${ext}`;
  }

  private imagePath(fileName: string): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const safeName = this.sanitizeFileName(fileName);
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    return `${this.imageDir}/${year}/${month}/${Date.now()}-${randomSuffix}-${safeName}`;
  }

  private publicFileUrl(path: string): string {
    const encodedPath = path.split('/').map((part) => encodeURIComponent(part)).join('/');
    return `https://raw.githubusercontent.com/${this.cfg.owner}/${this.cfg.repo}/${this.cfg.branch}/${encodedPath}`;
  }

  // ── meta helper ───────────────────────────────────────────────────────────

  private toMeta(note: Note): NoteMeta {
    const preview =
      note.question?.slice(0, 200) ??
      note.problem?.slice(0, 200) ??
      note.content?.slice(0, 200) ??
      '';

    const languages: string[] = note.solutions
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
      languages,
      tags: note.tags,
      preview,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
  }

  private metaToNote(meta: NoteMeta): Note {
    return {
      id: meta.id,
      type: meta.type,
      category: meta.category,
      title: meta.title,
      language: meta.language,
      tags: meta.tags,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      // content fields are empty in meta — will be loaded on demand via getNote()
      question: meta.preview,
      problem: meta.type === 'coding' ? meta.preview : undefined,
      solutions: meta.languages.map((l) => ({ language: l, solution: '' })),
    };
  }

  // ── auth headers ──────────────────────────────────────────────────────────

  private authHeaders(extra: Record<string, string> = {}): HeadersInit {
    const h: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...extra,
    };
    if (this.cfg.token) h['Authorization'] = `Bearer ${this.cfg.token}`;
    return h;
  }

  // ── low-level GitHub API calls ────────────────────────────────────────────

  private async apiGet<T>(path: string): Promise<RepoFile<T> | null> {
    const url = `${this.apiBase}/repos/${this.cfg.owner}/${this.cfg.repo}/contents/${path}?ref=${this.cfg.branch}`;
    const res = await fetch(url, { headers: this.authHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub API error ${res.status} on ${path}`);
    const file: GitHubFileResponse = await res.json();
    return { data: JSON.parse(this.decode(file.content)) as T, sha: file.sha };
  }

  private async cdnGet<T>(path: string): Promise<T | null> {
    // Add a cache-bust only for meta (fresh data); notes are immutable until edited
    const url = `${this.cdnBase}/${this.cfg.owner}/${this.cfg.repo}@${this.cfg.branch}/${path}`;
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`CDN fetch error ${res.status} on ${path}`);
    return res.json() as Promise<T>;
  }

  private async readFileData<T>(path: string): Promise<T | null> {
    try {
      const fromCdn = await this.cdnGet<T>(path);
      if (fromCdn) return fromCdn;
    } catch {
      // fallback to API below
    }

    const fromApi = await this.apiGet<T>(path);
    return fromApi?.data ?? null;
  }

  private async workerRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.workerUrl) {
      throw new Error('Worker URL not configured');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };

    if (this.cfg.token) {
      headers.Authorization = `Bearer ${this.cfg.token}`;
      headers['X-GitHub-Token'] = this.cfg.token;
    }

    const res = await fetch(`${this.workerUrl}${path}`, {
      ...init,
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string; message?: string }).error ?? (err as { message?: string }).message ?? `Worker error ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  private async getNotesFromWorker(): Promise<Note[]> {
    const pageSize = 100;
    const first = await this.workerRequest<WorkerMetaResponse>(`/notes/meta?page=1&pageSize=${pageSize}`, {
      method: 'GET',
    });

    let rows = [...first.rows];
    for (let page = 2; page <= first.totalPages; page += 1) {
      const next = await this.workerRequest<WorkerMetaResponse>(`/notes/meta?page=${page}&pageSize=${pageSize}`, {
        method: 'GET',
      });
      rows = rows.concat(next.rows);
    }

    return rows.map((meta) => this.metaToNote(meta));
  }

  private async putFile(path: string, data: unknown, sha: string, message: string): Promise<void> {
    if (!this.cfg.token) throw new Error('Not authenticated');
    const body: Record<string, unknown> = {
      message,
      content: this.encode(JSON.stringify(data, null, 2)),
      branch: this.cfg.branch,
    };
    if (sha) body.sha = sha;

    const res = await fetch(
      `${this.apiBase}/repos/${this.cfg.owner}/${this.cfg.repo}/contents/${path}`,
      {
        method: 'PUT',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message ?? `GitHub write error ${res.status}`);
    }
  }

  private async putRawFile(path: string, contentBase64: string, message: string, sha = ''): Promise<void> {
    if (!this.cfg.token) throw new Error('Not authenticated');

    const body: Record<string, unknown> = {
      message,
      content: contentBase64,
      branch: this.cfg.branch,
    };

    if (sha) body.sha = sha;

    const res = await fetch(
      `${this.apiBase}/repos/${this.cfg.owner}/${this.cfg.repo}/contents/${path}`,
      {
        method: 'PUT',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message ?? `GitHub write error ${res.status}`);
    }
  }

  private async deleteFile(path: string, sha: string, message: string): Promise<void> {
    if (!this.cfg.token) throw new Error('Not authenticated');
    const res = await fetch(
      `${this.apiBase}/repos/${this.cfg.owner}/${this.cfg.repo}/contents/${path}`,
      {
        method: 'DELETE',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ message, sha, branch: this.cfg.branch }),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message ?? `GitHub delete error ${res.status}`);
    }
  }

  // ── Tree API ──────────────────────────────────────────────────────────────

  /**
   * Returns all note IDs by listing meta/ via the Git Tree API.
   * One API call regardless of how many notes exist.
   */
  private async getMetaIds(): Promise<string[]> {
    const url = `${this.apiBase}/repos/${this.cfg.owner}/${this.cfg.repo}/git/trees/${this.cfg.branch}?recursive=1`;
    const res = await fetch(url, { headers: this.authHeaders() });
    if (!res.ok) throw new Error(`Tree API error ${res.status}`);
    const tree: TreeResponse = await res.json();

    return tree.tree
      .filter((item) => item.type === 'blob' && item.path.startsWith(`${this.metaDir}/`) && item.path.endsWith('.json'))
      .map((item) => item.path.replace(`${this.metaDir}/`, '').replace('.json', ''));
  }

  /** Fetch all meta files in parallel batches, return as Note stubs */
  private async fetchAllMeta(ids: string[]): Promise<Note[]> {
    const results: Note[] = [];

    for (let i = 0; i < ids.length; i += META_BATCH) {
      const batch = ids.slice(i, i + META_BATCH);
      const fetched = await Promise.all(
        batch.map(async (id) => {
          try {
            return await this.readFileData<NoteMeta>(this.metaPath(id));
          } catch {
            return null;
          }
        }),
      );
      for (const m of fetched) {
        if (m) results.push(this.metaToNote(m as NoteMeta));
      }
    }

    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Get SHA of an existing meta file (needed for updates/deletes via API) */
  private async getMetaSha(id: string): Promise<string> {
    const file = await this.apiGet<NoteMeta>(this.metaPath(id));
    return file?.sha ?? '';
  }

  private async getNoteSha(id: string): Promise<string> {
    const file = await this.apiGet<Note>(this.notePath(id));
    return file?.sha ?? '';
  }

  // ── legacy fallback ───────────────────────────────────────────────────────

  private async legacyFallbackNotes(): Promise<Note[]> {
    // Try new index.json first, then old notes.json
    const tryIndex = await this.readFileData<Note[]>(this.legacyIndexPath);
    if (tryIndex) return tryIndex;

    const tryNotes = await this.readFileData<Note[]>(this.legacyNotesPath);
    if (tryNotes) return tryNotes;

    return [];
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // ── IStorageService ───────────────────────────────────────────────────────

  async getNotes(): Promise<Note[]> {
    if (this.workerUrl) {
      try {
        return await this.getNotesFromWorker();
      } catch {
        // fallback to direct GitHub reads
      }
    }

    const ids = await this.getMetaIds().catch(() => [] as string[]);
    if (ids.length > 0) return this.fetchAllMeta(ids);
    // fall back gracefully to legacy layout
    return this.legacyFallbackNotes();
  }

  async getNote(id: string): Promise<Note | null> {
    // Always fetch full note file (CDN-first, API fallback)
    const full = await this.readFileData<Note>(this.notePath(id));

    if (full) return full;

    // Legacy fallback: old notes.json
    const legacy = await this.legacyFallbackNotes();
    return legacy.find((n) => n.id === id) ?? null;
  }

  async createNote(noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note> {
    if (this.workerUrl && this.cfg.token) {
      try {
        const response = await this.workerRequest<{ note: Note }>('/notes/create', {
          method: 'POST',
          body: JSON.stringify({ note: noteData }),
        });
        return response.note;
      } catch {
        // fallback to direct GitHub writes
      }
    }

    const now = Date.now();
    const note: Note = { ...noteData, id: this.generateId(), createdAt: now, updatedAt: now };
    const meta = this.toMeta(note);

    // Two independent commits — no shared index to corrupt
    await this.putFile(this.notePath(note.id), note, '', `add note: ${note.title}`);
    await this.putFile(this.metaPath(note.id), meta, '', `add meta: ${note.title}`);
    return note;
  }

  async updateNote(id: string, updates: Partial<Note>): Promise<Note> {
    if (this.workerUrl && this.cfg.token) {
      try {
        const response = await this.workerRequest<{ note: Note }>('/notes/update', {
          method: 'POST',
          body: JSON.stringify({ id, updates }),
        });
        return response.note;
      } catch {
        // fallback to direct GitHub writes
      }
    }

    // Fetch current SHA values and base content in parallel
    const [noteFile, metaSha] = await Promise.all([
      this.apiGet<Note>(this.notePath(id)),
      this.getMetaSha(id),
    ]);

    const base = noteFile?.data ?? await this.getNote(id);
    if (!base) throw new Error(`Note ${id} not found`);

    const updated: Note = { ...base, ...updates, id, createdAt: base.createdAt, updatedAt: Date.now() };
    const meta = this.toMeta(updated);

    await this.putFile(this.notePath(id), updated, noteFile?.sha ?? '', `update note: ${updated.title}`);
    await this.putFile(this.metaPath(id), meta, metaSha, `update meta: ${updated.title}`);
    return updated;
  }

  async deleteNote(id: string): Promise<void> {
    if (this.workerUrl && this.cfg.token) {
      try {
        await this.workerRequest<{ ok: boolean }>('/notes/delete', {
          method: 'POST',
          body: JSON.stringify({ id }),
        });
        return;
      } catch {
        // fallback to direct GitHub writes
      }
    }

    const [noteSha, metaSha] = await Promise.all([
      this.getNoteSha(id),
      this.getMetaSha(id),
    ]);

    const title = (await this.apiGet<Note>(this.notePath(id)))?.data.title ?? id;

    await Promise.all([
      noteSha ? this.deleteFile(this.notePath(id), noteSha, `delete note: ${title}`) : Promise.resolve(),
      metaSha ? this.deleteFile(this.metaPath(id), metaSha, `delete meta: ${title}`) : Promise.resolve(),
    ]);
  }

  async uploadImage(file: File): Promise<string> {
    if (!this.cfg.token) {
      throw new Error('Sign in with GitHub to upload images');
    }

    if (!file.type.startsWith('image/')) {
      throw new Error('Please select a valid image file');
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = this.imagePath(file.name);

    await this.putRawFile(path, this.encodeBytes(bytes), `upload image: ${file.name}`);

    return this.publicFileUrl(path);
  }

  // ── Folder stubs ──────────────────────────────────────────────────────────
  async getFolders(): Promise<Folder[]> { return []; }
  async getFolder(id: string): Promise<null> { void id; return null; }
  async createFolder(): Promise<never> { throw new Error('Not supported'); }
  async updateFolder(): Promise<never> { throw new Error('Not supported'); }
  async deleteFolder(): Promise<void> {}
  async clear(): Promise<void> {}
}
