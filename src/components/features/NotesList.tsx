import { useNotes } from '../../hooks/useNotes';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { NoteForm } from './NoteForm';
import { NoteCard } from './NoteCard';
import { NoteViewer } from './NoteViewer';
import type { Note, NoteType, Category } from '../../types';
import { NOTE_TYPES, CATEGORIES } from '../../constants';
import { GITHUB_CONFIG } from '../../config';
import './NotesList.css';

interface WorkerMetaRow {
  id: string;
  type: NoteType;
  category: Category;
  title: string;
  language?: string;
  languages?: string[];
  tags: string[];
  preview?: string;
  createdAt: number;
  updatedAt: number;
}

interface WorkerMetaResponse {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  rows: WorkerMetaRow[];
}

export function NotesList() {
  const { storageService, hasWriteAccess } = useAuth();
  const { notes, loading, error, getNote, createNote, updateNote, deleteNote } = useNotes(storageService);
  const [showForm, setShowForm] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [openingNoteId, setOpeningNoteId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<NoteType | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all');
  const [filterLanguage, setFilterLanguage] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [remoteNotes, setRemoteNotes] = useState<Note[] | null>(null);
  const [remoteTotal, setRemoteTotal] = useState<number | null>(null);
  const [remotePage, setRemotePage] = useState(1);
  const [remotePageSize] = useState(24);
  const [remoteTotalPages, setRemoteTotalPages] = useState(1);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const isWorkerConfigured = Boolean(GITHUB_CONFIG.oauthWorkerUrl);

  // Derive the set of languages across all notes (for the language dropdown)
  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    for (const note of notes) {
      if (note.language) langs.add(note.language);
      for (const s of note.solutions ?? []) {
        if (s.language) langs.add(s.language);
      }
    }
    return [...langs].sort();
  }, [notes]);

  const handleCreateNote = async (noteData: any) => {
    try {
      await createNote(noteData);
      setShowForm(false);
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  };

  const handleUpdateNote = async (noteData: any) => {
    if (!editingNote) return;
    try {
      const updated = await updateNote(editingNote.id, noteData);
      setShowForm(false);
      setEditingNote(null);
      setSelectedNote(updated);
    } catch (err) {
      console.error('Failed to update note:', err);
    }
  };

  const handleSelectNote = async (note: Note) => {
    try {
      setOpeningNoteId(note.id);
      const fullNote = await getNote(note.id);
      setSelectedNote(fullNote ?? note);
    } catch (err) {
      console.error('Failed to load note:', err);
      setSelectedNote(note);
    } finally {
      setOpeningNoteId(null);
    }
  };

  const filteredNotes = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();

    return notes.filter((note) => {
      // ── filter by type ────────────────────────────────────────────────────
      if (filterType !== 'all' && note.type !== filterType) return false;

      // ── filter by category ────────────────────────────────────────────────
      if (filterCategory !== 'all' && note.category !== filterCategory) return false;

      // ── filter by language ────────────────────────────────────────────────
      if (filterLanguage !== 'all') {
        const noteLangs = [
          note.language,
          ...(note.solutions ?? []).map((s) => s.language),
        ].filter(Boolean);
        if (!noteLangs.includes(filterLanguage)) return false;
      }

      // ── full-text search ──────────────────────────────────────────────────
      if (term) {
        const haystack = [
          note.title,
          ...(note.tags ?? []),
          note.question,
          note.problem,
          // blog content preview comes through as note.content
          note.content,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        // support multi-word: every word must appear somewhere
        const words = term.split(/\s+/);
        if (!words.every((w) => haystack.includes(w))) return false;
      }

      return true;
    });
  }, [notes, filterType, filterCategory, filterLanguage, searchTerm]);

  const isFiltered =
    searchTerm.trim() !== '' ||
    filterType !== 'all' ||
    filterCategory !== 'all' ||
    filterLanguage !== 'all';
  const isRemoteMode = isFiltered && isWorkerConfigured && !remoteError;

  function mapWorkerRowToNote(row: WorkerMetaRow): Note {
    const metaLanguages = row.languages ?? [];
    const normalizedLanguage = row.language || metaLanguages[0];
    return {
      id: row.id,
      type: row.type,
      category: row.category,
      title: row.title,
      language: normalizedLanguage,
      solutions: metaLanguages.map((language) => ({ language, solution: '' })),
      tags: row.tags ?? [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      question: row.type === 'qa' ? row.preview : undefined,
      problem: row.type === 'coding' ? row.preview : undefined,
      content: row.type === 'blog' ? row.preview : undefined,
    };
  }

  useEffect(() => {
    setRemotePage(1);
  }, [searchTerm, filterType, filterCategory, filterLanguage]);

  useEffect(() => {
    if (!isFiltered || !isWorkerConfigured) {
      setRemoteNotes(null);
      setRemoteTotal(null);
      setRemoteTotalPages(1);
      setRemoteLoading(false);
      setRemoteError(null);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setRemoteLoading(true);
        setRemoteError(null);

        const params = new URLSearchParams();
        if (searchTerm.trim()) params.set('q', searchTerm.trim());
        if (filterType !== 'all') params.set('type', filterType);
        if (filterCategory !== 'all') params.set('category', filterCategory);
        if (filterLanguage !== 'all') params.set('language', filterLanguage);
        params.set('page', String(remotePage));
        params.set('pageSize', String(remotePageSize));

        const res = await fetch(`${GITHUB_CONFIG.oauthWorkerUrl}/notes/meta?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Worker search failed (${res.status})`);
        }

        const data = (await res.json()) as WorkerMetaResponse;
        const mapped = data.rows.map(mapWorkerRowToNote);
        setRemoteNotes(mapped);
        setRemoteTotal(data.total);
        setRemoteTotalPages(data.totalPages);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        setRemoteNotes(null);
        setRemoteTotal(null);
        setRemoteTotalPages(1);
        setRemoteError('Worker search unavailable, using local filtering');
      } finally {
        setRemoteLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [
    isFiltered,
    isWorkerConfigured,
    searchTerm,
    filterType,
    filterCategory,
    filterLanguage,
    remotePage,
    remotePageSize,
  ]);

  const displayedNotes = isFiltered && remoteNotes ? remoteNotes : filteredNotes;
  const displayedCount = isFiltered && remoteTotal !== null ? remoteTotal : displayedNotes.length;
  const remoteRangeStart = isRemoteMode && displayedNotes.length > 0
    ? (remotePage - 1) * remotePageSize + 1
    : 0;
  const remoteRangeEnd = isRemoteMode
    ? remoteRangeStart + displayedNotes.length - 1
    : 0;

  if (loading) return <div className="notes-container">Loading notes...</div>;
  if (error) return <div className="notes-container error">Error: {error}</div>;
  if (remoteLoading) return <div className="notes-container">Searching notes...</div>;
  if (openingNoteId) return <div className="notes-container">Loading note...</div>;

  const allUsedTags = [...new Set(notes.flatMap((n) => n.tags))];

  if (showForm) {
    return (
      <NoteForm
        initialNote={editingNote}
        existingTags={allUsedTags}
        onSubmit={editingNote ? handleUpdateNote : handleCreateNote}
        onCancel={() => {
          setShowForm(false);
          setEditingNote(null);
        }}
      />
    );
  }

  if (selectedNote) {
    return (
      <NoteViewer
        note={selectedNote}
        onClose={() => setSelectedNote(null)}
        canEdit={hasWriteAccess}
        onEdit={() => {
          setEditingNote(selectedNote);
          setShowForm(true);
        }}
        onDelete={() => {
          deleteNote(selectedNote.id);
          setSelectedNote(null);
        }}
      />
    );
  }

  return (
    <div className="notes-container">
      <div className="notes-header">
        <div className="header-top">
          <h2>📚 My Notes ({displayedCount}{isFiltered ? ` / ${notes.length}` : ''})</h2>
          {hasWriteAccess && (
            <button className="btn-new-note" onClick={() => setShowForm(true)}>
              ➕ New Note
            </button>
          )}
        </div>

        <div className="filters">
          <div className="search-box">
            <input
              type="text"
              placeholder="🔍 Search title, tags, question…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="filter-row">
            <div className="filter-group">
              <label>Type:</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value as NoteType | 'all')}>
                <option value="all">All Types</option>
                {NOTE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.icon} {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Category:</label>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as Category | 'all')}>
                <option value="all">All Categories</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {availableLanguages.length > 0 && (
              <div className="filter-group">
                <label>Language:</label>
                <select value={filterLanguage} onChange={(e) => setFilterLanguage(e.target.value)}>
                  <option value="all">All Languages</option>
                  {availableLanguages.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isFiltered && (
              <button
                className="btn-clear-filters"
                onClick={() => {
                  setSearchTerm('');
                  setFilterType('all');
                  setFilterCategory('all');
                  setFilterLanguage('all');
                  setRemotePage(1);
                }}
              >
                ✕ Clear
              </button>
            )}
          </div>
        </div>

        {remoteError && (
          <div className="search-fallback-note">⚠️ {remoteError}</div>
        )}
      </div>

      {displayedNotes.length === 0 ? (
        <div className="empty-state">
          <p>
            📝 No notes found.{' '}
            {isFiltered ? 'Try adjusting your filters.' : 'Create your first note!'}
          </p>
        </div>
      ) : (
        <div className="notes-grid">
          {displayedNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              canEdit={hasWriteAccess}
              onDelete={deleteNote}
              onClick={handleSelectNote}
            />
          ))}
        </div>
      )}

      {isRemoteMode && remoteTotalPages > 1 && (
        <div className="notes-pagination">
          <div className="pagination-summary">
            Showing {remoteRangeStart}-{remoteRangeEnd} of {remoteTotal ?? 0}
          </div>
          <div className="pagination-actions">
            <button
              className="btn-page"
              disabled={remotePage <= 1 || remoteLoading}
              onClick={() => setRemotePage((prev) => Math.max(1, prev - 1))}
            >
              ← Prev
            </button>
            <span className="page-indicator">Page {remotePage} / {remoteTotalPages}</span>
            <button
              className="btn-page"
              disabled={remotePage >= remoteTotalPages || remoteLoading}
              onClick={() => setRemotePage((prev) => Math.min(remoteTotalPages, prev + 1))}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

