import type { Note, Folder } from '../../types';
import type { IStorageService } from './IStorageService';

export interface GitHubStorageConfig {
  owner: string;
  repo: string;
  branch: string;
  token?: string;
}

interface GitHubFileResponse {
  sha: string;
  content: string; // base64
}

interface RepoFile<T> {
  data: T;
  sha: string;
}

/**
 * Storage backend that reads/writes:
 *   - index.json       (lightweight note summaries for list view)
 *   - notes/{id}.json  (full note body, loaded on demand)
 *
 * Public read:  works without a token (jsDelivr CDN)
 * Writes:       require a GitHub token with at least repo:write scope
 */
export class GitHubStorageService implements IStorageService {
  private apiBase = 'https://api.github.com';
  private cdnBase = 'https://cdn.jsdelivr.net/gh';
  private indexPath = 'index.json';
  private notesDir = 'notes';
  private legacyPath = 'notes.json';
  private cfg: GitHubStorageConfig;

  constructor(cfg: GitHubStorageConfig) {
    this.cfg = cfg;
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private authHeaders(extra: Record<string, string> = {}): HeadersInit {
    const h: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...extra,
    };
    if (this.cfg.token) {
      h['Authorization'] = `Bearer ${this.cfg.token}`;
    }
    return h;
  }

  private decodeContent(encoded: string): string {
    return decodeURIComponent(escape(atob(encoded.replace(/\n/g, ''))));
  }

  private encodeContent(content: string): string {
    return btoa(unescape(encodeURIComponent(content)));
  }

  private getNotePath(id: string): string {
    return `${this.notesDir}/${id}.json`;
  }

