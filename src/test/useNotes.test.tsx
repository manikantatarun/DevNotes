import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useNotes } from '../hooks/useNotes';
import type { IStorageService } from '../services/storage/IStorageService';
import type { Note } from '../types';

function createNote(id: string, title = 'Test note'): Note {
  return {
    id,
    title,
    type: 'qa',
    category: 'general',
    tags: ['tag'],
    question: 'What is this?',
    answer: 'A test note',
    createdAt: 100,
    updatedAt: 100,
  };
}

function createStorage(overrides: Partial<IStorageService> = {}): IStorageService {
  return {
    getNotes: vi.fn().mockResolvedValue([]),
    getNote: vi.fn().mockResolvedValue(null),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    uploadImage: vi.fn(),
    getFolders: vi.fn().mockResolvedValue([]),
    getFolder: vi.fn().mockResolvedValue(null),
    createFolder: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
    clear: vi.fn(),
    ...overrides,
  };
}

describe('useNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads notes on mount', async () => {
    const notes = [createNote('n1')];
    const storage = createStorage({
      getNotes: vi.fn().mockResolvedValue(notes),
    });

    const { result } = renderHook(() => useNotes(storage));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.notes).toEqual(notes);
    expect(result.current.error).toBeNull();
  });

  it('sets error when initial load fails', async () => {
    const storage = createStorage({
      getNotes: vi.fn().mockRejectedValue(new Error('load failed')),
    });

    const { result } = renderHook(() => useNotes(storage));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.notes).toEqual([]);
    expect(result.current.error).toBe('load failed');
  });

  it('creates a note and appends it to local state', async () => {
    const created = createNote('new-1', 'Created');
    const storage = createStorage({
      createNote: vi.fn().mockResolvedValue(created),
    });

    const { result } = renderHook(() => useNotes(storage));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createNote({
        title: 'Created',
        type: 'qa',
        category: 'general',
        tags: [],
        question: 'Q',
        answer: 'A',
      });
    });

    expect(result.current.notes).toEqual([created]);
  });

  it('updates note in state by id', async () => {
    const base = createNote('n1', 'Before');
    const updated = { ...base, title: 'After', updatedAt: 200 };
    const storage = createStorage({
      getNotes: vi.fn().mockResolvedValue([base]),
      updateNote: vi.fn().mockResolvedValue(updated),
    });

    const { result } = renderHook(() => useNotes(storage));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateNote('n1', { title: 'After' });
    });

    expect(result.current.notes).toEqual([updated]);
  });

  it('deletes note from state by id', async () => {
    const n1 = createNote('n1', 'A');
    const n2 = createNote('n2', 'B');
    const storage = createStorage({
      getNotes: vi.fn().mockResolvedValue([n1, n2]),
    });

    const { result } = renderHook(() => useNotes(storage));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteNote('n1');
    });

    expect(result.current.notes).toEqual([n2]);
  });

  it('propagates getNote errors through hook error state', async () => {
    const storage = createStorage({
      getNote: vi.fn().mockRejectedValue(new Error('note failed')),
    });

    const { result } = renderHook(() => useNotes(storage));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.getNote('n1')).rejects.toThrow('note failed');
    });

    await waitFor(() => {
      expect(result.current.error).toBe('note failed');
    });
  });

  it('refresh reloads notes with latest data', async () => {
    const getNotes = vi
      .fn()
      .mockResolvedValueOnce([createNote('n1', 'Old')])
      .mockResolvedValueOnce([createNote('n2', 'New')]);

    const storage = createStorage({ getNotes });
    const { result } = renderHook(() => useNotes(storage));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notes[0]?.title).toBe('Old');

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.notes[0]?.title).toBe('New');
    expect(getNotes).toHaveBeenCalledTimes(2);
  });
});
