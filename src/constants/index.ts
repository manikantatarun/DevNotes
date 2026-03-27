/**
 * Application constants
 */

export const NOTE_TYPES = [
  { value: 'qa', label: 'Q&A', icon: '💬' },
  { value: 'blog', label: 'Blog', icon: '📝' },
] as const;

export const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'coding', label: 'Coding' },
  { value: 'system-design', label: 'System Design' },
  { value: 'algorithms', label: 'Algorithms' },
  { value: 'frontend', label: 'Frontend' },
  { value: 'backend', label: 'Backend' },
  { value: 'database', label: 'Database' },
  { value: 'devops', label: 'DevOps' },
  { value: 'other', label: 'Other' },
] as const;

export const PROGRAMMING_LANGUAGES = [
  'javascript',
  'python',
  'java',
  'react',
  'html',
  'css',
  'sql',
  'bash',
  'cpp',
  'typescript',
  'csharp',
  'go',
  'rust',
  'php',
  'ruby',
  'swift',
  'kotlin',
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
