import React, { createContext, useContext, useEffect, useState } from 'react';

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

/*
✅ Single source of truth
- Remove ALL trailing slashes so env like "https://api.com///" is still safe.
*/
const RAW_API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:5001';

const API_BASE = String(RAW_API_BASE).replace(/\/+$/, ''); // ✅ FIXED: was /\\+$/ (escaped backslashes)

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/, ''); // ✅ FIXED: was /\\+$/
  const p = String(path || '').replace(/^\/+/, ''); // ✅ FIXED: was /^\\+/
  return `${b}/${p}`;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      checkAuthStatus();
    }, 100);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch(joinUrl(API_BASE, '/api/auth/me'), {
        credentials: 'include'
      });

      if (response.status === 401) {
        setUser(null);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`Auth failed: ${response.status}`);
      }

      const data = await response.json();

      if (data?.authenticated && data?.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = () => {
    // Browser redirect to backend start route
    window.location.href = joinUrl(API_BASE, '/api/auth/google');
  };

  const signOut = async () => {
    try {
      await fetch(joinUrl(API_BASE, '/api/auth/logout'), {
        method: 'POST',
        credentials: 'include'
      });

      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithGoogle,
        signOut,
        isAuthenticated: !!user
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
};