  private toIndexNote(note: Note): Note {
    return {
      id: note.id,
      type: note.type,
      category: note.category,
      title: note.title,
      question: note.question,
      problem: note.problem,
      content: note.type === 'blog' ? note.content?.slice(0, 180) : undefined,
      answer: undefined,
      solution: undefined,
      language: note.language,
      solutions: note.solutions?.map((item) => ({ language: item.language, solution: '' })),
      tags: note.tags,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
  }

  private async getFileViaApi<T>(path: string): Promise<RepoFile<T> | null> {
    const url = `${this.apiBase}/repos/${this.cfg.owner}/${this.cfg.repo}/contents/${path}?ref=${this.cfg.branch}`;
    const res = await fetch(url, { headers: this.authHeaders() });

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub API error ${res.status}`);

    const data: GitHubFileResponse = await res.json();
    return { data: JSON.parse(this.decodeContent(data.content)) as T, sha: data.sha };
  }

  private async getFilePublic<T>(path: string): Promise<T | null> {
    const url = `${this.cdnBase}/${this.cfg.owner}/${this.cfg.repo}@${this.cfg.branch}/${path}`;
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async putFile(path: string, data: unknown, sha: string, message: string): Promise<void> {
    if (!this.cfg.token) throw new Error('Not authenticated');

    const body: Record<string, unknown> = {
      message,
      content: this.encodeContent(JSON.stringify(data, null, 2)),
      branch: this.cfg.branch,
    };
    if (sha) {
      body.sha = sha;
    }

    const res = await fetch(
      `${this.apiBase}/repos/${this.cfg.owner}/${this.cfg.repo}/contents/${path}`,
      {
        method: 'PUT',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || `GitHub write error ${res.status}`);
    }
  }

  private async deleteFile(path: string, sha: string, message: string): Promise<void> {
    if (!this.cfg.token) throw new Error('Not authenticated');

    const body = {
      message,
      sha,
      branch: this.cfg.branch,
    };

    const res = await fetch(
      `${this.apiBase}/repos/${this.cfg.owner}/${this.cfg.repo}/contents/${path}`,
      {
        method: 'DELETE',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || `GitHub write error ${res.status}`);
    }
  }

  private async getIndex(): Promise<RepoFile<Note[]>> {
    if (this.cfg.token) {
      const apiIndex = await this.getFileViaApi<Note[]>(this.indexPath);
      if (apiIndex) {
        return apiIndex;
      }

      const legacy = await this.getFileViaApi<Note[]>(this.legacyPath);
      if (legacy) {
        return { data: legacy.data.map((note) => this.toIndexNote(note)), sha: '' };
      }

      return { data: [], sha: '' };
    }

    const publicIndex = await this.getFilePublic<Note[]>(this.indexPath);
    if (publicIndex) {
      return { data: publicIndex, sha: '' };
    }

    const legacy = await this.getFilePublic<Note[]>(this.legacyPath);
    if (legacy) {
      return { data: legacy.map((note) => this.toIndexNote(note)), sha: '' };
    }

    return { data: [], sha: '' };
  }

  private async getFullNoteFile(id: string): Promise<RepoFile<Note> | null> {
    const path = this.getNotePath(id);

    if (this.cfg.token) {
      return this.getFileViaApi<Note>(path);
    }

    const data = await this.getFilePublic<Note>(path);
    return data ? { data, sha: '' } : null;
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // ── IStorageService ───────────────────────────────────────────────────────

  async getNotes(): Promise<Note[]> {
    const { data } = await this.getIndex();
    return data;
  }

  async getNote(id: string): Promise<Note | null> {
    const fullNote = await this.getFullNoteFile(id);
    if (fullNote) {
      return fullNote.data;
    }

    if (this.cfg.token) {
      const legacy = await this.getFileViaApi<Note[]>(this.legacyPath);
      return legacy?.data.find((n) => n.id === id) ?? null;
    }

    const legacy = await this.getFilePublic<Note[]>(this.legacyPath);
    return legacy?.find((n) => n.id === id) ?? null;
  }

  async createNote(noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note> {
    const { data: indexNotes, sha } = await this.getIndex();
    const now = Date.now();
    const note: Note = { ...noteData, id: this.generateId(), createdAt: now, updatedAt: now };
    const indexEntry = this.toIndexNote(note);

    await this.putFile(this.getNotePath(note.id), note, '', `add note file: ${note.title}`);
    await this.putFile(this.indexPath, [...indexNotes, indexEntry], sha, `add note index: ${note.title}`);
    return note;
  }

  async updateNote(id: string, updates: Partial<Note>): Promise<Note> {
    const existingFile = await this.getFullNoteFile(id);
    const { data: indexNotes, sha } = await this.getIndex();
    const idx = indexNotes.findIndex((n) => n.id === id);
    if (idx === -1) throw new Error(`Note ${id} not found`);

    const baseNote = existingFile?.data ?? await this.getNote(id);
    if (!baseNote) {
      throw new Error(`Note ${id} not found`);
    }

    const updated: Note = {
      ...baseNote,
      ...updates,
      id,
      createdAt: baseNote.createdAt,
      updatedAt: Date.now(),
    };

    indexNotes[idx] = this.toIndexNote(updated);

    await this.putFile(this.getNotePath(id), updated, existingFile?.sha ?? '', `update note file: ${updated.title}`);
    await this.putFile(this.indexPath, indexNotes, sha, `update note index: ${updated.title}`);
    return updated;
  }

  async deleteNote(id: string): Promise<void> {
    const existingFile = await this.getFullNoteFile(id);
    const { data: indexNotes, sha } = await this.getIndex();
    const note = indexNotes.find((n) => n.id === id);
    const filtered = indexNotes.filter((n) => n.id !== id);

    if (existingFile?.sha) {
      await this.deleteFile(this.getNotePath(id), existingFile.sha, `delete note file: ${note?.title ?? id}`);
    }
    await this.putFile(this.indexPath, filtered, sha, `delete note index: ${note?.title ?? id}`);
  }

  // ── Folder stubs (not used in current UI) ────────────────────────────────
  async getFolders(): Promise<Folder[]> { return []; }
  async getFolder(_id: string): Promise<null> { return null; }
  async createFolder(): Promise<never> { throw new Error('Not supported'); }
  async updateFolder(): Promise<never> { throw new Error('Not supported'); }
  async deleteFolder(): Promise<void> {}
  async clear(): Promise<void> {}
}
