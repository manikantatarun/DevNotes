// Core data models
export type NoteType = 'qa' | 'coding' | 'blog';
export type Category = 'algorithms' | 'data-structures' | 'system-design' | 'devops' | 'frontend' | 'backend' | 'database' | 'web' | 'mobile' | 'general';

export interface CodingSolution {
  language: string;
  solution: string;
}

export interface Note {
  id: string;
  type: NoteType; // qa, coding, or blog
  category: Category;
  title: string;
  
  // For Q&A type
  question?: string;
  answer?: string;
  
  // For Coding type
  problem?: string;
  solution?: string;
  language?: string; // e.g., 'javascript', 'python', 'java' (used by Q&A and Coding)
  solutions?: CodingSolution[];
  
  // For Blog type
  content?: string; // Markdown content for blogs
  
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string;
  createdAt: number;
}

export interface AppState {
  notes: Note[];
  folders: Folder[];
  currentFolderId?: string;
  selectedType?: NoteType;
  selectedCategory?: Category;
}
