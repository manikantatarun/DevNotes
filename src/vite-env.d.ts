/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITHUB_CLIENT_ID: string;
  readonly VITE_OAUTH_WORKER_URL: string;
  readonly VITE_DATA_REPO_OWNER: string;
  readonly VITE_DATA_REPO_NAME: string;
  readonly VITE_DATA_REPO_BRANCH: string;
  readonly VITE_APP_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
