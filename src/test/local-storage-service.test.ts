import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageService } from '../services/storage/LocalStorageService';

function createImageFile(name = 'image.png', type = 'image/png'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe('LocalStorageService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates and retrieves a note', async () => {
    const service = new LocalStorageService();

    const created = await service.createNote({
      title: 'Local note',
      type: 'qa',
      category: 'general',
      tags: ['local'],
      question: 'Q',
      answer: 'A',
    });

    const notes = await service.getNotes();
    const fetched = await service.getNote(created.id);

    expect(notes).toHaveLength(1);
    expect(fetched?.title).toBe('Local note');
  });

  it('updates and deletes a note', async () => {
    const service = new LocalStorageService();

    const created = await service.createNote({
      title: 'Before',
      type: 'qa',
      category: 'general',
      tags: [],
      question: 'Q',
      answer: 'A',
    });

    const updated = await service.updateNote(created.id, { title: 'After' });
    expect(updated.title).toBe('After');

    await service.deleteNote(created.id);
    const notes = await service.getNotes();
    expect(notes).toHaveLength(0);
  });

  it('throws on update when note does not exist', async () => {
    const service = new LocalStorageService();
    await expect(service.updateNote('missing', { title: 'X' })).rejects.toThrow('not found');
  });

  it('rejects non-image upload', async () => {
    const service = new LocalStorageService();
    const invalid = new File(['text'], 'note.txt', { type: 'text/plain' });

    await expect(service.uploadImage(invalid)).rejects.toThrow('Please select a valid image file');
  });

  it('returns data URL for image upload', async () => {
    const service = new LocalStorageService();
    const image = createImageFile();

    const result = await service.uploadImage(image);
    expect(result.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('clear removes stored notes and folders', async () => {
    const service = new LocalStorageService();

    await service.createNote({
      title: 'Clear me',
      type: 'qa',
      category: 'general',
      tags: [],
      question: 'Q',
      answer: 'A',
    });

    await service.createFolder({ name: 'Folder A', parentId: undefined });
    await service.clear();

    expect(await service.getNotes()).toEqual([]);
    expect(await service.getFolders()).toEqual([]);
  });

  it('handles storage read failures gracefully', async () => {
    const service = new LocalStorageService();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const notes = await service.getNotes();
    expect(notes).toEqual([]);

    getItemSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('throws when write fails', async () => {
    const service = new LocalStorageService();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    await expect(
      service.createNote({
        title: 'quota',
        type: 'qa',
        category: 'general',
        tags: [],
        question: 'Q',
        answer: 'A',
      }),
    ).rejects.toThrow('Storage quota exceeded or localStorage unavailable');

    setItemSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
