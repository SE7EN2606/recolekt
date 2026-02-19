import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { registerUser, loginUser, loading, error } = useAuth();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('signup');

  const handleLogin = async () => {
    console.log('🔥 Login:', email);
    const user = await loginUser(email, password);
    if (user) {
      navigate('/gallery');
      onClose();
    }
  };

  const handleSignup = async () => {
    console.log('🔥 Signup:', email);
    const user = await registerUser(email, password);
    if (user) {
      navigate('/gallery');
      onClose();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') handleLogin();
    else handleSignup();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 max-w-md w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-black">{mode === 'login' ? 'Sign In' : 'Sign Up'}</h2>
            <button onClick={onClose} className="p-2 -m-2 rounded-xl hover:bg-gray-100">
              <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`px-4 py-2 rounded-xl font-bold ${mode === 'login' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-blue-600'}`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`px-4 py-2 rounded-xl font-bold ${mode === 'signup' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-blue-600'}`}
            >
              Sign Up
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">{error}</div>}
          
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-4 border rounded-2xl focus:ring-4 focus:ring-blue-500/20"
            disabled={loading}
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-4 border rounded-2xl focus:ring-4 focus:ring-blue-500/20"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white p-4 rounded-2xl font-bold text-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        {/* 🔥 DEBUG BUTTON */}
        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={handleSignup}
            className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600"
            disabled={loading}
          >
            🔥 TEST SIGNUP (Console Debug)
          </button>
        </div>
      </div>
    </div>
  );
};
