import { useState, useEffect, useCallback } from 'react';
import type { Folder } from '../types';
import { storageService } from '../services/storage';

/**
 * Custom hook for managing folders
 * Abstracts all storage operations from components
 */
export function useFolders() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await storageService.getFolders();
      setFolders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load folders');
    } finally {
      setLoading(false);
    }
  }, []);

  const createFolder = useCallback(async (folderData: Omit<Folder, 'id' | 'createdAt'>) => {
    try {
      const newFolder = await storageService.createFolder(folderData);
      setFolders(prev => [...prev, newFolder]);
      return newFolder;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
      throw err;
    }
  }, []);

  const updateFolder = useCallback(async (id: string, updates: Partial<Folder>) => {
    try {
      const updatedFolder = await storageService.updateFolder(id, updates);
      setFolders(prev => prev.map(folder => folder.id === id ? updatedFolder : folder));
      return updatedFolder;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update folder');
      throw err;
    }
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    try {
      await storageService.deleteFolder(id);
      setFolders(prev => prev.filter(folder => folder.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete folder');
      throw err;
    }
  }, []);

  return {
    folders,
    loading,
    error,
    createFolder,
    updateFolder,
    deleteFolder,
    refresh: loadFolders,
  };
}
