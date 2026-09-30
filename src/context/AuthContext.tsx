import { useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  GITHUB_CONFIG,
  GITHUB_API,
  STORAGE_KEYS,
  API_ENDPOINTS,
  getCollaboratorPermissionUrl,
  getOAuthAuthorizeUrl,
  getWorkerUrl,
  hasWritePermission,
} from '../config';
import { GitHubStorageService } from '../services/storage/GitHubStorageService';
import type { IStorageService } from '../services/storage/IStorageService';
import { AuthContext } from './auth-context';

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

export interface AuthContextValue extends AuthState {
  login: () => void;
  logout: () => void;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function saveToken(token: string) {
  sessionStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, token);
}

function loadToken(): string | null {
  return sessionStorage.getItem(STORAGE_KEYS.SESSION_TOKEN);
}

function clearToken() {
  sessionStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
}

// ── GitHub API helpers ────────────────────────────────────────────────────────

async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  const res = await fetch(GITHUB_API.USER_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: GITHUB_API.ACCEPT_HEADER,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch GitHub user');
  return res.json();
}

async function checkWriteAccess(token: string, user: GitHubUser): Promise<boolean> {
  const res = await fetch(getCollaboratorPermissionUrl(user.login), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: GITHUB_API.ACCEPT_HEADER,
    },
  });
  if (res.status === 403 || res.status === 404) return false;
  const data = await res.json();
  const permission: string = data.role_name ?? data.permission ?? '';
  return hasWritePermission(permission);
}

function buildStorageService(token?: string): IStorageService {
  return new GitHubStorageService({
    owner: GITHUB_CONFIG.dataRepoOwner,
    repo: GITHUB_CONFIG.dataRepoName,
    branch: GITHUB_CONFIG.dataRepoBranch,
    token,
    workerUrl: GITHUB_CONFIG.workerUrl,
  });
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

  const setUnauthenticated = useCallback(() => {
    setState({
      user: null,
      token: null,
      hasWriteAccess: false,
      loading: false,
      storageService: buildStorageService(),
    });
  }, []);

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
    } catch (err) {
      console.error('[Auth] Failed to resolve token:', err);
      clearToken();
      setUnauthenticated();
    }
  }, [setUnauthenticated]);

  const initializeAuth = useCallback(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const oauthState = urlParams.get('state');
    const savedState = sessionStorage.getItem(STORAGE_KEYS.OAUTH_STATE);

    if (code && oauthState && oauthState === savedState) {
      sessionStorage.removeItem(STORAGE_KEYS.OAUTH_STATE);
      window.history.replaceState({}, '', window.location.pathname);

      try {
        const res = await fetch(getWorkerUrl(API_ENDPOINTS.OAUTH_TOKEN), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        const data: { access_token?: string; error?: string } = await res.json();
        if (!res.ok || !data.access_token) {
          throw new Error(data.error ?? 'Token exchange failed');
        }

        saveToken(data.access_token);
        await resolveToken(data.access_token);
        return;
      } catch (err) {
        console.error('[Auth] Token exchange failed:', err);
        setState((prev) => ({ ...prev, loading: false }));
        return;
      }
    }

    const existingToken = loadToken();
    if (existingToken) {
      await resolveToken(existingToken);
      return;
    }

    setState((prev) => ({ ...prev, loading: false }));
  }, [resolveToken]);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  const login = useCallback(() => {
    const oauthState = crypto.randomUUID();
    sessionStorage.setItem(STORAGE_KEYS.OAUTH_STATE, oauthState);
    window.location.href = getOAuthAuthorizeUrl(oauthState);
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
