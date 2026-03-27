import { useNotes } from '../../hooks/useNotes';
import { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { NoteForm } from './NoteForm';
import { NoteCard } from './NoteCard';
import { NoteViewer } from './NoteViewer';
import type { Note, NoteType, Category } from '../../types';
import { NOTE_TYPES, CATEGORIES } from '../../constants';
import './NotesList.css';

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

  if (loading) return <div className="notes-container">Loading notes...</div>;
  if (error) return <div className="notes-container error">Error: {error}</div>;
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
          <h2>📚 My Notes ({filteredNotes.length}{isFiltered ? ` / ${notes.length}` : ''})</h2>
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
                }}
              >
                ✕ Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {filteredNotes.length === 0 ? (
        <div className="empty-state">
          <p>
            📝 No notes found.{' '}
            {isFiltered ? 'Try adjusting your filters.' : 'Create your first note!'}
          </p>
        </div>
      ) : (
        <div className="notes-grid">
          {filteredNotes.map((note) => (
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
    </div>
  );
}

