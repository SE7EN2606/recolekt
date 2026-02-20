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
  error: string | null;
  signInWithGoogle: () => void;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
  registerUser: (email: string, password: string, name: string) => Promise<User | null>;
  loginUser: (email: string, password: string) => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getApiBase = () => {
  if (import.meta.env.MODE === 'production') {
    return import.meta.env.VITE_API_BASE || '';
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
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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
  } catch {}
}

function clearCachedUser() {
  try {
    localStorage.removeItem(LS_USER_KEY);
    localStorage.removeItem(LS_USER_TS_KEY);
  } catch {}
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
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (!token) return null;
    return loadCachedUserUnsafeInstant();
  });

  const [loading, setLoading] = useState<boolean>(() => {
    if (hasTokenInUrl()) return true;
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (!token) return false;
    const cached = loadCachedUserUnsafeInstant();
    return !cached;
  });

  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(!!user);
  const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token') || localStorage.getItem('token'));

  const userRef = useRef<User | null>(user);
  userRef.current = user;

  const abortRef = useRef<AbortController | null>(null);

  const clearAuthEverywhere = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('token');
    clearCachedUser();
    setUser(null);
    setError(null);
    setIsAuthenticated(false);
    setToken(null);
  };

  const fetchMe = async (opts?: { showLoading?: boolean }) => {
    const showLoading = opts?.showLoading ?? false;

    const currentToken = localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (!currentToken) {
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
        const authUser = data.user as User;
        setUser(authUser);
        setIsAuthenticated(true);
        saveCachedUser(authUser);
      } else {
        clearAuthEverywhere();
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      if (!userRef.current) {
        clearAuthEverywhere();
      }
    } finally {
      setLoading(false);
    }
  };

  const loginUser = async (email: string, password: string): Promise<User | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(joinUrl(API_BASE, '/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Login failed');
      }

      const data = await response.json();
      
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('token', data.token);
      setToken(data.token);
      setUser(data.user);
      setIsAuthenticated(true);
      saveCachedUser(data.user);
      
      return data.user;
    } catch (error: any) {
      console.error('❌ Login error:', error);
      setError(error.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ✅ FIX: Now accepts and passes the `name` parameter
  const registerUser = async (email: string, password: string, name: string): Promise<User | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(joinUrl(API_BASE, '/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }), 
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Registration failed');
      }

      const data = await response.json();
      
      return data.user;
    } catch (error: any) {
      console.error('❌ Register error:', error);
      setError(error.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const tokenInUrl = readTokenInUrl();
    if (tokenInUrl) {
      localStorage.setItem('auth_token', tokenInUrl);
      localStorage.setItem('token', tokenInUrl);
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      void fetchMe({ showLoading: true });
      return () => {
        if (abortRef.current) abortRef.current.abort();
      };
    }

    const currentToken = localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (!currentToken) {
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
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if ((e.key === 'auth_token' || e.key === 'token') && !e.newValue) {
        clearAuthEverywhere();
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
      window.location.href = '/auth';
    }
  };

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      loading,
      error,
      signInWithGoogle,
      signOut,
      isAuthenticated,
      registerUser,
      loginUser,
    }),
    [user, loading, error, isAuthenticated]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export { getAuthHeaders };