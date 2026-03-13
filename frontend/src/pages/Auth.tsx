import { API_BASE } from "../utils/api";
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, AlertCircle, KeyRound, Eye, EyeOff } from 'lucide-react';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { useGoogleLogin } from '@react-oauth/google';
import LogoWhite from '../assets/recolekt_logo_white.png';

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  if (!b) return `/${p}`;
  return `${b}/${p}`;
}

type ViewState = 'login' | 'register' | 'forgot' | 'reset' | 'verify';

const LAST_AUTH_KEY = 'last_auth_method';

// ─── DEBUG LOGGER ───────────────────────────────────────
// Writes to both console AND a visible on-screen debug panel
// so you can see what's happening on mobile without devtools
const DEBUG_LOGS: string[] = [];

function dbg(msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  const line = `[${ts}] ${msg}`;
  console.log(`🔍 AUTH_DEBUG: ${line}`);
  DEBUG_LOGS.push(line);
  // Keep last 30 lines
  if (DEBUG_LOGS.length > 30) DEBUG_LOGS.shift();
  // Dispatch custom event so the debug panel re-renders
  window.dispatchEvent(new CustomEvent('auth-debug-log'));
}

// On-screen debug panel component (remove after debugging)
const DebugPanel: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => setLogs([...DEBUG_LOGS]);
    window.addEventListener('auth-debug-log', handler);
    return () => window.removeEventListener('auth-debug-log', handler);
  }, []);

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 99999 }}>
      <button
        onClick={() => setVisible(v => !v)}
        style={{
          position: 'absolute', bottom: visible ? 'auto' : 8, top: visible ? 0 : 'auto',
          right: 8, background: '#f43f5e', color: '#fff', border: 'none',
          borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 900,
          zIndex: 100000
        }}
      >
        {visible ? 'HIDE DEBUG' : `DEBUG (${logs.length})`}
      </button>
      {visible && (
        <div style={{
          background: 'rgba(0,0,0,0.92)', color: '#0f0', fontFamily: 'monospace',
          fontSize: 10, lineHeight: 1.4, padding: '32px 8px 8px', maxHeight: '50vh',
          overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
        }}>
          {logs.length === 0 ? 'No logs yet. Try clicking Google login.' : logs.join('\n')}
        </div>
      )}
    </div>
  );
};

