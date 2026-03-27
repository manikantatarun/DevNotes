import type { Note, Folder } from '../../types';

/**
 * Storage Service Interface
 * Implement this interface to create different storage backends
 * (localStorage, Firebase, Supabase, MongoDB, etc.)
 */
export interface IStorageService {
  // Notes operations
  getNotes(): Promise<Note[]>;
  getNote(id: string): Promise<Note | null>;
  createNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note>;
  updateNote(id: string, updates: Partial<Note>): Promise<Note>;
  deleteNote(id: string): Promise<void>;

  // Folders operations
  getFolders(): Promise<Folder[]>;
  getFolder(id: string): Promise<Folder | null>;
  createFolder(folder: Omit<Folder, 'id' | 'createdAt'>): Promise<Folder>;
  updateFolder(id: string, updates: Partial<Folder>): Promise<Folder>;
  deleteFolder(id: string): Promise<void>;

  // Utility
  clear(): Promise<void>;
}
