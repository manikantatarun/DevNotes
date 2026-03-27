# Storage Abstraction Guide

## Overview

The storage abstraction layer allows you to switch between different storage backends (localStorage, Firebase, Supabase, etc.) without changing any component code.

## How It Works

1. **Interface**: `IStorageService` defines the contract
2. **Implementations**: Each storage backend implements this interface
3. **Factory**: `index.ts` exports the active implementation
4. **Hooks**: Components use hooks that internally use `storageService`

## Current Implementation

✅ **LocalStorageService** - Browser localStorage

## Adding a New Storage Backend

### Step 1: Create Implementation

Create a new file like `FirebaseStorageService.ts`:

```typescript
import { IStorageService } from './IStorageService';
import { Note, Folder } from '../../types';
// Import Firebase SDK
import { getFirestore, collection, doc, getDocs, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';

export class FirebaseStorageService implements IStorageService {
  private db = getFirestore();

  async getNotes(): Promise<Note[]> {
    const snapshot = await getDocs(collection(this.db, 'notes'));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Note));
  }

  async createNote(noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note> {
    const now = Date.now();
    const newNote = {
      ...noteData,
      createdAt: now,
      updatedAt: now,
    };
    const docRef = await addDoc(collection(this.db, 'notes'), newNote);
    return { ...newNote, id: docRef.id };
  }

  // ... implement other methods
}
```

### Step 2: Update Factory

In `index.ts`, switch the implementation:

```typescript
// OLD
export const storageService: IStorageService = new LocalStorageService();

// NEW
export const storageService: IStorageService = new FirebaseStorageService();
```

### Step 3: That's It!

No changes needed in:
- Components
- Hooks
- Types
- Any other code

## Example Backends

### Firebase

```bash
npm install firebase
```

Create `FirebaseStorageService.ts` implementing `IStorageService`

### Supabase

```bash
npm install @supabase/supabase-js
```

Create `SupabaseStorageService.ts` implementing `IStorageService`

### MongoDB Atlas (via API)

```bash
npm install mongodb
```

Create `MongoStorageService.ts` implementing `IStorageService`

### PocketBase

```bash
npm install pocketbase
```

Create `PocketBaseStorageService.ts` implementing `IStorageService`

## Best Practices

1. **Always implement ALL methods** from `IStorageService`
2. **Handle errors gracefully** - throw meaningful error messages
3. **Test thoroughly** before switching in production
4. **Consider migration** - write scripts to migrate data between backends
5. **Environment variables** - store API keys in `.env` files

## Migration Example

```typescript
// migration.ts
import { LocalStorageService } from './LocalStorageService';
import { FirebaseStorageService } from './FirebaseStorageService';

async function migrateToFirebase() {
  const oldStorage = new LocalStorageService();
  const newStorage = new FirebaseStorageService();
  
  const notes = await oldStorage.getNotes();
  
  for (const note of notes) {
    await newStorage.createNote({
      title: note.title,
      content: note.content,
      language: note.language,
      tags: note.tags,
    });
  }
  
  console.log(`Migrated ${notes.length} notes to Firebase`);
}
```