// ─── BROWSER DETECTION ──────────────────────────────────
function detectBrowserInfo(): { name: string; shouldRedirect: boolean } {
  const ua = navigator.userAgent || '';

  if (/Focus/i.test(ua)) return { name: 'Firefox Focus', shouldRedirect: true };
  if (/Klar/i.test(ua)) return { name: 'Firefox Klar', shouldRedirect: true };
  if (/DuckDuckGo/i.test(ua)) return { name: 'DuckDuckGo', shouldRedirect: true };
  if (/FBAN|FBAV/i.test(ua)) return { name: 'Facebook In-App', shouldRedirect: true };
  if (/Instagram/i.test(ua)) return { name: 'Instagram In-App', shouldRedirect: true };
  if (/Line\//i.test(ua)) return { name: 'LINE In-App', shouldRedirect: true };
  // iOS webview that isn't Safari
  if (/iPhone|iPad/i.test(ua) && !/Safari/i.test(ua)) return { name: 'iOS WebView', shouldRedirect: true };
  if ((navigator as any).brave) return { name: 'Brave', shouldRedirect: true };

  // Check if popups are likely blocked
  // Some browsers report Safari in UA but still block popups
  if (/iPhone|iPad/i.test(ua) && /FxiOS/i.test(ua)) return { name: 'Firefox iOS', shouldRedirect: true };

  return { name: 'Standard', shouldRedirect: false };
}

export const Auth: React.FC = () => {
  const [view, setView] = useState<ViewState>('login');
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const { t, i18n } = useTranslation(['auth', 'common']);

  const [resetEmail, setResetEmail] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const navigate = useNavigate();
  const { user, verifyGoogleToken, loginUser, registerUser } = useAuth();
  const googleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastAuthMethod = localStorage.getItem(LAST_AUTH_KEY);
  const browserInfo = detectBrowserInfo();

  // Log browser detection on mount
  useEffect(() => {
    const ua = navigator.userAgent || '';
    dbg(`Browser: ${browserInfo.name} | redirect=${browserInfo.shouldRedirect}`);
    dbg(`UA: ${ua.slice(0, 120)}`);
    dbg(`API_BASE: ${API_BASE}`);
  }, []);

  useEffect(() => {
    if (user) navigate('/gallery', { replace: true });
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

  // Popup-based Google login
  const loginWithGooglePopup = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      dbg(`POPUP onSuccess — got access_token (${tokenResponse.access_token?.slice(0, 20)}...)`);
      // Clear the safety timeout
      if (googleTimeoutRef.current) clearTimeout(googleTimeoutRef.current);

      setGoogleLoading(true);
      setErrorMsg('');
      try {
        dbg('Calling verifyGoogleToken...');
        await verifyGoogleToken(tokenResponse.access_token);
        dbg('verifyGoogleToken SUCCESS');
        localStorage.setItem(LAST_AUTH_KEY, 'google');
        navigate('/gallery');
      } catch (err: any) {
        dbg(`verifyGoogleToken FAILED: ${err?.message || err}`);
        dbg('Falling back to redirect flow...');
        doRedirectLogin();
      } finally {
        setGoogleLoading(false);
      }
    },
    onError: (errorResponse) => {
      dbg(`POPUP onError: ${JSON.stringify(errorResponse)}`);
      if (googleTimeoutRef.current) clearTimeout(googleTimeoutRef.current);
      dbg('Popup failed — falling back to redirect flow');
      doRedirectLogin();
    },
    onNonOAuthError: (err) => {
      // This fires when popup is blocked or user closes it
      dbg(`POPUP onNonOAuthError: ${JSON.stringify(err)}`);
      if (googleTimeoutRef.current) clearTimeout(googleTimeoutRef.current);
      dbg('Popup blocked/closed — falling back to redirect flow');
      doRedirectLogin();
    }
  });

  // Redirect-based login (server-side OAuth)
  const doRedirectLogin = () => {
    dbg('>>> REDIRECT: navigating to /api/auth/google/login');
    setGoogleLoading(true);
    const url = joinUrl(API_BASE, '/api/auth/google/login');
    dbg(`>>> REDIRECT URL: ${url}`);
    window.location.assign(url);
  };

  const handleGoogleLogin = () => {
    setErrorMsg('');
    setGoogleLoading(true);
    dbg(`handleGoogleLogin called — browser=${browserInfo.name} shouldRedirect=${browserInfo.shouldRedirect}`);

    if (browserInfo.shouldRedirect) {
      dbg('Using REDIRECT flow (browser detected as needing it)');
      doRedirectLogin();
      return;
    }

    dbg('Trying POPUP flow first...');

    // Safety timeout: if the popup doesn't respond within 8s,
    // assume it was blocked and fall back to redirect
    googleTimeoutRef.current = setTimeout(() => {
      dbg('⚠️ POPUP TIMEOUT (8s) — no response from Google popup');
      dbg('Falling back to redirect flow...');
      doRedirectLogin();
    }, 8000);

    try {
      loginWithGooglePopup();
      dbg('loginWithGooglePopup() called — waiting for popup response...');
    } catch (err: any) {
      dbg(`loginWithGooglePopup() threw: ${err?.message || err}`);
      if (googleTimeoutRef.current) clearTimeout(googleTimeoutRef.current);
      doRedirectLogin();
    }
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

      {/* ── DEBUG PANEL — remove after fixing ── */}
      <DebugPanel />

      {/* ── BACKGROUND SPLIT ── */}
      <div className="fixed inset-0 flex pointer-events-none">
        <div className="hidden md:block w-1/2 h-full bg-[#0B0F19]" />
        <div className="w-full md:w-1/2 h-full bg-white" />
      </div>

      <div className="relative z-10 w-full max-w-[1280px] mx-auto min-h-screen flex flex-col md:flex-row px-6 md:px-8">

        {/* ── LEFT PANEL ── */}
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

        {/* ── RIGHT PANEL ── */}
        <div className="w-full md:w-1/2 flex flex-col justify-start items-center h-full relative pl-0 md:pl-16 pt-32 md:pt-28">

          <div className="absolute top-8 right-0">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-black text-gray-400 hover:text-gray-700 transition-colors uppercase tracking-widest"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
              {t('auth:backToHome')}
            </Link>
          </div>

          <div className="w-full max-w-sm mx-auto px-1 md:px-0 md:max-w-sm" style={{ maxWidth: 'min(100%, 420px)' }}>

            {/* ══ VERIFY VIEW ══ */}
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
                    <AlertCircle size={16} className="flex-shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">{t('auth:verifyAccount')}</label>
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input type="text" name="code" placeholder="123456" required maxLength={6}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 text-sm tracking-widest font-bold text-center" />
                    </div>
                  </div>
                  <Button type="submit" fullWidth disabled={emailLoading} className="h-12 mt-2 text-sm font-black shadow-xl rounded-xl">
                    {emailLoading ? t('common:processing') : t('auth:verifyEmail')}
                  </Button>
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

            {/* ══ RESET VIEW ══ */}
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
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">{t('auth:verifyAccount')}</label>
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input type="text" name="code" placeholder="123456" required maxLength={6}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 text-sm tracking-widest font-bold text-center" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">{t('auth:newPassword')}</label>
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
                  <Button type="submit" fullWidth disabled={emailLoading} className="h-12 mt-2 text-sm font-black shadow-xl rounded-xl">
                    {emailLoading ? t('common:processing') : t('auth:resetPassword')}
                  </Button>
                </form>
                <div className="mt-4 text-center">
                  <button type="button" onClick={() => setView('forgot')} className="text-sm hover:underline" style={{ color: '#f43f5e' }}>← {t('auth:backTo')}</button>
                </div>
              </>
            )}

            {/* ══ FORGOT VIEW ══ */}
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
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">{t('auth:emailAddress')}</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input type="email" name="email" placeholder={t('auth:emailPlaceholder')} required
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 text-sm" />
                    </div>
                  </div>
                  <Button type="submit" fullWidth disabled={emailLoading} className="h-12 mt-2 text-sm font-black shadow-xl rounded-xl">
                    {emailLoading ? t('common:processing') : t('auth:sendResetCode')}
                  </Button>
                </form>
                <div className="mt-4 text-center">
                  <button type="button" onClick={() => setView('login')} className="text-sm hover:underline" style={{ color: '#f43f5e' }}>{t('auth:backTo')}</button>
                </div>
              </>
            )}

            {/* ══ LOGIN / REGISTER ══ */}
            {(view === 'login' || view === 'register') && (
              <>
                <div className="text-center mb-8 -mt-6 md:mt-0 md:mb-6">
                  <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">
                    {view === 'login' ? t('auth:welcome') : t('auth:createAccount')}
                  </h2>
                </div>

                {errorMsg && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4 text-sm">
                    <AlertCircle size={16} className="flex-shrink-0" /><span>{errorMsg}</span>
                  </div>
                )}

                {/* Google button */}
                <div className="relative mb-4 mt-3">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={googleLoading || emailLoading}
                    className="w-full flex items-center justify-center gap-3 p-4 bg-white/40 hover:bg-white/80 text-gray-800 font-bold rounded-xl transition-all border border-gray-200 shadow-sm hover:shadow-lg hover:-translate-y-1 disabled:opacity-50"
                  >
                    {googleLoading ? (
                      <svg className="animate-spin w-5 h-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    ) : (
                      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                    )}
                    <span className="text-base">{googleLoading ? t('common:processing') : t('auth:googleContinue')}</span>
                  </button>

                  {lastAuthMethod === 'google' && !googleLoading && (
                    <span className="absolute -top-3.5 -right-1 translate-x-1 inline-flex items-center gap-1 bg-gray-900 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shadow-md pointer-events-none">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                      {t('auth:lastUsed')}
                    </span>
                  )}
                </div>

                <div className="relative mb-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-100" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-4 text-gray-400 font-black tracking-widest">{t('auth:emailContinue')}</span>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  {view === 'register' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase ml-1">{t('auth:fullName')}</label>
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input type="text" name="name" placeholder={t('auth:namePlaceholder')} required
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 text-sm" />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">{t('auth:emailAddress')}</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input type="email" name="email" placeholder={t('auth:emailPlaceholder')} required
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 text-sm" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">{t('auth:password')}</label>
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

                  <Button type="submit" fullWidth disabled={emailLoading || googleLoading} className="h-12 mt-4 text-sm font-black shadow-xl rounded-xl">
                    {emailLoading ? t('common:processing') : (view === 'login' ? t('common:signIn') : t('auth:createAccount'))}
                  </Button>
                </form>

                <div className="mt-4 text-center">
                  <button onClick={() => setView(view === 'login' ? 'register' : 'login')} type="button"
                    className="text-sm font-black hover:underline text-primary-600">
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