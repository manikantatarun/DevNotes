import type { Note, Folder } from '../../types';
import type { IStorageService } from './IStorageService';

const STORAGE_KEYS = {
  NOTES: 'devnotes_notes',
  FOLDERS: 'devnotes_folders',
} as const;

/**
 * LocalStorage implementation of IStorageService
 * Stores all data in browser's localStorage
 */
export class LocalStorageService implements IStorageService {
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getFromStorage<T>(key: string): T[] {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error(`Error reading from localStorage (${key}):`, error);
      return [];
    }
  }

  private saveToStorage<T>(key: string, data: T[]): void {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error(`Error writing to localStorage (${key}):`, error);
      throw new Error('Storage quota exceeded or localStorage unavailable');
    }
  }

  // Notes operations
  async getNotes(): Promise<Note[]> {
    return this.getFromStorage<Note>(STORAGE_KEYS.NOTES);
  }

  async getNote(id: string): Promise<Note | null> {
    const notes = await this.getNotes();
    return notes.find(note => note.id === id) || null;
  }

  async createNote(noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note> {
    const notes = await this.getNotes();
    const now = Date.now();
    const newNote: Note = {
      ...noteData,
      id: this.generateId(),
      createdAt: now,
      updatedAt: now,
    };
    notes.push(newNote);
    this.saveToStorage(STORAGE_KEYS.NOTES, notes);
    return newNote;
  }

  async updateNote(id: string, updates: Partial<Note>): Promise<Note> {
    const notes = await this.getNotes();
    const index = notes.findIndex(note => note.id === id);
    
    if (index === -1) {
      throw new Error(`Note with id ${id} not found`);
    }

    const updatedNote: Note = {
      ...notes[index],
      ...updates,
      id: notes[index].id, // Prevent id change
      createdAt: notes[index].createdAt, // Prevent createdAt change
      updatedAt: Date.now(),
    };

    notes[index] = updatedNote;
    this.saveToStorage(STORAGE_KEYS.NOTES, notes);
    return updatedNote;
  }

  async deleteNote(id: string): Promise<void> {
    const notes = await this.getNotes();
    const filtered = notes.filter(note => note.id !== id);
    this.saveToStorage(STORAGE_KEYS.NOTES, filtered);
  }

  // Folders operations
  async getFolders(): Promise<Folder[]> {
    return this.getFromStorage<Folder>(STORAGE_KEYS.FOLDERS);
  }

  async getFolder(id: string): Promise<Folder | null> {
    const folders = await this.getFolders();
    return folders.find(folder => folder.id === id) || null;
  }

  async createFolder(folderData: Omit<Folder, 'id' | 'createdAt'>): Promise<Folder> {
    const folders = await this.getFolders();
    const newFolder: Folder = {
      ...folderData,
      id: this.generateId(),
      createdAt: Date.now(),
    };
    folders.push(newFolder);
    this.saveToStorage(STORAGE_KEYS.FOLDERS, folders);
    return newFolder;
  }

  async updateFolder(id: string, updates: Partial<Folder>): Promise<Folder> {
    const folders = await this.getFolders();
    const index = folders.findIndex(folder => folder.id === id);
    
    if (index === -1) {
      throw new Error(`Folder with id ${id} not found`);
    }

    const updatedFolder: Folder = {
      ...folders[index],
      ...updates,
      id: folders[index].id,
      createdAt: folders[index].createdAt,
    };

    folders[index] = updatedFolder;
    this.saveToStorage(STORAGE_KEYS.FOLDERS, folders);
    return updatedFolder;
  }

  async deleteFolder(id: string): Promise<void> {
    const folders = await this.getFolders();
    const filtered = folders.filter(folder => folder.id !== id);
    this.saveToStorage(STORAGE_KEYS.FOLDERS, filtered);
  }

  async clear(): Promise<void> {
    localStorage.removeItem(STORAGE_KEYS.NOTES);
    localStorage.removeItem(STORAGE_KEYS.FOLDERS);
  }
}
