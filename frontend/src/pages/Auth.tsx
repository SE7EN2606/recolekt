import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, ArrowLeft, AlertCircle, KeyRound } from 'lucide-react';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';

import LogoWhite from '../assets/recolekt_logo_white.png';

const RAW_API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:5001';

const API_BASE = String(RAW_API_BASE).replace(/\/+$/, '');

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  if (!b) return `/${p}`;
  return `${b}/${p}`;
}

const DownloadIcon = ({ color }: { color: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>
  </svg>
);

type ViewState = 'login' | 'register' | 'forgot' | 'reset' | 'verify';

export const Auth: React.FC = () => {
  const [view, setView] = useState<ViewState>('login');
  const [hasPendingVideo, setHasPendingVideo] = useState(false);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation(['auth', 'common']); 
  
  const [resetEmail, setResetEmail] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const navigate = useNavigate();
  const { user, signInWithGoogle, loginUser, registerUser } = useAuth();

  useEffect(() => {
    if (localStorage.getItem('pendingVideoUrl')) setHasPendingVideo(true);
  }, []);

  useEffect(() => {
    if (user && view !== 'verify') {
      navigate('/gallery', { replace: true });
    }
  }, [user, navigate, view]);

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
        if (res) setTimeout(() => window.location.href = '/gallery', 100);
        else throw new Error("Authentication failed");
        
      } else if (view === 'register') {
        const res = await registerUser(email, password, name);
        if (res) {
          setVerificationEmail(email);
          setRegPassword(password);
          setView('verify');
        } else throw new Error("Registration failed");

      } else if (view === 'forgot') {
        const response = await fetch(joinUrl(API_BASE, '/api/auth/forgot-password'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        if (response.ok) {
          setResetEmail(email);
          setView('reset');
        } else throw new Error("Failed to send reset code");

      } else if (view === 'reset') {
        const response = await fetch(joinUrl(API_BASE, '/api/auth/reset-password'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: resetEmail, code, password })
        });
        const data = await response.json();
        if (response.ok) {
          alert(t('auth:resetSuccess'));
          setView('login');
        } else throw new Error(data.error || "Failed to reset password");

      } else if (view === 'verify') {
        const response = await fetch(joinUrl(API_BASE, '/api/auth/verify-email'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: verificationEmail, code })
        });
        const data = await response.json();
        if (response.ok) {
          await loginUser(verificationEmail, regPassword);
          setTimeout(() => window.location.href = '/gallery', 100);
        } else throw new Error(data.error || "Invalid code");
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
            <p className="text-gray-400 text-lg leading-relaxed font-medium">
              {t('auth:creatorsJoin')}
            </p>
          </div>
          <div className="flex gap-4 text-xs font-black uppercase tracking-widest text-gray-500">
            <span>© 2025 recolekt</span>
            <Link to="/help" className="hover:text-white transition-colors">{t('auth:help')}</Link>
            <Link to="/help?section=contact" className="hover:text-white transition-colors">{t('auth:contact')}</Link>
          </div>
        </div>

        <div className="w-full md:w-1/2 flex flex-col justify-start items-center h-full relative pl-0 md:pl-16 pt-24 md:pt-18">
            <div className="hidden md:block absolute top-12 right-0">
               <Link to="/" className="flex items-center gap-2 text-gray-400 hover:text-gray-900 font-bold text-sm transition-colors">
                  <ArrowLeft size={16} /> {t('common:backToHome')}
               </Link>
            </div>

            <div className="w-full max-w-sm">
                
                {hasPendingVideo && view !== 'verify' && (
                  <div className="mt-8 mb-4 p-3 rounded-xl flex items-center justify-center gap-2 border transition-all" style={{ backgroundColor: view === 'login' ? 'rgba(225, 29, 72, 0.05)' : 'rgba(139, 92, 246, 0.05)', borderColor: view === 'login' ? 'rgba(225, 29, 72, 0.2)' : 'rgba(139, 92, 246, 0.2)', color: view === 'login' ? '#e11d48' : '#8b5cf6' }}>
                    {view === 'login' ? <AlertCircle size={18} /> : <DownloadIcon color="#8b5cf6" />}
                    <p className="text-xs font-bold whitespace-nowrap">
                      {view === 'login' ? t('auth:loginToSave') : t('auth:registerToSave')}
                    </p>
                  </div>
                )}

                <div className="text-center mb-6">
                  <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">
                    {view === 'login' && t('auth:welcome')}
                    {view === 'register' && t('auth:createAccount')}
                    {view === 'forgot' && t('auth:resetPassword')}
                    {view === 'reset' && t('auth:newPassword')}
                    {view === 'verify' && t('auth:verifyEmail')}
                  </h2>
                </div>

                {(view === 'login' || view === 'register') && (
                  <>
                    {/* ✅ BEAUTIFUL GLASS HOVER EFFECT APPLIED HERE */}
                    <button 
                      type="button" 
                      onClick={signInWithGoogle} 
                      className="group w-full flex items-center justify-center gap-3 p-3 mb-4 bg-white/40 hover:bg-white/80 text-gray-800 font-bold rounded-xl transition-all duration-300 border border-gray-200 hover:border-primary-200 backdrop-blur-xl shadow-sm hover:shadow-lg hover:shadow-primary-600/10 hover:-translate-y-1 active:scale-95"
                    >
                      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
                      <span>{t('auth:googleContinue')}</span>
                    </button>
                    
                    <div className="relative mb-6">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
                      <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-gray-400 font-black tracking-widest">{t('auth:emailContinue')}</span></div>
                    </div>
                  </>
                )}

                <form onSubmit={handleSubmit} className="space-y-3">
                   {view === 'register' && (
                     <div className="space-y-1">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">{t('auth:fullName')}</label>
                       <div className="relative">
                         <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                         <input type="text" name="name" placeholder="John Doe" required className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 font-medium text-sm" />
                       </div>
                     </div>
                   )}

                   {(view === 'login' || view === 'register' || view === 'forgot') && (
                     <div className="space-y-1">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">{t('auth:emailAddress')}</label>
                       <div className="relative">
                         <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                         <input type="email" name="email" placeholder="name@example.com" required className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 font-medium text-sm" />
                       </div>
                     </div>
                   )}

                   {(view === 'reset' || view === 'verify') && (
                     <div className="space-y-1">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">6-Digit Code</label>
                       <div className="relative">
                         <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                         <input type="text" name="code" placeholder="123456" maxLength={6} required className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 font-bold tracking-[0.5em] text-center text-lg" />
                       </div>
                     </div>
                   )}

                   {(view === 'login' || view === 'register' || view === 'reset') && (
                     <div className="space-y-1">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">
                         {view === 'reset' ? t('auth:newPassword') : t('auth:password')}
                       </label>
                       <div className="relative">
                         <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                         <input type="password" name="password" placeholder="••••••••" required minLength={6} className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 font-medium text-sm" />
                       </div>
                     </div>
                   )}

                   {view === 'login' && (
                     <div className="flex justify-end">
                       <button type="button" onClick={() => setView('forgot')} className="text-xs font-bold text-gray-500 hover:text-gray-900">{t('auth:forgotPassword')}</button>
                     </div>
                   )}

                   <Button type="submit" fullWidth disabled={loading} className={`h-12 mt-4 text-sm font-black shadow-xl rounded-xl ${loading ? 'opacity-80' : ''}`}>
                     {loading ? t('common:processing') : 
                        view === 'login' ? t('common:signIn') : 
                        view === 'register' ? t('auth:createAccount') : 
                        view === 'forgot' ? t('auth:sendResetCode') :
                        view === 'reset' ? t('auth:resetPassword') :
                        t('auth:verifyAccount')
                     }
                   </Button>
                </form>

                <div className="mt-4 text-center">
                  <p className="text-gray-500 text-sm font-medium">
                    {view === 'login' ? t('auth:noAccount') : t('auth:backTo')}{' '}
                    <button onClick={() => setView(view === 'login' ? 'register' : 'login')} className="font-black hover:underline" style={{ color: '#e11d48' }}>
                      {view === 'login' ? t('common:signUp') : t('common:signIn')}
                    </button>
                  </p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};