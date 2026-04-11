/**
 * Application constants
 */

export const NOTE_TYPES = [
  { value: 'qa', label: 'Q&A', icon: '💬' },
  { value: 'coding', label: 'Coding', icon: '💻' },
  { value: 'blog', label: 'Blog', icon: '📝' },
] as const;

export const CATEGORIES = [
  { value: 'algorithms', label: 'Algorithms' },
  { value: 'data-structures', label: 'Data Structures' },
  { value: 'system-design', label: 'System Design' },
  { value: 'devops', label: 'DevOps' },
  { value: 'frontend', label: 'Frontend' },
  { value: 'backend', label: 'Backend' },
  { value: 'database', label: 'Database' },
  { value: 'web', label: 'Web Development' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'general', label: 'General' },
] as const;

export const PROGRAMMING_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'java',
  'cpp',
  'csharp',
  'go',
  'rust',
  'php',
  'ruby',
  'swift',
  'kotlin',
  'react',
  'html',
  'css',
  'sql',
  'bash',
  'yaml',
  'json',
  'groovy',
  'markdown',
  'text',
] as const;

export const DEFAULT_TAGS = [
  'algorithm',
  'data-structure',
  'design-pattern',
  'bug-fix',
  'optimization',
  'tutorial',
  'reference',
  'snippet',
  'interview',
  'leetcode',
  'architecture',
  'scalability',
  'performance',
] as const;

export const STORAGE_LIMITS = {
  localStorage: 5 * 1024 * 1024, // 5MB
  indexedDB: 50 * 1024 * 1024, // 50MB estimate
} as const;
