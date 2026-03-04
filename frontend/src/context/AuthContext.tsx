import { API_BASE } from "../utils/api";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  language?: string;
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
  updateUserLanguage: (lang: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  if (!b) return `/${p}`;
  return `${b}/${p}`;
}

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

const LS_USER_KEY = 'auth_user';
const LS_USER_TS_KEY = 'auth_user_updated_at';

function loadCachedUserUnsafeInstant(): User | null {
  try {
    const raw = localStorage.getItem(LS_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const [user, setUser] = useState<User | null>(() => loadCachedUserUnsafeInstant());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const userRef = useRef<User | null>(user);
  userRef.current = user;
  const abortRef = useRef<AbortController | null>(null);

  const clearAuthEverywhere = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('token');
    clearCachedUser();
    setUser(null);
    setIsAuthenticated(false);
    setLoading(false);
  };

  const fetchMe = async () => {
    const currentToken = localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (!currentToken) {
      clearAuthEverywhere();
      return;
    }

    try {
      const response = await fetch(joinUrl(API_BASE, '/api/auth/me'), {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.authenticated) {
          setUser(data.user);
          setIsAuthenticated(true);
          saveCachedUser(data.user);
          if (data.user.language) {
            i18n.changeLanguage(data.user.language);
          }
        }
      } else {
        clearAuthEverywhere();
      }
    } catch (e) {
      console.error("Auth check failed", e);
    } finally {
      setLoading(false);
    }
  };

  const loginUser = async (email: string, password: string) => {
    setLoading(true);
    try {
      const response = await fetch(joinUrl(API_BASE, '/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Login failed');
      
      localStorage.setItem('auth_token', data.token);
      setUser(data.user);
      setIsAuthenticated(true);
      saveCachedUser(data.user);
      return data.user;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const registerUser = async (email: string, password: string, name: string) => {
    setLoading(true);
    try {
      const response = await fetch(joinUrl(API_BASE, '/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Registration failed');
      return data.user;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateUserLanguage = async (lang: string) => {
    i18n.changeLanguage(lang);
    if (!user) return;
    try {
      await fetch(joinUrl(API_BASE, '/api/auth/language'), {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ language: lang }),
      });
      setUser(prev => prev ? { ...prev, language: lang } : null);
    } catch (e) {
      console.error(e);
    }
  };

  const signInWithGoogle = () => {
    // ✅ Use the dynamic API_BASE resolved at runtime
    window.location.href = `${API_BASE}/api/auth/google`;
  };

  const signOut = async () => {
    clearAuthEverywhere();
    window.location.href = '/auth';
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      localStorage.setItem('auth_token', token);
      window.history.replaceState({}, '', window.location.pathname);
    }
    fetchMe();
  }, []);

  const value = useMemo(() => ({
    user, loading, error, signInWithGoogle, signOut, 
    isAuthenticated, registerUser, loginUser, updateUserLanguage
  }), [user, loading, error, isAuthenticated]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth error');
  return context;
};

export { getAuthHeaders };