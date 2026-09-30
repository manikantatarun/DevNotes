import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { useAuth } from '../context/useAuth';

function AuthSnapshot() {
  const auth = useAuth();

  return (
    <div>
      <div data-testid="loading">{String(auth.loading)}</div>
      <div data-testid="token">{auth.token ?? ''}</div>
      <div data-testid="user">{auth.user?.login ?? ''}</div>
      <div data-testid="write">{String(auth.hasWriteAccess)}</div>
      <button onClick={auth.logout}>logout</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('resolves to unauthenticated state when no token is present', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('should not call fetch'));

    render(
      <AuthProvider>
        <AuthSnapshot />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('token').textContent).toBe('');
    expect(screen.getByTestId('user').textContent).toBe('');
    expect(screen.getByTestId('write').textContent).toBe('false');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('restores a valid session token and computes write access', async () => {
    sessionStorage.setItem('devnotes_gh_token', 'token-123');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith('/user')) {
        return new Response(
          JSON.stringify({
            login: 'octocat',
            name: 'Octo Cat',
            avatar_url: 'https://example.test/avatar.png',
            email: null,
          }),
          { status: 200 },
        );
      }

      if (url.includes('/permission')) {
        return new Response(JSON.stringify({ role_name: 'write' }), { status: 200 });
      }

      return new Response(JSON.stringify({ error: 'unexpected' }), { status: 500 });
    });

    render(
      <AuthProvider>
        <AuthSnapshot />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('token').textContent).toBe('token-123');
      expect(screen.getByTestId('user').textContent).toBe('octocat');
      expect(screen.getByTestId('write').textContent).toBe('true');
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clears an invalid token when user lookup fails', async () => {
    sessionStorage.setItem('devnotes_gh_token', 'bad-token');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'bad token' }), { status: 401 }));

    render(
      <AuthProvider>
        <AuthSnapshot />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('token').textContent).toBe('');
    expect(sessionStorage.getItem('devnotes_gh_token')).toBeNull();
  });

  it('handles OAuth callback by exchanging code and resolving the user', async () => {
    window.history.replaceState({}, '', '/?code=oauth-code&state=state-1');
    sessionStorage.setItem('oauth_state', 'state-1');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'oauth-token' }), { status: 200 });
      }

      if (url.endsWith('/user')) {
        return new Response(
          JSON.stringify({
            login: 'oauth-user',
            name: null,
            avatar_url: 'https://example.test/avatar.png',
            email: null,
          }),
          { status: 200 },
        );
      }

      if (url.includes('/permission')) {
        return new Response(JSON.stringify({ role_name: 'read' }), { status: 200 });
      }

      return new Response(JSON.stringify({ error: 'unexpected' }), { status: 500 });
    });

    render(
      <AuthProvider>
        <AuthSnapshot />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('token').textContent).toBe('oauth-token');
      expect(screen.getByTestId('user').textContent).toBe('oauth-user');
      expect(screen.getByTestId('write').textContent).toBe('false');
    });

    expect(sessionStorage.getItem('devnotes_gh_token')).toBe('oauth-token');
    expect(sessionStorage.getItem('oauth_state')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('logout resets state and clears token', async () => {
    sessionStorage.setItem('devnotes_gh_token', 'token-123');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith('/user')) {
        return new Response(
          JSON.stringify({
            login: 'octocat',
            name: 'Octo Cat',
            avatar_url: 'https://example.test/avatar.png',
            email: null,
          }),
          { status: 200 },
        );
      }

      if (url.includes('/permission')) {
        return new Response(JSON.stringify({ role_name: 'write' }), { status: 200 });
      }

      return new Response(JSON.stringify({ error: 'unexpected' }), { status: 500 });
    });

    render(
      <AuthProvider>
        <AuthSnapshot />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('octocat');
    });

    fireEvent.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => {
      expect(screen.getByTestId('token').textContent).toBe('');
      expect(screen.getByTestId('user').textContent).toBe('');
      expect(screen.getByTestId('write').textContent).toBe('false');
    });

    expect(sessionStorage.getItem('devnotes_gh_token')).toBeNull();
  });
});
