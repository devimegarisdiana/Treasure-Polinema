import { useCallback, useEffect, useState } from 'react';
import type { AuthUser } from '@workspace/api-client-react';

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  reauthenticate: () => void;
  logout: () => void;
}

function getBasePath() {
  return import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadUser = () => fetch('/api/auth/user', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data.user ?? null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      });
    void loadUser();
    window.addEventListener('focus', loadUser);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', loadUser);
    };
  }, []);

  const login = useCallback(() => {
    const base = window.location.pathname || getBasePath();
    window.location.href = `/api/login?returnTo=${encodeURIComponent(base)}`;
  }, []);

  const logout = useCallback(() => {
    const base = getBasePath();
    window.location.href = `/api/logout?returnTo=${encodeURIComponent(base)}`;
  }, []);

  // Keep the original registration and selected documents in memory on expiry.
  const reauthenticate = useCallback(() => {
    const returnTo = window.location.pathname || getBasePath();
    window.open(`/api/login?returnTo=${encodeURIComponent(returnTo)}`, '_blank', 'noopener,noreferrer');
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    reauthenticate,
    logout,
  };
}
