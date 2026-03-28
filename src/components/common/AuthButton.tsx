import { useAuth } from '../../context/useAuth';
import { GITHUB_CONFIG } from '../../config';
import { useState } from 'react';
import './AuthButton.css';

export function AuthButton() {
  const { user, token, hasWriteAccess, loading, login, logout } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const handleSync = async () => {
    if (!token || !GITHUB_CONFIG.oauthWorkerUrl || syncing) return;

    try {
      setSyncing(true);
      setSyncMsg(null);

      const res = await fetch(`${GITHUB_CONFIG.oauthWorkerUrl}/notes/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Token': token,
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? `Sync failed (${res.status})`);
      }

      setSyncMsg('Synced');
      window.dispatchEvent(new CustomEvent('devnotes:sync-complete'));
      setTimeout(() => setSyncMsg(null), 2000);
    } catch (error) {
      setSyncMsg(error instanceof Error ? error.message : 'Sync failed');
      setTimeout(() => setSyncMsg(null), 3000);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <div className="auth-btn auth-btn--loading">···</div>;
  }

  if (user) {
    return (
      <div className="auth-user">
        <img className="auth-avatar" src={user.avatar_url} alt={user.login} />
        <div className="auth-info">
          <span className="auth-name">{user.name ?? user.login}</span>
          <span className={`auth-role ${hasWriteAccess ? 'auth-role--write' : 'auth-role--read'}`}>
            {hasWriteAccess ? '✏️ can edit' : '👁️ read-only'}
          </span>
        </div>
        {hasWriteAccess && (
          <button
            className="auth-btn auth-btn--sync"
            onClick={handleSync}
            disabled={syncing}
            title="Sync metadata into KV"
          >
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
        )}
        <button className="auth-btn auth-btn--logout" onClick={logout}>
          Sign out
        </button>
        {syncMsg && <span className="auth-sync-msg">{syncMsg}</span>}
      </div>
    );
  }

  return (
    <button className="auth-btn auth-btn--login" onClick={login}>
      <svg height="20" viewBox="0 0 16 16" width="20" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
          0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
          -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87
          2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95
          0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82
          .64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82
          .44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65
          3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38
          A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
      Sign in
    </button>
  );
}
