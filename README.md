# DevNotes

A modern note-taking app for developers to store code snippets and technical notes.

## 🚀 Features

- Create, edit, and organize coding notes
- Folder organization
- Syntax highlighting for multiple languages
- Tag-based categorization
- Local storage with easy backend migration

## 📁 Project Structure

```
src/
├── types/              # TypeScript interfaces and types
├── services/           # Business logic and storage abstraction
│   └── storage/        # Storage implementations (localStorage, Firebase, etc.)
├── hooks/              # Custom React hooks
├── components/         # React components
├── utils/              # Utility functions
├── config/             # Configuration files
└── constants/          # Application constants
```

## 🔧 Architecture

### Storage Abstraction Layer

The app uses a **storage abstraction pattern** that allows you to switch between different storage backends without changing your application code:

- **Current**: LocalStorage (browser-based)
- **Future options**: Firebase, Supabase, MongoDB Atlas, PocketBase

To switch storage backends, simply implement `IStorageService` interface and update the factory in `src/services/storage/index.ts`.

### Usage Example

```typescript
import { useNotes } from './hooks/useNotes';

function MyComponent() {
  const { notes, createNote, updateNote, deleteNote } = useNotes();
  
  // Your component logic - storage abstraction handles everything!
}
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Deploy to GitHub Pages
npm run deploy
```

## 📦 Deployment

Deployed to GitHub Pages: `https://manikantatarun.github.io/DevNotes/`

## 🔄 Migrating Storage Backends

1. Create a new class implementing `IStorageService` (see `LocalStorageService.ts`)
2. Update `src/services/storage/index.ts` to use your new implementation
3. No changes needed in components or hooks!

## 📝 License

MIT
```
