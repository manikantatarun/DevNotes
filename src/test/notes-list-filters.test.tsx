import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '../types';

const notesFixture: Note[] = [
  {
    id: 'n1',
    title: 'Binary Search Tree',
    type: 'coding',
    category: 'algorithms',
    language: 'typescript',
    tags: ['tree', 'binary'],
    problem: 'Find node depth',
    solutions: [{ language: 'typescript', solution: 'code' }],
    createdAt: 1,
    updatedAt: 2,
  },
  {
    id: 'n2',
    title: 'Closure Basics',
    type: 'qa',
    category: 'frontend',
    tags: ['javascript'],
    question: 'What is closure?',
    answer: 'A function with lexical environment.',
    createdAt: 1,
    updatedAt: 2,
  },
  {
    id: 'n3',
    title: 'Binary Trees Overview',
    type: 'blog',
    category: 'general',
    tags: ['tree', 'blog'],
    content: 'Binary trees and traversal patterns',
    createdAt: 1,
    updatedAt: 2,
  },
];

const useNotesMock = vi.fn();

vi.mock('../hooks/useNotes', () => ({
  useNotes: (...args: unknown[]) => useNotesMock(...args),
}));

vi.mock('../context/useAuth', () => ({
  useAuth: () => ({
    storageService: {},
    hasWriteAccess: false,
    token: null,
    loading: false,
  }),
}));

vi.mock('../config', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../config');
  return {
    ...actual,
    isWorkerConfigured: () => false,
  };
});

vi.mock('../components/features/FilterBar', () => ({
  FilterBar: ({
    displayedCount,
    onSearchTermChange,
    onFilterTypeChange,
    onClearFilters,
  }: {
    displayedCount: number;
    onSearchTermChange: (value: string) => void;
    onFilterTypeChange: (value: 'all' | 'qa' | 'coding' | 'blog') => void;
    onClearFilters: () => void;
  }) => (
    <div>
      <div data-testid="displayed-count">{displayedCount}</div>
      <button onClick={() => onSearchTermChange('binary tree')}>search-binary-tree</button>
      <button onClick={() => onFilterTypeChange('coding')}>filter-coding</button>
      <button onClick={() => onClearFilters()}>clear-filters</button>
    </div>
  ),
}));

vi.mock('../components/features/NoteCard', () => ({
  NoteCard: ({ note, onClick }: { note: Note; onClick: (note: Note) => void }) => (
    <button data-testid="note-card" onClick={() => onClick(note)}>
      {note.title}
    </button>
  ),
}));

vi.mock('../components/features/NoteViewer', () => ({
  NoteViewer: ({ note, onClose }: { note: Note; onClose: () => void }) => (
    <div>
      <h3>{note.title}</h3>
      <button onClick={onClose}>close-viewer</button>
    </div>
  ),
}));

vi.mock('../components/features/NoteForm', () => ({
  NoteForm: () => <div>Note form</div>,
}));

vi.mock('../components/features/BulkImport', () => ({
  BulkImport: () => <div>Bulk import</div>,
}));

import { NotesList } from '../components/features/NotesList';

describe('NotesList filtering integration', () => {
  beforeEach(() => {
    useNotesMock.mockReset();
    useNotesMock.mockReturnValue({
      notes: notesFixture,
      loading: false,
      error: null,
      getNote: vi.fn().mockResolvedValue(null),
      createNote: vi.fn(),
      updateNote: vi.fn(),
      deleteNote: vi.fn(),
      refresh: vi.fn(),
    });
  });

  it('applies multi-word search and type filters, then resets', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<NotesList />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByTestId('note-card')).toHaveLength(3);
    expect(screen.getByTestId('displayed-count').textContent).toBe('3');

    fireEvent.click(screen.getByRole('button', { name: 'search-binary-tree' }));

    await waitFor(() => {
      expect(screen.getAllByTestId('note-card')).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'filter-coding' }));

    await waitFor(() => {
      expect(screen.getAllByTestId('note-card')).toHaveLength(1);
      expect(screen.getByText('Binary Search Tree')).toBeInTheDocument();
      expect(screen.getByTestId('displayed-count').textContent).toBe('1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'clear-filters' }));

    await waitFor(() => {
      expect(screen.getAllByTestId('note-card')).toHaveLength(3);
      expect(screen.getByTestId('displayed-count').textContent).toBe('3');
    });
  });

  it('keeps viewer navigation stable when selecting and closing a note', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<NotesList />} />
          <Route path="/note/:noteId" element={<NotesList />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Binary Search Tree'));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Binary Search Tree' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'close-viewer' }));

    await waitFor(() => {
      expect(screen.getAllByTestId('note-card')).toHaveLength(3);
    });
  });
});
