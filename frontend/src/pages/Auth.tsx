import { API_BASE } from "../utils/api";
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, AlertCircle, KeyRound, Eye, EyeOff, Instagram } from 'lucide-react';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import LogoWhite from '../assets/recolekt_logo_white.png';

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  if (!b) return `/${p}`;
  return `${b}/${p}`;
}

type ViewState = 'login' | 'register' | 'forgot' | 'reset' | 'verify';

const LAST_AUTH_KEY = 'last_auth_method';

export const Auth: React.FC = () => {
  const [view, setView] = useState<ViewState>('login');
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [instagramLoading, setInstagramLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const { t, i18n } = useTranslation(['auth', 'common']);

  const [resetEmail, setResetEmail] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);

  const navigate = useNavigate();
  const { user, loginUser, registerUser } = useAuth();

  const lastAuthMethod = localStorage.getItem(LAST_AUTH_KEY);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const adminMode = params.get('admin') === 'true';
    setIsAdminMode(adminMode);
    if (user && !adminMode) {
      navigate('/gallery', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    setShowPassword(false);
    setShowNewPassword(false);
    setErrorMsg('');
  }, [view]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(prev => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const doRedirectLogin = () => {
    setGoogleLoading(true);
    const next = `${window.location.origin}/gallery`;
    const loginUrl = `${joinUrl(API_BASE, '/api/auth/google/login')}?next=${encodeURIComponent(next)}`;
    window.location.assign(loginUrl);
  };

  const handleGoogleLogin = () => {
    setErrorMsg('');
    setGoogleLoading(true);
    doRedirectLogin();
  };

  const handleInstagramSetup = () => {
    setInstagramLoading(true);
    setErrorMsg('');
    window.location.assign(joinUrl(API_BASE, '/api/auth/instagram/login'));
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || !verificationEmail) return;
    try {
      const res = await fetch(joinUrl(API_BASE, '/api/auth/resend-verification'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail })
      });
      if (res.ok) {
        setResendCooldown(60);
      } else {
        setErrorMsg('Failed to resend code. Please try again.');
      }
    } catch {
      setErrorMsg('Failed to resend code.');
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEmailLoading(true);
    setErrorMsg('');
    const formData = new FormData(e.currentTarget);
    const email = (formData.get('email') as string) || '';
    const password = (formData.get('password') as string) || '';
    const name = (formData.get('name') as string) || '';
    const code = (formData.get('code') as string) || '';
    const lang = i18n.language || 'en';

    try {
      if (view === 'login') {
        const res = await loginUser(email, password);
        if (res) {
          localStorage.setItem(LAST_AUTH_KEY, 'email');
          navigate('/gallery');
        }
      } else if (view === 'register') {
        const res = await registerUser(email, password, name);
        if (res) {
          setVerificationEmail(email);
          setRegPassword(password);
          setResendCooldown(60);
          setView('verify');
        }
      } else if (view === 'forgot') {
        const res = await fetch(joinUrl(API_BASE, '/api/auth/forgot-password'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, lang })
        });
        if (res.ok) {
          setResetEmail(email);
          setView('reset');
        } else {
          const data = await res.json().catch(() => ({}));
          setErrorMsg(data.error || 'Failed to send reset code.');
        }
      } else if (view === 'reset') {
        const res = await fetch(joinUrl(API_BASE, '/api/auth/reset-password'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: resetEmail, code, password })
        });
        if (res.ok) {
          setView('login');
        } else {
          const data = await res.json().catch(() => ({}));
          setErrorMsg(data.error || 'Invalid or expired code.');
        }
      } else if (view === 'verify') {
        const res = await fetch(joinUrl(API_BASE, '/api/auth/verify-email'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: verificationEmail, code })
        });
        if (res.ok) {
          await loginUser(verificationEmail, regPassword);
          localStorage.setItem(LAST_AUTH_KEY, 'email');
          setTimeout(() => window.location.href = '/gallery', 100);
        } else {
          const data = await res.json().catch(() => ({}));
          setErrorMsg(data.error || 'Invalid or expired code.');
        }
      }
    } catch (error: any) {
      setErrorMsg(error.message || t('common:errorOccurred'));
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative bg-white flex flex-col md:flex-row">

      <div className="fixed inset-0 flex pointer-events-none">
        <div className="hidden md:block w-1/2 h-full bg-[#0B0F19]" />
        <div className="w-full md:w-1/2 h-full bg-white" />
      </div>

      <div className="relative z-10 w-full max-w-[1280px] mx-auto min-h-screen flex flex-col md:flex-row px-6 md:px-8">

        {/* Left Panel */}
        <div className="hidden md:flex w-1/2 flex-col justify-between py-16 pr-16 text-white h-full">
          <div>
            <Link to="/" className="inline-block hover:opacity-80 transition-opacity">
              <img src={LogoWhite} alt="recolekt" className="h-10 object-contain" />
            </Link>
          </div>
          <div className="max-w-lg">
            <h1 className="text-5xl font-black tracking-tight mb-6 leading-tight">
              {t('auth:inspirationTop')}{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-secondary-500">
                {t('auth:inspirationHighlight')}
              </span>
            </h1>
            <p className="text-gray-400 text-lg leading-relaxed font-medium">{t('auth:creatorsJoin')}</p>
          </div>
          <div className="flex gap-4 text-xs font-black uppercase tracking-widest text-gray-500">
            <span>© 2026 recolekt</span>
            <Link to="/help" className="hover:text-white transition-colors">{t('auth:help')}</Link>
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-full md:w-1/2 flex flex-col justify-start items-center h-full relative pl-0 md:pl-16 pt-16 md:pt-28">

          {/* Back to Home — fixed position, not absolute */}
          <div className="w-full flex justify-end mb-6">
            <Link to="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
              {t('auth:backToHome')}
            </Link>
          </div>

          <div className="w-full max-w-sm mx-auto px-1 md:px-0 md:max-w-sm" style={{ maxWidth: 'min(100%, 420px)' }}>

            {/* Verify */}
            {view === 'verify' && (
              <div className="text-center">
                <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <KeyRound size={28} className="text-primary-600" />
                </div>
                <h2 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">{t('auth:verifyEmail')}</h2>
                <p className="text-gray-500 text-sm mb-6">
                  {t('common:codeSentTo', 'Code sent to')}<br />
                  <span className="font-bold text-gray-800">{verificationEmail}</span>
                </p>
                {errorMsg && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4 text-sm text-left">
                    <AlertCircle size={16} className="flex-shrink-0" /><span>{errorMsg}</span>
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider ml-1">{t('auth:verifyAccount')}</label>
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input type="text" name="code" placeholder="123456" required maxLength={6}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 text-sm tracking-widest font-bold text-center" />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="w-full mt-2 px-8 py-4 text-base font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {emailLoading ? t('common:processing') : t('auth:verifyEmail')}
                  </button>
                </form>
                <div className="mt-4 text-center">
                  <button type="button" onClick={handleResendCode} disabled={resendCooldown > 0}
                    className="text-sm hover:underline disabled:opacity-40 disabled:no-underline"
                    style={{ color: resendCooldown > 0 ? '#9ca3af' : '#f43f5e' }}>
                    {resendCooldown > 0 ? `${t('common:resendIn', 'Resend in')} ${resendCooldown}s` : t('common:didntReceive', "Didn't receive it? Resend")}
                  </button>
                </div>
                <div className="mt-3 text-center">
                  <button type="button" onClick={() => setView('register')} className="text-xs text-gray-400 hover:text-gray-600">← {t('auth:backTo')}</button>
                </div>
              </div>
            )}

            {/* Reset */}
            {view === 'reset' && (
              <>
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <KeyRound size={28} className="text-primary-600" />
                  </div>
                  <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">{t('auth:resetPassword')}</h2>
                  <p className="text-gray-400 text-sm">
                    {t('common:codeSentTo', 'Code sent to')}{' '}
                    <span className="font-bold text-gray-700">{resetEmail}</span>
                  </p>
                </div>
                {errorMsg && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4 text-sm">
                    <AlertCircle size={16} className="flex-shrink-0" /><span>{errorMsg}</span>
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider ml-1">{t('auth:verifyAccount')}</label>
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input type="text" name="code" placeholder="123456" required maxLength={6}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 text-sm tracking-widest font-bold text-center" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider ml-1">{t('auth:newPassword')}</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input type={showNewPassword ? 'text' : 'password'} name="password" placeholder="••••••••" required
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-11 outline-none focus:ring-2 focus:ring-primary-100 text-sm" />
                      <button type="button" onClick={() => setShowNewPassword(p => !p)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        tabIndex={-1} aria-label={showNewPassword ? 'Hide password' : 'Show password'}>
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="w-full mt-2 px-8 py-4 text-base font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {emailLoading ? t('common:processing') : t('auth:resetPassword')}
                  </button>
                </form>
                <div className="mt-4 text-center">
                  <button type="button" onClick={() => setView('forgot')} className="text-sm hover:underline" style={{ color: '#f43f5e' }}>← {t('auth:backTo')}</button>
                </div>
              </>
            )}

            {/* Forgot */}
            {view === 'forgot' && (
              <>
                <div className="text-center mb-6">
                  <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">{t('auth:resetPassword')}</h2>
                  <p className="text-gray-400 text-sm">{t('common:resetDesc', "Enter your email and we'll send you a reset code.")}</p>
                </div>
                {errorMsg && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4 text-sm">
                    <AlertCircle size={16} className="flex-shrink-0" /><span>{errorMsg}</span>
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider ml-1">{t('auth:emailAddress')}</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input type="email" name="email" placeholder={t('auth:emailPlaceholder')} required
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 text-sm" />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="w-full mt-2 px-8 py-4 text-base font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {emailLoading ? t('common:processing') : t('auth:sendResetCode')}
                  </button>
                </form>
                <div className="mt-4 text-center">
                  <button type="button" onClick={() => setView('login')} className="text-sm hover:underline" style={{ color: '#f43f5e' }}>{t('auth:backTo')}</button>
                </div>
              </>
            )}

            {/* Login / Register */}
            {(view === 'login' || view === 'register') && (
              <>
                <div className="text-center mb-8 md:mb-6">
                  <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">
                    {view === 'login' ? t('auth:welcome') : t('auth:createAccount')}
                  </h2>
                </div>

                {errorMsg && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4 text-sm">
                    <AlertCircle size={16} className="flex-shrink-0" /><span>{errorMsg}</span>
                  </div>
                )}

                <div className="space-y-3 mb-4 mt-3">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={googleLoading || emailLoading || instagramLoading}
                    className="w-full flex items-center justify-center gap-3 p-4 bg-white hover:bg-gray-50 text-gray-800 font-medium rounded-xl transition-all border border-gray-200 shadow-sm hover:shadow-md disabled:opacity-50 text-sm"
                  >
                    {googleLoading ? (
                      <svg className="animate-spin w-5 h-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    ) : (
                      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                    )}
                    <span>{googleLoading ? t('common:processing') : t('auth:googleContinue')}</span>
                  </button>

                  {/* Instagram button — only visible in admin mode for Meta App Review */}
                  {isAdminMode && (
                    <button
                      type="button"
                      onClick={handleInstagramSetup}
                      disabled={googleLoading || emailLoading || instagramLoading}
                      className="w-full flex items-center justify-center gap-3 p-4 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white font-medium rounded-xl transition-all shadow-md hover:shadow-xl disabled:opacity-50 text-sm"
                    >
                      {instagramLoading ? (
                        <svg className="animate-spin w-5 h-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                      ) : (
                        <Instagram size={20} />
                      )}
                      <span>Connect Instagram Business Account</span>
                    </button>
                  )}
                </div>

                <div className="relative mb-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-100" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-4 text-gray-400 font-medium tracking-widest">{t('auth:emailContinue')}</span>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  {view === 'register' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider ml-1">{t('auth:fullName')}</label>
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input type="text" name="name" placeholder={t('auth:namePlaceholder')} required
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 text-sm" />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider ml-1">{t('auth:emailAddress')}</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input type="email" name="email" placeholder={t('auth:emailPlaceholder')} required
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 text-sm" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider ml-1">{t('auth:password')}</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input type={showPassword ? 'text' : 'password'} name="password" placeholder="••••••••" required
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-11 outline-none focus:ring-2 focus:ring-primary-100 text-sm" />
                      <button type="button" onClick={() => setShowPassword(prev => !prev)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        tabIndex={-1} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {view === 'login' && (
                      <div className="text-right mt-1">
                        <button type="button" onClick={() => setView('forgot')} className="text-xs hover:underline" style={{ color: '#f43f5e' }}>
                          {t('auth:forgotPassword')}
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={emailLoading || googleLoading || instagramLoading}
                    className="w-full mt-4 px-8 py-4 text-base font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {emailLoading ? t('common:processing') : (view === 'login' ? t('common:signIn') : t('auth:createAccount'))}
                  </button>
                </form>

                <div className="mt-5 text-center">
                  <button onClick={() => setView(view === 'login' ? 'register' : 'login')} type="button"
                    className="text-sm font-medium hover:underline text-primary-600">
                    {view === 'login' ? t('auth:noAccount') : t('auth:backTo')}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};