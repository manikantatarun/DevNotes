import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { GITHUB_CONFIG } from '../config';
import { GitHubStorageService } from '../services/storage/GitHubStorageService';
import type { IStorageService } from '../services/storage/IStorageService';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
}

interface AuthState {
  user: GitHubUser | null;
  token: string | null;
  hasWriteAccess: boolean;
  loading: boolean;
  storageService: IStorageService;
}

interface AuthContextValue extends AuthState {
  login: () => void;
  logout: () => void;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const SESSION_TOKEN_KEY = 'devnotes_gh_token';

function saveToken(token: string) {
  sessionStorage.setItem(SESSION_TOKEN_KEY, token);
}

function loadToken(): string | null {
  return sessionStorage.getItem(SESSION_TOKEN_KEY);
}

function clearToken() {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

// ── GitHub API helpers ────────────────────────────────────────────────────────

async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) throw new Error('Failed to fetch GitHub user');
  return res.json();
}

async function checkWriteAccess(token: string, user: GitHubUser): Promise<boolean> {
  const { dataRepoOwner, dataRepoName } = GITHUB_CONFIG;
  const res = await fetch(
    `https://api.github.com/repos/${dataRepoOwner}/${dataRepoName}/collaborators/${user.login}/permission`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    }
  );
  if (res.status === 403 || res.status === 404) return false;
  const data = await res.json();
  const permission: string = data.role_name ?? data.permission ?? '';
  return ['admin', 'maintain', 'write'].includes(permission);
}

function buildStorageService(token?: string): IStorageService {
  return new GitHubStorageService({
    owner: GITHUB_CONFIG.dataRepoOwner,
    repo: GITHUB_CONFIG.dataRepoName,
    branch: GITHUB_CONFIG.dataRepoBranch,
    token,
    workerUrl: GITHUB_CONFIG.oauthWorkerUrl,
  });
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    hasWriteAccess: false,
    loading: true,
    storageService: buildStorageService(),
  });

  // ── resolve a token → full auth state ──

  const resolveToken = useCallback(async (token: string) => {
    try {
      const user = await fetchGitHubUser(token);
      const hasWriteAccess = await checkWriteAccess(token, user);
      setState({
        user,
        token,
        hasWriteAccess,
        loading: false,
        storageService: buildStorageService(token),
      });
    } catch {
      clearToken();
      setState({
        user: null,
        token: null,
        hasWriteAccess: false,
        loading: false,
        storageService: buildStorageService(),
      });
    }
  }, []);

  // ── on mount: check for OAuth callback code OR existing session token ──

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const savedState = sessionStorage.getItem('oauth_state');

    if (code && state && state === savedState) {
      // Clean URL first
      sessionStorage.removeItem('oauth_state');
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);

      // Exchange code for token via Cloudflare Worker
      fetch(`${GITHUB_CONFIG.oauthWorkerUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
        .then((res) => res.json())
        .then(async (data: { access_token?: string; error?: string }) => {
          if (!data.access_token) throw new Error(data.error ?? 'No token returned');
          saveToken(data.access_token);
          await resolveToken(data.access_token);
        })
        .catch(() => {
          setState((prev) => ({ ...prev, loading: false }));
        });
      return;
    }

    // Check session storage for existing token
    const existingToken = loadToken();
    if (existingToken) {
      resolveToken(existingToken);
    } else {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [resolveToken]);

  // ── login / logout ──

  const login = useCallback(() => {
    const oauthState = crypto.randomUUID();
    sessionStorage.setItem('oauth_state', oauthState);
    const redirect = encodeURIComponent(GITHUB_CONFIG.appBaseUrl);
    window.location.href =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${GITHUB_CONFIG.clientId}` +
      `&redirect_uri=${redirect}` +
      `&scope=public_repo` +
      `&state=${oauthState}`;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setState({
      user: null,
      token: null,
      hasWriteAccess: false,
      loading: false,
      storageService: buildStorageService(),
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
