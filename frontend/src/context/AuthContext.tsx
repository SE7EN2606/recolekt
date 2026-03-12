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
  verifyGoogleToken: (accessToken: string) => Promise<void>;
  startGoogleLogin: () => void;
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
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}


const LS_USER_KEY = 'auth_user';
const LS_USER_TS_KEY = 'auth_user_updated_at';


function loadCachedUserUnsafeInstant(): User | null {
  try {
    const raw = localStorage.getItem(LS_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch { return null; }
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('auth_token') || localStorage.getItem('token'));


  const userRef = useRef(user);
  userRef.current = user;


  const clearAuthEverywhere = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('token');
    localStorage.removeItem('i18nextLng');
    clearCachedUser();
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
    setLoading(false);
  };


  const fetchMe = async () => {
    const currentToken = localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (!currentToken) { clearAuthEverywhere(); return; }
    try {
      const response = await fetch(joinUrl(API_BASE, '/api/auth/me'), {
        headers: getAuthHeaders(),
        credentials: 'omit',
      });
      if (response.ok) {
        const data = await response.json();
        if (data.authenticated) {
          setUser(data.user);
          setIsAuthenticated(true);
          saveCachedUser(data.user);
          if (data.user.language) i18n.changeLanguage(data.user.language);
        } else {
          clearAuthEverywhere();
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


  // Redirect-based Google login — no popup, no @react-oauth/google dependency needed
  const startGoogleLogin = () => {
    setError(null);
    const next = encodeURIComponent(`${window.location.origin}/gallery`);
    window.location.href = joinUrl(API_BASE, `/api/auth/google/login?next=${next}`);
  };


  // Keep for any other callers that still use the access_token verify path
  const verifyGoogleToken = async (accessToken: string) => {
    setError(null);
    try {
      const response = await fetch(joinUrl(API_BASE, '/api/auth/google/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken }),
        credentials: 'omit',
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Google login failed');
      }
      const data = await response.json();
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('token', data.token);
      setToken(data.token);
      setUser(data.user);
      setIsAuthenticated(true);
      saveCachedUser(data.user);
      if (data.user.language) {
        i18n.changeLanguage(data.user.language);
        localStorage.setItem('i18nextLng', data.user.language);
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };


  const loginUser = async (email: string, password: string): Promise<User | null> => {
    try {
      const response = await fetch(joinUrl(API_BASE, '/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'omit',
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(data.error || 'Invalid email or password.');
        }
        if (response.status === 404) {
          throw new Error('No account found with this email address.');
        }
        throw new Error(data.error || 'Login failed. Please try again.');
      }
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('token', data.token);
      setToken(data.token);
      setUser(data.user);
      setIsAuthenticated(true);
      saveCachedUser(data.user);
      if (data.user.language) i18n.changeLanguage(data.user.language);
      return data.user;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };


  const registerUser = async (email: string, password: string, name: string): Promise<User | null> => {
    try {
      const response = await fetch(joinUrl(API_BASE, '/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
        credentials: 'omit',
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('An account with this email already exists.');
        }
        throw new Error(data.error || 'Registration failed. Please try again.');
      }
      return data.user;
    } catch (err: any) {
      setError(err.message);
      throw err;
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
        credentials: 'omit',
      });
      setUser(prev => prev ? { ...prev, language: lang } : null);
    } catch (e) { console.error(e); }
  };


  const signOut = async () => {
    clearAuthEverywhere();
    window.location.href = '/auth';
  };


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const urlError = params.get('error');

    // Google callback returned an error (e.g. user cancelled)
    if (urlError) {
      setError(decodeURIComponent(urlError));
      window.history.replaceState({}, '', window.location.pathname);
      setLoading(false);
      return;
    }

    // Google callback returned a JWT — store it before fetchMe runs
    if (urlToken) {
      localStorage.setItem('auth_token', urlToken);
      localStorage.setItem('token', urlToken);
      window.history.replaceState({}, '', window.location.pathname);
    }

    fetchMe();
  }, []);


  const value = useMemo(() => ({
    user, loading, error,
    verifyGoogleToken, startGoogleLogin,
    signOut, isAuthenticated,
    registerUser, loginUser, updateUserLanguage
  }), [user, loading, error, isAuthenticated]);


  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};


export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth error');
  return context;
};


export { getAuthHeaders };
