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

// ✅ FIX: Safe API Base resolution. Do NOT fall back to localhost in production!
const getApiBase = () => {
  if (import.meta.env.MODE === 'production') {
    return import.meta.env.VITE_API_BASE || ''; // Safe to be empty for Netlify proxy
  }
  return import.meta.env.VITE_API_BASE || 'http://localhost:5001';
};

const API_BASE = getApiBase();

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  return b ? `${b}/${p}` : `/${p}`;
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
  const [user, setUser] = useState<User | null>(() => {
    if (hasTokenInUrl()) return null;

    const token = localStorage.getItem('auth_token');
    if (!token) return null;

    return loadCachedUserUnsafeInstant();
  });

  const [loading, setLoading] = useState<boolean>(() => {
    if (hasTokenInUrl()) return true;

    const token = localStorage.getItem('auth_token');
    if (!token) return false;

    const cached = loadCachedUserUnsafeInstant();
    return !cached;
  });

  const userRef = useRef<User | null>(user);
  userRef.current = user;

  const abortRef = useRef<AbortController | null>(null);

  const clearAuthEverywhere = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('token'); // Also clear the legacy key
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
      const targetUrl = joinUrl(API_BASE, '/api/auth/me');
      console.log(`📡 Fetching user data from: ${targetUrl}`); // Debug log

      const response = await fetch(targetUrl, {
        credentials: 'include',
        headers: getAuthHeaders(),
        signal: controller.signal,
      });

      if (response.status === 401) {
        console.warn("⚠️ Token rejected by server (401)");
        clearAuthEverywhere();
        setLoading(false);
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

      console.error("❌ fetchMe Error:", error);

      if (!userRef.current) {
        clearAuthEverywhere();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const tokenInUrl = readTokenInUrl();
    if (tokenInUrl) {
      // Save it under BOTH keys to prevent mismatches across files
      localStorage.setItem('auth_token', tokenInUrl);
      localStorage.setItem('token', tokenInUrl);

      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);

      void fetchMe({ showLoading: true });

      return () => {
        if (abortRef.current) abortRef.current.abort();
      };
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      clearCachedUser();
      setUser(null);
      setLoading(false);
      return () => {
        if (abortRef.current) abortRef.current.abort();
      };
    }

    if (userRef.current) {
      void fetchMe({ showLoading: false });
    } else {
      void fetchMe({ showLoading: true });
    }

    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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