import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getNoteMock = vi.fn();
const refreshMock = vi.fn();
const stableNotes: never[] = [];

vi.mock('../hooks/useNotes', () => ({
  useNotes: () => ({
    notes: stableNotes,
    loading: false,
    error: null,
    getNote: getNoteMock,
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    refresh: refreshMock,
  }),
}));

vi.mock('../context/useAuth', () => ({
  useAuth: () => ({
    storageService: {},
    hasWriteAccess: false,
    token: null,
    loading: false,
  }),
}));

vi.mock('../components/features/NoteViewer', () => ({
  NoteViewer: ({ note }: { note: { title: string } }) => <div>{note.title}</div>,
}));

vi.mock('../components/features/NoteForm', () => ({
  NoteForm: () => <div>Note form</div>,
}));

vi.mock('../components/features/NoteCard', () => ({
  NoteCard: () => <div>Note card</div>,
}));

vi.mock('../components/features/FilterBar', () => ({
  FilterBar: () => <div>Filter bar</div>,
}));

vi.mock('../components/features/BulkImport', () => ({
  BulkImport: () => <div>Bulk import</div>,
}));

import { NotesList } from '../components/features/NotesList';

describe('NotesList route loading', () => {
  beforeEach(() => {
    getNoteMock.mockReset();
    refreshMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears the loading state when a note loads from the URL', async () => {
    getNoteMock.mockResolvedValue({
      id: 'n1',
      title: 'Resolved note',
      type: 'qa',
      category: 'general',
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      question: 'What is this?',
    });

    render(
      <MemoryRouter initialEntries={['/note/n1']}>
        <Routes>
          <Route path="/note/:noteId" element={<NotesList />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading notes...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Resolved note')).toBeInTheDocument();
    });

    expect(screen.queryByText('Loading notes...')).not.toBeInTheDocument();
  });

  it('shows a friendly error with retry action when URL note loading fails', async () => {
    getNoteMock.mockRejectedValue(new Error('Network unavailable'));

    render(
      <MemoryRouter initialEntries={['/note/failing-note']}>
        <Routes>
          <Route path="/note/:noteId" element={<NotesList />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /open this note/i })).toBeInTheDocument();
    });

    expect(screen.getByText('Network unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('retries URL note loading and recovers after a transient failure', async () => {
    getNoteMock
      .mockRejectedValueOnce(new Error('Temporary issue'))
      .mockResolvedValueOnce({
        id: 'n2',
        title: 'Recovered note',
        type: 'qa',
        category: 'general',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        question: 'Recovered content',
      });

    render(
      <MemoryRouter initialEntries={['/note/n2']}>
        <Routes>
          <Route path="/note/:noteId" element={<NotesList />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /open this note/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByText('Recovered note')).toBeInTheDocument();
    });

    expect(getNoteMock).toHaveBeenCalledTimes(2);
  });
});
