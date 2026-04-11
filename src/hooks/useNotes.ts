import { useState, useEffect, useCallback } from 'react';
import type { Note } from '../types';
import type { IStorageService } from '../services/storage/IStorageService';
import { storageService as defaultStorage } from '../services/storage';

/**
 * Custom hook for managing notes.
 * Accepts an optional storage service so the caller can swap in any backend
 * (e.g. GitHubStorageService when the user is authenticated).
 */
export function useNotes(storage: IStorageService = defaultStorage) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await storage.getNotes();
      setNotes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [storage]);

  // Reload whenever the storage backend changes (e.g. user logs in/out)
  // Use AbortController to prevent duplicate concurrent requests
  useEffect(() => {
    const controller = new AbortController();
    loadNotes();
    return () => controller.abort();
  }, [loadNotes]);

  const createNote = useCallback(async (noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newNote = await storage.createNote(noteData);
      setNotes(prev => [...prev, newNote]);
      return newNote;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create note');
      throw err;
    }
  }, [storage]);

  const getNote = useCallback(async (id: string) => {
    try {
      return await storage.getNote(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load note');
      throw err;
    }
  }, [storage]);

  const updateNote = useCallback(async (id: string, updates: Partial<Note>) => {
    try {
      const updatedNote = await storage.updateNote(id, updates);
      setNotes(prev => prev.map(note => note.id === id ? updatedNote : note));
      return updatedNote;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update note');
      throw err;
    }
  }, [storage]);

  const deleteNote = useCallback(async (id: string) => {
    try {
      await storage.deleteNote(id);
      setNotes(prev => prev.filter(note => note.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note');
      throw err;
    }
  }, [storage]);

  return {
    notes,
    loading,
    error,
    getNote,
    createNote,
    updateNote,
    deleteNote,
    refresh: loadNotes,
  };
}
