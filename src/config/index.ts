/**
 * Application configuration
 * Centralized constants to avoid magic strings and scattered environment variables
 */

// ============================================================================
// Application Constants
// ============================================================================

export const APP = {
  name: 'DevNotes',
  version: '1.0.0',
} as const;

// ============================================================================
// GitHub API Constants
// ============================================================================

export const GITHUB_API = {
  BASE_URL: 'https://api.github.com',
  USER_ENDPOINT: 'https://api.github.com/user',
  OAUTH_AUTHORIZE_URL: 'https://github.com/login/oauth/authorize',
  SCOPE: 'public_repo',
  ACCEPT_HEADER: 'application/vnd.github+json',
} as const;

// ============================================================================
// Permission Levels
// ============================================================================

export const WRITE_PERMISSIONS = ['admin', 'maintain', 'write'] as const;

// ============================================================================
// Storage Keys
// ============================================================================

export const STORAGE_KEYS = {
  SESSION_TOKEN: 'devnotes_gh_token',
  OAUTH_STATE: 'oauth_state',
} as const;

// ============================================================================
// API Endpoints (Worker)
// ============================================================================

export const API_ENDPOINTS = {
  OAUTH_TOKEN: '/oauth/token',
  NOTES_META: '/notes/meta',
  NOTES_SYNC: '/notes/sync',
  NOTES_CREATE: '/notes/create',
  NOTES_UPDATE: '/notes/update',
  NOTES_DELETE: '/notes/delete',
  NOTES_BULK: '/notes/bulk',
  NOTES_GET: (id: string) => `/notes/${id}`,
  TAGS_POPULAR: '/notes/tags/popular',
} as const;

// ============================================================================
// Environment-based Configuration
// ============================================================================

/**
 * Default repository configuration
 */
const DEFAULT_REPO = {
  owner: 'manikantatarun',
  name: 'devnotes-data',
  branch: 'main',
} as const;

/**
 * Default configuration values
 * Used when environment variables are not set
 */
const DEFAULT_CONFIG = {
  workerUrl: 'https://devnotes.manikanta-tarun.workers.dev',
  githubClientId: 'Iv23lim4G6FNdDuTf6o6',
  appBaseUrl: 'https://devnotes.manikantatarun.online',
} as const;

/**
 * GitHub integration configuration
 * Loads from environment variables with fallback defaults
 */
export const GITHUB_CONFIG = {
  clientId: import.meta.env.VITE_GITHUB_CLIENT_ID ?? DEFAULT_CONFIG.githubClientId,
  workerUrl: import.meta.env.VITE_OAUTH_WORKER_URL ?? DEFAULT_CONFIG.workerUrl,
  oauthRedirectUri: import.meta.env.VITE_GITHUB_REDIRECT_URI?.trim() || null,
  dataRepoOwner: import.meta.env.VITE_DATA_REPO_OWNER ?? DEFAULT_REPO.owner,
  dataRepoName: import.meta.env.VITE_DATA_REPO_NAME ?? DEFAULT_REPO.name,
  dataRepoBranch: import.meta.env.VITE_DATA_REPO_BRANCH ?? DEFAULT_REPO.branch,
  
  // Prefer explicit env, then current origin for custom domains, then fallback
  get appBaseUrl() {
    if (import.meta.env.VITE_APP_BASE_URL) return import.meta.env.VITE_APP_BASE_URL;
    if (typeof window !== 'undefined') return window.location.origin;
    return DEFAULT_CONFIG.appBaseUrl;
  },
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build full URL for worker API endpoint
 */
export function getWorkerUrl(endpoint: string): string {
  if (!GITHUB_CONFIG.workerUrl) {
    throw new Error('Worker URL not configured');
  }
  return `${GITHUB_CONFIG.workerUrl}${endpoint}`;
}

/**
 * Build GitHub repository URL
 */
export function getRepoUrl(): string {
  return `${GITHUB_API.BASE_URL}/repos/${GITHUB_CONFIG.dataRepoOwner}/${GITHUB_CONFIG.dataRepoName}`;
}

/**
 * Build GitHub collaborator permission URL
 */
export function getCollaboratorPermissionUrl(username: string): string {
  return `${getRepoUrl()}/collaborators/${username}/permission`;
}

/**
 * Build OAuth authorization URL
 */
export function getOAuthAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CONFIG.clientId,
    scope: GITHUB_API.SCOPE,
    state,
  });

  // Only send redirect_uri when explicitly configured to match OAuth app settings.
  if (GITHUB_CONFIG.oauthRedirectUri) {
    params.set('redirect_uri', GITHUB_CONFIG.oauthRedirectUri);
  }

  return `${GITHUB_API.OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Check if a permission level grants write access
 */
export function hasWritePermission(permission: string): boolean {
  return (WRITE_PERMISSIONS as readonly string[]).includes(permission);
}

/**
 * Check if worker is configured
 */
export function isWorkerConfigured(): boolean {
  return Boolean(GITHUB_CONFIG.workerUrl);
}

// ============================================================================
// Legacy Exports (for backward compatibility)
// ============================================================================

/**
 * @deprecated Use APP instead
 */
export const config = {
  app: APP,
} as const;
