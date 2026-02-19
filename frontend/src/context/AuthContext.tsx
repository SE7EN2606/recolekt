import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => void;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const RAW_API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:5001';

const API_BASE = String(RAW_API_BASE).replace(/\/+$/, '');

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  return `${b}/${p}`;
}

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Non-secret local cache ONLY to avoid refresh flash.
 * Backend /me remains the source of truth.
 */
const LS_USER_KEY = 'auth_user';
const LS_USER_TS_KEY = 'auth_user_updated_at';

function loadCachedUserUnsafeInstant(): User | null {
  // "Instant" mode: if it looks like a user object, use it for first paint.
  // We still revalidate immediately in background.
  try {
    const raw = localStorage.getItem(LS_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id || !parsed?.email || !parsed?.name) return null;
    return parsed as User;
  } catch {
    return null;
  }
}

function saveCachedUser(user: User) {
  try {
    localStorage.setItem(LS_USER_KEY, JSON.stringify(user));
    localStorage.setItem(LS_USER_TS_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

function clearCachedUser() {
  try {
    localStorage.removeItem(LS_USER_KEY);
    localStorage.removeItem(LS_USER_TS_KEY);
  } catch {
    // ignore
  }
}

function hasTokenInUrl(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return !!params.get('token');
  } catch {
    return false;
  }
}

function readTokenInUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // IMPORTANT: sync init (no flash). This runs on the first render only (lazy init). [web:139]
  const [user, setUser] = useState<User | null>(() => {
    // If we're on OAuth callback (token in URL), ignore old cached user to prevent mismatch.
    if (hasTokenInUrl()) return null;

    const token = localStorage.getItem('auth_token');
    if (!token) return null;

    return loadCachedUserUnsafeInstant();
  });

  const [loading, setLoading] = useState<boolean>(() => {
    // If OAuth callback: we must validate /me before showing logged-in UI
    if (hasTokenInUrl()) return true;

    const token = localStorage.getItem('auth_token');
    if (!token) return false;

    // If we have cached user, we're done "loading" immediately.
    const cached = loadCachedUserUnsafeInstant();
    return !cached;
  });

  const userRef = useRef<User | null>(user);
  userRef.current = user;

  const abortRef = useRef<AbortController | null>(null);

  const clearAuthEverywhere = () => {
    localStorage.removeItem('auth_token');
    clearCachedUser();
    setUser(null);
  };

  const fetchMe = async (opts?: { showLoading?: boolean }) => {
    const showLoading = opts?.showLoading ?? false;

    const token = localStorage.getItem('auth_token');
    if (!token) {
      clearAuthEverywhere();
      setLoading(false);
      return;
    }

    if (showLoading) setLoading(true);

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(joinUrl(API_BASE, '/api/auth/me'), {
        credentials: 'include',
        headers: getAuthHeaders(),
        signal: controller.signal,
      });

      if (response.status === 401) {
        clearAuthEverywhere();
        return;
      }

      if (!response.ok) throw new Error(`Auth failed: ${response.status}`);

      const data = await response.json();

      if (data?.authenticated && data?.user) {
        setUser(data.user as User);
        saveCachedUser(data.user as User);
      } else {
        clearAuthEverywhere();
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return;

      // If we already showed a cached user, keep it (offline-friendly).
      // If we had no user, fall back to logged out.
      if (!userRef.current) {
        clearAuthEverywhere();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1) OAuth callback: token arrives in URL => store + clean URL + validate with loading
    const tokenInUrl = readTokenInUrl();
    if (tokenInUrl) {
      localStorage.setItem('auth_token', tokenInUrl);

      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);

      // Must validate to get user; keep loading true here.
      void fetchMe({ showLoading: true });

      return () => {
        if (abortRef.current) abortRef.current.abort();
      };
    }

    // 2) Normal refresh: if we have token:
    const token = localStorage.getItem('auth_token');
    if (!token) {
      clearCachedUser();
      setUser(null);
      setLoading(false);
      return () => {
        if (abortRef.current) abortRef.current.abort();
      };
    }

    // If we had cached user, revalidate in background WITHOUT toggling loading (SWR idea). [web:129]
    if (userRef.current) {
      void fetchMe({ showLoading: false });
    } else {
      // Token but no cached user => show loading until /me
      void fetchMe({ showLoading: true });
    }

    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep auth in sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'auth_token' && !e.newValue) {
        clearCachedUser();
        setUser(null);
        setLoading(false);
      }
      if (e.key === LS_USER_KEY && !e.newValue) {
        setUser(null);
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const signInWithGoogle = () => {
    window.location.href = joinUrl(API_BASE, '/api/auth/google');
  };

  const signOut = async () => {
    try {
      await fetch(joinUrl(API_BASE, '/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAuthEverywhere();
      setLoading(false);
    }
  };

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      loading,
      signInWithGoogle,
      signOut,
      isAuthenticated: !!user,
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export { getAuthHeaders };
