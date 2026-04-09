import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useNotes } from '../../hooks/useNotes';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { NoteForm } from './NoteForm';
import { NoteCard } from './NoteCard';
import { NoteViewer } from './NoteViewer';
import { FilterBar } from './FilterBar';
import type { Note, NoteType, Category } from '../../types';
import { NOTE_TYPES, CATEGORIES } from '../../constants';
import { API_ENDPOINTS, getWorkerUrl, isWorkerConfigured } from '../../config';
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

type NoteInput = Omit<Note, 'id' | 'createdAt' | 'updatedAt'>;

export function NotesList() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { storageService, hasWriteAccess } = useAuth();
  const { notes, loading, error, getNote, createNote, updateNote, deleteNote, refresh } = useNotes(storageService);
  const [showForm, setShowForm] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [viewerNavDirection, setViewerNavDirection] = useState<'prev' | 'next' | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [filterType, setFilterType] = useState<NoteType | 'all'>('all');
  const [filterCategories, setFilterCategories] = useState<Category[]>([]);
  const [filterLanguages, setFilterLanguages] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [remoteNotes, setRemoteNotes] = useState<Note[] | null>(null);
  const [remoteTotal, setRemoteTotal] = useState<number | null>(null);
  const [remotePage, setRemotePage] = useState(1);
  const [remotePageSize, setRemotePageSize] = useState(24);
  const [remoteTotalPages, setRemoteTotalPages] = useState(1);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const workerConfigured = isWorkerConfigured();

  // Initialize filter from path (/qa, /coding, /blog)
  useEffect(() => {
    const path = location.pathname.split('/').pop();
    if (path === 'qa' || path === 'coding' || path === 'blog') {
      setFilterType(path);
    }
  }, [location.pathname]);

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

  // Get all used tags
  const allUsedTags = useMemo(() => {
    return [...new Set(notes.flatMap((n) => n.tags))];
  }, [notes]);

  // Fetch popular tags from backend (cached with 5min TTL)
  const [popularTags, setPopularTags] = useState<string[]>([]);
  useEffect(() => {
    if (workerConfigured) {
      fetch(getWorkerUrl(API_ENDPOINTS.TAGS_POPULAR))
        .then(res => res.json())
        .then(data => setPopularTags(data.tags || []))
        .catch(err => console.warn('Failed to fetch popular tags:', err));
    } else {
      // Fallback: Time-weighted scoring (same algorithm as backend)
      const now = Date.now();
      const DAY_MS = 24 * 60 * 60 * 1000;
      const tagScores = new Map<string, number>();
      
      notes.forEach(note => {
        const ageInDays = (now - note.updatedAt) / DAY_MS;
        // Time decay weights: 7d=5x, 30d=3x, 90d=2x, older=1x
        let weight = 1;
        if (ageInDays <= 7) weight = 5;
        else if (ageInDays <= 30) weight = 3;
        else if (ageInDays <= 90) weight = 2;
        
        note.tags?.forEach(tag => {
          tagScores.set(tag, (tagScores.get(tag) || 0) + weight);
        });
      });
      
      const localPopularTags = Array.from(tagScores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([tag]) => tag);
      setPopularTags(localPopularTags);
    }
  }, [notes, workerConfigured]);

  const handleCreateNote = async (noteData: NoteInput) => {
    try {
      await createNote(noteData);
      setShowForm(false);
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  };

  const handleUpdateNote = async (noteData: NoteInput) => {
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

  const handleSelectNote = async (note: Note, navigationDirection: 'prev' | 'next' | null = null) => {
    setViewerNavDirection(navigationDirection);
    setSelectedNote(note);
    navigate(`/note/${note.id}`, { replace: false });
    try {
      const fullNote = await getNote(note.id);
      if (fullNote) {
        setSelectedNote(fullNote);
      }
    } catch (err) {
      console.error('Failed to load note:', err);
    }
  };

  // Load note from URL parameter
  useEffect(() => {
    if (noteId && !selectedNote) {
      const loadNoteFromUrl = async () => {
        try {
          const note = await getNote(noteId);
          if (note) {
            setSelectedNote(note);
          } else {
            // Note not found, redirect to home
            navigate('/', { replace: true });
          }
        } catch (err) {
          console.error('Failed to load note from URL:', err);
          navigate('/', { replace: true });
        }
      };
      void loadNoteFromUrl();
    }
  }, [noteId, selectedNote, getNote, navigate]);

  const filteredNotes = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();

    return notes.filter((note) => {
      // ── filter by type ────────────────────────────────────────────────────
      if (filterType !== 'all' && note.type !== filterType) return false;

      // ── filter by categories (multi-select) ────────────────────────────────
      if (filterCategories.length > 0 && !filterCategories.includes(note.category)) return false;

      // ── filter by languages (multi-select) ────────────────────────────────
      if (filterLanguages.length > 0) {
        const noteLangs = [
          note.language,
          ...(note.solutions ?? []).map((s) => s.language),
        ].filter(Boolean);
        const hasMatch = filterLanguages.some(lang => noteLangs.includes(lang));
        if (!hasMatch) return false;
      }

      // ── filter by tags (multi-select) ─────────────────────────────────────
      if (filterTags.length > 0) {
        const noteTags = note.tags || [];
        const hasMatch = filterTags.some(tag => noteTags.includes(tag));
        if (!hasMatch) return false;
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
  }, [notes, filterType, filterCategories, filterLanguages, filterTags, searchTerm]);

  const isFiltered =
    searchTerm.trim() !== '' ||
    filterType !== 'all' ||
    filterCategories.length > 0 ||
    filterLanguages.length > 0 ||
    filterTags.length > 0;
  const isRemoteMode = isFiltered && workerConfigured && !remoteError;

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
  }, [searchTerm, filterType, filterCategories, filterLanguages, filterTags]);

  useEffect(() => {
    const onSyncComplete = () => {
      refresh();
    };

    window.addEventListener('devnotes:sync-complete', onSyncComplete);
    return () => {
      window.removeEventListener('devnotes:sync-complete', onSyncComplete);
    };
  }, [refresh]);

  useEffect(() => {
    if (!isFiltered || !workerConfigured) {
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
        // Send multiple categories as repeated params or comma-separated
        filterCategories.forEach(cat => params.append('category', cat));
        filterLanguages.forEach(lang => params.append('language', lang));
        filterTags.forEach(tag => params.append('tag', tag));
        params.set('page', String(remotePage));
        params.set('pageSize', String(remotePageSize));

        const res = await fetch(`${getWorkerUrl(API_ENDPOINTS.NOTES_META)}?${params.toString()}`, {
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
    workerConfigured,
    searchTerm,
    filterType,
    filterCategories,
    filterLanguages,
    filterTags,
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
  const selectedNoteIndex = selectedNote
    ? displayedNotes.findIndex((note) => note.id === selectedNote.id)
    : -1;
  const activeScopeParts: string[] = [];

  if (filterType !== 'all') {
    activeScopeParts.push(`type: ${filterType}`);
  }
  if (filterCategories.length > 0) {
    activeScopeParts.push(`categories: ${filterCategories.join(', ')}`);
  }
  if (filterLanguages.length > 0) {
    activeScopeParts.push(`languages: ${filterLanguages.join(', ')}`);
  }
  if (filterTags.length > 0) {
    activeScopeParts.push(`tags: ${filterTags.join(', ')}`);
  }
  if (searchTerm.trim()) {
    activeScopeParts.push(`search: ${searchTerm.trim()}`);
  }

  const viewerScopeLabel = activeScopeParts.length > 0
    ? `Filtered by ${activeScopeParts.join(' · ')}`
    : 'All notes';

  // Close viewer if selected note doesn't match current filters
  useEffect(() => {
    if (selectedNote && !remoteLoading) {
      const isSelectedNoteInFiltered = displayedNotes.some(note => note.id === selectedNote.id);
      if (!isSelectedNoteInFiltered) {
        setSelectedNote(null);
        navigate('/', { replace: false });
      }
    }
  }, [selectedNote, displayedNotes, remoteLoading, navigate]);

  const handleNavigateSelectedNote = async (direction: 'prev' | 'next') => {
    if (!selectedNote || displayedNotes.length === 0) return;

    const currentIndex = displayedNotes.findIndex((note) => note.id === selectedNote.id);
    if (currentIndex < 0) return;

    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= displayedNotes.length) return;

    await handleSelectNote(displayedNotes[nextIndex], direction);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setFilterType('all');
    setFilterCategories([]);
    setFilterLanguages([]);
    setFilterTags([]);
    setRemotePage(1);
  };

  if (loading) return <div className="notes-container">Loading notes...</div>;
  if (error) return <div className="notes-container error">Error: {error}</div>;

  if (showForm) {
    return (
      <NoteForm
        initialNote={editingNote}
        existingTags={allUsedTags}
        storageService={storageService}
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
        onClose={() => {
          setViewerNavDirection(null);
          setSelectedNote(null);
          navigate('/', { replace: false });
        }}
        onPrevious={() => void handleNavigateSelectedNote('prev')}
        onNext={() => void handleNavigateSelectedNote('next')}
        hasPrevious={selectedNoteIndex > 0}
        hasNext={selectedNoteIndex >= 0 && selectedNoteIndex < displayedNotes.length - 1}
        positionLabel={selectedNoteIndex >= 0 ? `${selectedNoteIndex + 1} / ${displayedNotes.length}` : undefined}
        scopeLabel={viewerScopeLabel}
        navigationDirection={viewerNavDirection}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        filterType={filterType}
        onFilterTypeChange={setFilterType}
        filterCategories={filterCategories}
        onFilterCategoriesChange={setFilterCategories}
        filterLanguages={filterLanguages}
        onFilterLanguagesChange={setFilterLanguages}
        filterTags={filterTags}
        onFilterTagsChange={setFilterTags}
        availableLanguages={availableLanguages}
        availableTags={allUsedTags}
        popularTags={popularTags}
        noteTypeOptions={NOTE_TYPES}
        categoryOptions={CATEGORIES}
        isFiltered={isFiltered}
        onClearFilters={handleClearFilters}
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
          <h2>Notes ({displayedCount}{isFiltered ? ` / ${notes.length}` : ''})</h2>
          {hasWriteAccess && (
            <button className="btn-new-note" onClick={() => setShowForm(true)}>
              ➕ New Note
            </button>
          )}
        </div>

        <FilterBar
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          filterType={filterType}
          onFilterTypeChange={setFilterType}
          filterCategories={filterCategories}
          onFilterCategoriesChange={setFilterCategories}
          filterLanguages={filterLanguages}
          onFilterLanguagesChange={setFilterLanguages}
          availableLanguages={availableLanguages}
          filterTags={filterTags}
          onFilterTagsChange={setFilterTags}
          popularTags={popularTags}
          isFiltered={isFiltered}
          onClearFilters={handleClearFilters}
          remoteLoading={remoteLoading}
          displayedCount={displayedCount}
        />

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
        <div className={`notes-grid ${remoteLoading ? 'loading' : ''}`}>
          {displayedNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              canEdit={hasWriteAccess}
              onDelete={deleteNote}
              onClick={handleSelectNote}
              onTagClick={(tag) => {
                // Toggle tag in filter
                setFilterTags(prev =>
                  prev.includes(tag)
                    ? prev.filter(t => t !== tag)
                    : [...prev, tag]
                );
              }}
            />
          ))}
        </div>
      )}

      {isRemoteMode && remoteTotal !== null && (
        <div className="notes-pagination">
          <div className="pagination-left">
            <div className="pagination-summary">
              Showing {remoteRangeStart}-{remoteRangeEnd} of {remoteTotal ?? 0}
            </div>
            <div className="page-size-control">
              <label htmlFor="page-size">Page size:</label>
              <select
                id="page-size"
                value={remotePageSize}
                onChange={(e) => {
                  setRemotePageSize(Number(e.target.value));
                  setRemotePage(1);
                }}
              >
                <option value={12}>12</option>
                <option value={24}>24</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
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

