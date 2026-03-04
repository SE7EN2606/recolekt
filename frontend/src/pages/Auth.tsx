import { API_BASE } from "../utils/api";
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, ArrowLeft, AlertCircle, KeyRound } from 'lucide-react';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { useGoogleLogin } from '@react-oauth/google'; // ✅ Added this
import LogoWhite from '../assets/recolekt_logo_white.png';

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  if (!b) return `/${p}`;
  return `${b}/${p}`;
}

type ViewState = 'login' | 'register' | 'forgot' | 'reset' | 'verify';

export const Auth: React.FC = () => {
  const [view, setView] = useState<ViewState>('login');
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation(['auth', 'common']); 
  
  const [resetEmail, setResetEmail] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const navigate = useNavigate();
  // ✅ Using verifyGoogleToken instead of signInWithGoogle
  const { user, verifyGoogleToken, loginUser, registerUser } = useAuth();

  useEffect(() => {
    if (user && view !== 'verify') {
      navigate('/gallery', { replace: true });
    }
  }, [user, navigate, view]);

  // ✅ NEW: Google Login Hook configuration
  const loginWithGoogle = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        await verifyGoogleToken(tokenResponse.access_token);
        navigate('/gallery');
      } catch (err) {
        console.error("Google login failed", err);
        alert("Google authentication failed.");
      } finally {
        setLoading(false);
      }
    },
    onError: () => alert("Google login was cancelled or failed.")
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = (formData.get('email') as string) || '';
    const password = (formData.get('password') as string) || '';
    const name = (formData.get('name') as string) || '';
    const code = (formData.get('code') as string) || '';

    try {
      if (view === 'login') {
        const res = await loginUser(email, password);
        if (res) navigate('/gallery');
      } else if (view === 'register') {
        const res = await registerUser(email, password, name);
        if (res) {
          setVerificationEmail(email);
          setRegPassword(password);
          setView('verify');
        }
      } else if (view === 'forgot') {
        const res = await fetch(joinUrl(API_BASE, '/api/auth/forgot-password'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        if (res.ok) { setResetEmail(email); setView('reset'); }
      } else if (view === 'verify') {
        const res = await fetch(joinUrl(API_BASE, '/api/auth/verify-email'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: verificationEmail, code })
        });
        if (res.ok) {
          await loginUser(verificationEmail, regPassword);
          setTimeout(() => window.location.href = '/gallery', 100);
        }
      }
    } catch (error: any) {
      alert(error.message || t('common:errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative bg-white flex flex-col md:flex-row">
      <div className="fixed inset-0 flex pointer-events-none">
        <div className="hidden md:block w-1/2 h-full bg-[#0B0F19] relative"></div>
        <div className="w-full md:w-1/2 h-full bg-white"></div>
      </div>
      <div className="relative z-10 w-full max-w-[1280px] mx-auto min-h-screen flex flex-col md:flex-row px-6 md:px-8">
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

        <div className="w-full md:w-1/2 flex flex-col justify-start items-center h-full relative pl-0 md:pl-16 pt-24 md:pt-18">
            <div className="w-full max-w-sm">
                
                <div className="text-center mb-6">
                  <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">
                    {view === 'login' ? t('auth:welcome') : t('auth:createAccount')}
                  </h2>
                </div>

                <button 
                  type="button" // Important
                  onClick={() => loginWithGoogle()} // ✅ Attached the hook here
                  disabled={loading}
                  className="group w-full flex items-center justify-center gap-3 p-3 mb-4 bg-white/40 hover:bg-white/80 text-gray-800 font-bold rounded-xl transition-all border border-gray-200 shadow-sm hover:shadow-lg hover:-translate-y-1 disabled:opacity-50"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                  <span>{loading ? t('common:processing') : t('auth:googleContinue')}</span>
                </button>
                
                <div className="relative mb-6">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-gray-400 font-black tracking-widest">{t('auth:emailContinue')}</span></div>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-3">
                  {view === 'register' && (
                     <div className="space-y-1">
                       <label className="text-[10px] font-black text-gray-400 uppercase ml-1">{t('auth:fullName')}</label>
                       <div className="relative">
                         <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                         <input type="text" name="name" placeholder="John Doe" required className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 text-sm" />
                       </div>
                     </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">{t('auth:emailAddress')}</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input type="email" name="email" placeholder="name@example.com" required className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 text-sm" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">{t('auth:password')}</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input type="password" name="password" placeholder="••••••••" required className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 text-sm" />
                    </div>
                  </div>

                  <Button type="submit" fullWidth disabled={loading} className="h-12 mt-4 text-sm font-black shadow-xl rounded-xl">
                    {loading ? t('common:processing') : (view === 'login' ? t('common:signIn') : t('auth:createAccount'))}
                  </Button>
                </form>

                <div className="mt-4 text-center">
                  <button onClick={() => setView(view === 'login' ? 'register' : 'login')} type="button" className="text-sm font-black hover:underline text-primary-600">
                    {view === 'login' ? t('auth:noAccount') : t('auth:backTo')}
                  </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};