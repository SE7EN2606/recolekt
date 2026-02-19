import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { registerUser, loginUser, loading, error, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const handleLogin = async () => {
    console.log('🔥 Login:', email);
    const user = await loginUser(email, password);
    if (user) {
      console.log('✅ Login success, nav to gallery');
      navigate('/gallery');
      onClose();
    }
  };

  const handleSignup = async () => {
    console.log('🔥 Signup:', email);
    const user = await registerUser(email, password);
    if (user) {
      console.log('✅ Signup + auto-login success!');
      navigate('/gallery');
      onClose();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      handleLogin();
    } else {
      handleSignup();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 max-w-md w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-black text-gray-900">
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 -m-2 rounded-xl hover:bg-gray-100 transition-all"
            >
              <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex space-x-2 text-sm">
            <button
              onClick={() => setMode('login')}
              className={`px-4 py-1.5 rounded-xl font-semibold transition-all ${
                mode === 'login'
                  ? 'bg-primary-600 text-white shadow-lg'
                  : 'text-gray-600 hover:text-primary-600'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`px-4 py-1.5 rounded-xl font-semibold transition-all ${
                mode === 'signup'
                  ? 'bg-primary-600 text-white shadow-lg'
                  : 'text-gray-600 hover:text-primary-600'
              }`}
            >
              Sign Up
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-800 font-medium">{error}</p>
            </div>
          )}
          
          <div>
            <input
              type="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3.5 border border-gray-200 rounded-2xl text-lg font-medium focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
              disabled={loading}
            />
          </div>

          <div>
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 border border-gray-200 rounded-2xl text-lg font-medium focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-gradient-to-r from-primary-600 to-primary-700 text-white py-4 px-6 rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {loading ? 'Creating Account...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2">
          <button
            type="button"
            onClick={() => {
              console.log('🔥 TEST REGISTER NOW');
              handleSignup();
            }}
            className="w-full bg-orange-500 text-white py-2 px-4 rounded-xl font-bold text-sm shadow-lg hover:bg-orange-600 transition-all"
            disabled={loading}
          >
            🔥 TEST REGISTER (Console Debug)
          </button>
        </div>
      </div>
    </div>
  );
};
