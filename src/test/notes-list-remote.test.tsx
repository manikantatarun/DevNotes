import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '../types';

const notesFixture: Note[] = [
  {
    id: 'n1',
    title: 'Remote test note',
    type: 'qa',
    category: 'general',
    tags: ['distributed'],
    question: 'Remote fallback?',
    answer: 'yes',
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
    isWorkerConfigured: () => true,
    getWorkerUrl: (endpoint: string) => `https://worker.test${endpoint}`,
  };
});

vi.mock('../components/features/FilterBar', () => ({
  FilterBar: ({ onSearchTermChange }: { onSearchTermChange: (value: string) => void }) => (
    <div>
      <button onClick={() => onSearchTermChange('distributed')}>trigger-filter</button>
    </div>
  ),
}));

vi.mock('../components/features/NoteCard', () => ({
  NoteCard: ({ note }: { note: Note }) => <div>{note.title}</div>,
}));

vi.mock('../components/features/NoteViewer', () => ({
  NoteViewer: ({ note }: { note: Note }) => <div>{note.title}</div>,
}));

vi.mock('../components/features/NoteForm', () => ({
  NoteForm: () => <div>Note form</div>,
}));

vi.mock('../components/features/BulkImport', () => ({
  BulkImport: () => <div>Bulk import</div>,
}));

import { NotesList } from '../components/features/NotesList';

describe('NotesList remote fallback behavior', () => {
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

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/notes/tags/popular')) {
        return new Response(JSON.stringify({ tags: ['distributed'] }), { status: 200 });
      }

      if (url.includes('/notes/meta')) {
        return new Response(JSON.stringify({ error: 'meta down' }), { status: 500 });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });
  });

  it('shows worker fallback message when remote filtered search fails', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<NotesList />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'trigger-filter' }));

    await waitFor(() => {
      expect(screen.getByText(/worker search unavailable/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Remote test note')).toBeInTheDocument();
  });
});
