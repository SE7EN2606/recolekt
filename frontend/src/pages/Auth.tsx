import { API_BASE } from "../utils/api";
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, ShieldAlert } from 'lucide-react';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import LogoWhite from '../assets/recolekt_logo_white.png';

export const Auth: React.FC = () => {
  const [view, setView] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation(['auth', 'common']); 
  
  const navigate = useNavigate();
  const { user, signInWithGoogle, loginUser, registerUser } = useAuth();

  // 🛑 HARD STAGING CHECK
  const isStaging = window.location.hostname.includes('staging') || window.location.hostname.includes('netlify.app');

  useEffect(() => {
    if (user) {
      navigate('/gallery', { replace: true });
    }
  }, [user, navigate]);

  // ==========================================
  // ☢️ STAGING ADMIN UI: ONLY EMAIL/PASSWORD LOGIN
  // ==========================================
  if (isStaging) {
    const handleAdminSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setLoading(true);
      const formData = new FormData(e.currentTarget);
      const email = (formData.get('email') as string) || '';
      const password = (formData.get('password') as string) || '';

      try {
        const res = await loginUser(email, password);
        if (res) {
          navigate('/gallery');
        } else {
          throw new Error("Invalid admin credentials");
        }
      } catch (error: any) {
        alert(error.message || "Authentication failed");
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="min-h-screen w-full bg-[#0B0F19] flex items-center justify-center px-4 relative">
        <div className="absolute top-8 left-8">
          <Link to="/" className="inline-block hover:opacity-80 transition-opacity">
            <img src={LogoWhite} alt="recolekt" className="h-8 object-contain opacity-50" />
          </Link>
        </div>
        
        <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <ShieldAlert size={40} className="text-red-600 mb-3" />
            <h2 className="text-2xl font-black text-gray-900 tracking-widest uppercase text-center">Admin Login</h2>
            <p className="text-gray-500 text-sm mt-1 font-medium text-center">Staging Environment</p>
          </div>

          <form onSubmit={handleAdminSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input type="email" name="email" required className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-red-100 focus:border-red-500 text-sm font-medium" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input type="password" name="password" required className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-red-100 focus:border-red-500 text-sm font-medium" />
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full h-12 mt-6 text-sm font-black shadow-xl rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors border-none disabled:opacity-50">
              {loading ? 'AUTHENTICATING...' : 'SECURE LOGIN'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // 🟢 PRODUCTION UI: FULL AUTH PAGE
  // ==========================================
  const handleProdSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = (formData.get('email') as string) || '';
    const password = (formData.get('password') as string) || '';
    const name = (formData.get('name') as string) || '';

    try {
      if (view === 'login') {
        const res = await loginUser(email, password);
        if (res) navigate('/gallery');
      } else if (view === 'register') {
        const res = await registerUser(email, password, name);
        if (res) {
          await loginUser(email, password);
          navigate('/gallery');
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
                  onClick={signInWithGoogle} 
                  className="group w-full flex items-center justify-center gap-3 p-3 mb-4 bg-white/40 hover:bg-white/80 text-gray-800 font-bold rounded-xl transition-all border border-gray-200 shadow-sm hover:shadow-lg hover:-translate-y-1"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                  <span>{t('auth:googleContinue')}</span>
                </button>
                
                <div className="relative mb-6">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-gray-400 font-black tracking-widest">{t('auth:emailContinue')}</span></div>
                </div>
                
                <form onSubmit={handleProdSubmit} className="space-y-3">
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