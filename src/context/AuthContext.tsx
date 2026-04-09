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

  // ── resolve a token → full auth state ──

  const resolveToken = useCallback(async (token: string) => {
    console.log('[Auth] Resolving token...');
    try {
      const user = await fetchGitHubUser(token);
      console.log('[Auth] User fetched:', user.login);
      const hasWriteAccess = await checkWriteAccess(token, user);
      console.log('[Auth] Write access:', hasWriteAccess);
      setState({
        user,
        token,
        hasWriteAccess,
        loading: false,
        storageService: buildStorageService(token),
      });
      console.log('[Auth] Auth state updated successfully');
    } catch (err) {
      console.error('[Auth] Failed to resolve token:', err);
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
    const savedState = sessionStorage.getItem(STORAGE_KEYS.OAUTH_STATE);

    if (code && state && state === savedState) {
      // Clean URL first
      sessionStorage.removeItem(STORAGE_KEYS.OAUTH_STATE);
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);

      console.log('[Auth] Exchanging OAuth code for token...');
      // Exchange code for token via Cloudflare Worker
      fetch(getWorkerUrl(API_ENDPOINTS.OAUTH_TOKEN), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
        .then((res) => {
          console.log('[Auth] Token exchange response status:', res.status);
          return res.json();
        })
        .then(async (data: { access_token?: string; error?: string }) => {
          console.log('[Auth] Token exchange data:', data);
          if (!data.access_token) throw new Error(data.error ?? 'No token returned');
          saveToken(data.access_token);
          console.log('[Auth] Token saved, resolving user...');
          await resolveToken(data.access_token);
        })
        .catch((err) => {
          console.error('[Auth] Token exchange failed:', err);
          setState((prev) => ({ ...prev, loading: false }));
        });
      return;
    }

    // Check session storage for existing token
    const existingToken = loadToken();
    if (existingToken) {
      console.log('[Auth] Found existing token in session storage');
      setTimeout(() => {
        void resolveToken(existingToken);
      }, 0);
    } else {
      console.log('[Auth] No existing token found');
      setTimeout(() => {
        setState((prev) => ({ ...prev, loading: false }));
      }, 0);
    }
  }, [resolveToken]);

  // ── login / logout ──

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
