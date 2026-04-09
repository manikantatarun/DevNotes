/**
 * Worker Configuration
 * Extracts environment variables into typed constants
 */

// Cache keys
export const CACHE_KEYS = {
  GITHUB_APP_TOKEN: 'github:app:token',
  D1_QUERY_PREFIX: 'd1:query:',
};

// Cache TTL (seconds)
export const CACHE_TTL = {
  GITHUB_APP_TOKEN: 3600,  // 1 hour (max)
  D1_QUERY: 60,            // 1 minute
};

// Pagination defaults
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 100,
};

// GitHub API
export const GITHUB = {
  API_BASE: 'https://api.github.com',
  API_VERSION: '2022-11-28',
  USER_AGENT: 'devnotes-worker',
  OAUTH_URL: 'https://github.com/login/oauth/access_token',
};

// Permissions that grant write access
export const WRITE_PERMISSIONS = ['admin', 'maintain', 'write'];

// Default repository configuration
export const DEFAULT_REPO = {
  owner: 'manikantatarun',
  name: 'devnotes-data',
  branch: 'main',
};

/**
 * Get repository configuration from environment
 * @param {Object} env - Worker environment bindings
 * @returns {Object} Repository configuration
 */
export function getRepoConfig(env) {
  return {
    owner: env.DATA_REPO_OWNER || DEFAULT_REPO.owner,
    repo: env.DATA_REPO_NAME || DEFAULT_REPO.name,
    branch: env.DATA_REPO_BRANCH || DEFAULT_REPO.branch,
  };
}

/**
 * Get CORS origin from environment
 * @param {Object} env - Worker environment bindings
 * @returns {string} CORS origin
 */
export function getAllowedOrigin(env) {
  return env.ALLOWED_ORIGIN || '*';
}

/**
 * Get GitHub OAuth credentials from environment
 * @param {Object} env - Worker environment bindings
 * @returns {Object} OAuth credentials
 */
export function getOAuthConfig(env) {
  return {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
  };
}

/**
 * Get GitHub App configuration from environment
 * @param {Object} env - Worker environment bindings
 * @returns {Object} GitHub App configuration
 */
export function getGitHubAppConfig(env) {
  return {
    appId: env.GITHUB_APP_ID,
    privateKey: env.GITHUB_APP_PRIVATE_KEY,
    installationId: env.GITHUB_APP_INSTALLATION_ID,
  };
}

/**
 * Build jsDelivr CDN URL for a file
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} branch - Branch name
 * @param {string} path - File path
 * @returns {string} CDN URL
 */
export function getCDNUrl(owner, repo, branch, path) {
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
}
