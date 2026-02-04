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
  return token ? {
    'Authorization': `Bearer ${token}`
  } : {};
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('🔍 AuthContext mounted');
    console.log('🔍 Current URL:', window.location.href);
    
    // ✅ Check for token in URL (from OAuth callback)
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    
    console.log('🔍 Token in URL?', token ? 'YES' : 'NO');
    
    if (token) {
      console.log('✅ Token received from OAuth callback, storing...');
      localStorage.setItem('auth_token', token);
      
      // Remove token from URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      
      console.log('✅ Token stored, checking auth...');
      // ✅ Check auth immediately and return early
      checkAuthStatus();
      return; // ✅ IMPORTANT: Don't run the timer
    }
    
    // Normal auth check with small delay
    console.log('ℹ️ No token in URL, checking existing auth...');
    const timer = setTimeout(() => {
      checkAuthStatus();
    }, 100);
    
    return () => clearTimeout(timer);
  }, []); // ✅ Empty array - runs once on mount

  const checkAuthStatus = async () => {
    console.log('🔍 checkAuthStatus started');
    try {
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        console.log('❌ No token found in localStorage');
        setUser(null);
        setLoading(false);
        return;
      }

      console.log('🔍 Token found, validating with backend...');
      const response = await fetch(joinUrl(API_BASE, '/api/auth/me'), {
        credentials: 'include',
        headers: getAuthHeaders()
      });

      if (response.status === 401) {
        console.log('❌ Token invalid or expired');
        localStorage.removeItem('auth_token');
        setUser(null);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`Auth failed: ${response.status}`);
      }

      const data = await response.json();

      if (data?.authenticated && data?.user) {
        console.log('✅ User authenticated:', data.user.email);
        setUser(data.user);
      } else {
        console.log('❌ Not authenticated');
        localStorage.removeItem('auth_token');
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      localStorage.removeItem('auth_token');
      setUser(null);
    } finally {
      console.log('🔍 checkAuthStatus complete, setting loading=false');
      setLoading(false);
    }
  };

  const signInWithGoogle = () => {
    window.location.href = joinUrl(API_BASE, '/api/auth/google');
  };

  const signOut = async () => {
    try {
      await fetch(joinUrl(API_BASE, '/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders()
      });

      localStorage.removeItem('auth_token');
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
      localStorage.removeItem('auth_token');
      setUser(null);
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

export { getAuthHeaders };
