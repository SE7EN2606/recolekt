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

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Small timeout to ensure browser cookies are ready/accessible on mount
    const timer = setTimeout(() => {
      checkAuthStatus();
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: 'include' // ✅ CRITICAL: Sends session cookie to backend
      });

      // ✅ CRITICAL: Check for 401 BEFORE reading JSON to avoid parse errors
      if (response.status === 401) {
        setUser(null);
        setLoading(false);
        return;
      }

      // ✅ NOW read JSON
      const data = await response.json();

      if (response.ok && data.authenticated && data.user) {
        console.log('✅ User authenticated:', data.user.email);
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = () => {
    // Redirects browser to backend Google OAuth route
    window.location.href = `${API_BASE}/api/auth/google`;
  };

  const signOut = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
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