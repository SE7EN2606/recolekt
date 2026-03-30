import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../utils/api';
import { useTranslation } from 'react-i18next';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  if (!b) return `/${p}`;
  return `${b}/${p}`;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation(['auth', 'common']);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState('');

  const { loginUser, registerUser, loading, error } = useAuth();
  const navigate = useNavigate();

  const handleGoogleLogin = () => {
    setLocalError('');
    const googleLoginUrl = joinUrl(API_BASE, '/api/auth/google/login');
    window.location.assign(googleLoginUrl);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    try {
      if (isSignUp) {
        await registerUser(email, password, name);
      } else {
        const user = await loginUser(email, password);
        if (user) {
          onClose();
          navigate('/gallery');
        }
      }
    } catch (err: any) {
      setLocalError(err?.message || t('auth:errorServer', 'An unexpected error occurred.'));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-md animate-fade-in rounded-2xl bg-white p-8 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 transition-colors hover:text-gray-600"
          aria-label={t('common:close', 'Close auth modal')}
        >
          <X size={24} />
        </button>

        <h2 className="mb-6 text-2xl font-bold text-gray-900">
          {isSignUp ? t('auth:signUp', 'Create Account') : t('auth:signIn', 'Sign In')}
        </h2>

        {(localError || error) && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {localError || error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('common:name', 'Name')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none focus:ring-2 focus:ring-primary-500"
                placeholder={t('auth:yourNamePlaceholder', 'Your Name')}
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('common:password', 'Password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary-600 py-2.5 font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? t('common:loading', 'Processing...') : (isSignUp ? t('auth:signUp', 'Create Account') : t('auth:signIn', 'Sign In'))}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-2 text-gray-500">{t('auth:orContinueWith', 'Or continue with')}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707 0-.593.102-1.17.282-1.709V4.958H.957C.347 6.173 0 7.548 0 9c0 1.452.348 2.827.957 4.042l3.007-2.335z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
            />
          </svg>
          {t('auth:continueWithGoogle', 'Continue with Google')}
        </button>

        <p className="mt-6 text-center text-sm text-gray-600">
          {isSignUp ? t('auth:alreadyHaveAccount', 'Already have an account?') : t('auth:noAccount', "Don't have an account?")}{' '}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setLocalError('');
            }}
            className="font-medium text-primary-600 hover:text-primary-700"
          >
            {isSignUp ? t('auth:signIn', 'Sign In') : t('auth:signUp', 'Sign Up')}
          </button>
        </p>
      </div>
    </div>
  );
};