/**
 * Application configuration
 * Add your API keys, endpoints, and other config here
 */

export const config = {
  app: {
    name: 'DevNotes',
    version: '1.0.0',
  },
} as const;

/**
 * GitHub integration config
 * Values are loaded from .env.local (copy .env.example to .env.local and fill in)
 */
export const GITHUB_CONFIG = {
  clientId: import.meta.env.VITE_GITHUB_CLIENT_ID ?? '',
  oauthWorkerUrl: import.meta.env.VITE_OAUTH_WORKER_URL ?? '',
  dataRepoOwner: import.meta.env.VITE_DATA_REPO_OWNER ?? 'manikantatarun',
  dataRepoName: import.meta.env.VITE_DATA_REPO_NAME ?? 'devnotes-data',
  dataRepoBranch: import.meta.env.VITE_DATA_REPO_BRANCH ?? 'main',
  // Derives the redirect URI from the current page origin if env is not set
  get appBaseUrl() {
    return import.meta.env.VITE_APP_BASE_URL ?? window.location.origin + window.location.pathname.replace(/\/$/, '');
  },
} as const;
