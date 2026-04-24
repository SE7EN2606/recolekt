import { API_BASE } from "../utils/api";
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Video, LogOut, HelpCircle, Info, Moon, Sun, Check, Zap, Infinity, ChartPie, Activity, AlertTriangle, BarChart3, Instagram, CheckCircle, Loader2, Unlink, Youtube, Smartphone, Facebook } from 'lucide-react';
import { Button } from '../components/Button';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { InstagramLink } from '../components/InstagramLink'; 

interface MistralLimits {
  status: string;
  remaining_requests?: string;
  total_limit?: string;
  reset_seconds?: string;
  model?: string;
  error?: string;
}

interface PlatformStats {
  total: number;
  instagram: number;
  youtube: number;
  tiktok: number;
  facebook: number;
}

export const AccountSettings: React.FC = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { t, i18n } = useTranslation(['settings', 'common']);
  const [darkMode, setDarkMode] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [mistralLimits, setMistralLimits] = useState<MistralLimits | null>(null);
  const [loadingLimits, setLoadingLimits] = useState(true);

  const lang = i18n.language.toUpperCase().startsWith('FR') ? 'FR' : 'EN';

  // ─── INSTAGRAM DROP BOX STATE ───
  const [igLinked, setIgLinked] = useState(false);
  const [igUnlinking, setIgUnlinking] = useState(false);

  // ─── DYNAMIC USAGE & PLAN STATE ───
  const isPro = false;
  const clipsLimit = 500;
  
  // Real dynamic stats state
  const [platformStats, setPlatformStats] = useState<PlatformStats>({
    total: 0, instagram: 0, youtube: 0, tiktok: 0, facebook: 0
  });

  // Fetch actual video stats from backend
  useEffect(() => {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (!token) return;

    // Call your backend API to get the real counts
    fetch(`${API_BASE}/api/user/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.stats) {
          setPlatformStats(data.stats);
        }
      })
      .catch(err => console.error("Failed to fetch stats:", err));
  }, []);

  useEffect(() => {
    fetch('/api/rate-limits')
      .then(res => res.json())
      .then((data: MistralLimits) => { setMistralLimits(data); setLoadingLimits(false); })
      .catch(() => setLoadingLimits(false));
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Fetch initial IG Link Status
  useEffect(() => {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (!token) return;
    fetch(`${API_BASE}/api/auth/instagram/link-status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.linked) { setIgLinked(true); } })
      .catch(() => {});
  }, []);

  // ─── ACTIONS ───
  const unlinkInstagram = async () => {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    setIgUnlinking(true);
    try {
      await fetch(`${API_BASE}/api/auth/instagram/unlink`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      setIgLinked(false);
    } catch {}
    setIgUnlinking(false);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const SettingItem = ({ icon: Icon, label, onClick, badge, variant = 'default', rightContent }: any) => (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-between p-5 transition-colors border-b border-gray-50 last:border-0 rounded-xl mb-1
        ${variant === 'promo' ? 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/20' : 'bg-white hover:bg-gray-50 text-gray-900'}
      `}
    >
      <div className="flex items-center gap-4">
        <div className={`p-2.5 rounded-xl ${variant === 'promo' ? 'bg-white/20 text-white' : 'bg-gray-50 text-gray-500'}`}>
          <Icon size={20} />
        </div>
        <span className={`font-bold text-sm`}>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {rightContent}
        {badge && (
          <span className="px-2 py-0.5 bg-primary-600 text-white text-[9px] font-black rounded uppercase tracking-wider">
            {badge}
          </span>
        )}
      </div>
    </button>
  );

  const MistralStatus = () => {
    if (loadingLimits) return <div className="w-5 h-5 bg-gray-200 rounded-full animate-spin" />;
    
    if (mistralLimits?.status === 'error') {
      return (
        <div className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
          <AlertTriangle size={12} />
          {t('settings:error', 'Error')}
        </div>
      );
    }

    if (!mistralLimits?.remaining_requests) {
      return <span className="text-xs text-gray-400">{t('settings:na', 'N/A')}</span>;
    }

    const remaining = parseInt(mistralLimits.remaining_requests);
    const total = parseInt(mistralLimits.total_limit || '0');
    const used = total - remaining;
    const percent = total > 0 ? Math.round((used / total) * 100) : 0;

    const statusColor = remaining > 20 ? 'text-green-600' : remaining > 5 ? 'text-yellow-600' : 'text-red-600';
    
    return (
      <div className="flex flex-col items-end text-xs font-bold text-gray-600 space-y-0.5">
        <span className={`${statusColor} flex items-center gap-1`}>
          {remaining}/{total}
          {remaining <= 5 && <AlertTriangle size={12} />}
        </span>
        <span className="text-[10px] text-gray-400">{t('settings:percentUsed', '{{percent}}% used', { percent })}</span>
        <span className="text-[9px] text-gray-400">{mistralLimits.model}</span>
      </div>
    );
  };

  return (
    <div className="w-full pt-8 md:pt-0 pb-0 md:pb-6">
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {t('settings:title', 'Settings')}
            </h1>
            <p className="text-gray-500 text-sm mt-1">{t('settings:subtitle', 'Manage your account and preferences')}</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Profile Card */}
        <div className="bg-white rounded-3xl shadow-sm p-6 md:p-8 border border-gray-100">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-dark-900 rounded-full flex items-center justify-center text-white text-2xl font-black shadow-lg">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1">
              <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">{user?.name || 'User'}</h2>
              <p className="text-gray-500 text-sm mt-0.5">{user?.email || ''}</p>
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">{t('settings:personalAccount', 'Personal Account')}</p>
            </div>
          </div>
        </div>

        {/* Current Plan & Usage Card (NOW REAL DATA) */}
        <div className="bg-white rounded-3xl shadow-sm p-6 md:p-8 border border-gray-100">
          <div className="flex items-start justify-between mb-6">
            <h3 className="text-xl font-black text-gray-900">{t('settings:currentPlan', 'Current Plan')}</h3>
            <span 
              className={`px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest text-white shadow-lg ${
                isPro ? 'bg-[#8b5cf6] shadow-purple-500/20' : 'bg-[#f43f5e] shadow-rose-500/20'
              }`}
            >
              {isPro ? t('settings:pro', 'PRO') : t('settings:free', 'FREE')}
            </span>
          </div>

          {!isPro && (
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('settings:usageLimit', 'Usage Limit')}</span>
              <span className="text-[#f43f5e] text-xs font-bold">
                {clipsLimit - platformStats.total} clips left
              </span>
            </div>
          )}

          {!isPro && (
            <div className="relative h-3 w-full bg-gray-100 rounded-full overflow-hidden mb-6">
              <div 
                className="h-full bg-[#f43f5e] transition-all duration-700" 
                style={{ width: `${(platformStats.total / clipsLimit) * 100}%` }}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
              <Video size={20} className="mx-auto mb-2 text-gray-900" />
              <div className="text-xl font-black text-gray-900">{platformStats.total}</div>
              <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{t('settings:clipsSaved', 'Clips Saved')}</div>
            </div>

            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
              <ChartPie size={20} className="mx-auto mb-2 text-gray-900" />
              {isPro ? (
                <>
                  <div className="text-xl font-black text-gray-900 flex items-center justify-center gap-1">
                    <Infinity size={20} className="text-[#8b5cf6]" strokeWidth={2.5} />
                  </div>
                  <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{t('settings:unlimited', 'Unlimited')}</div>
                </>
              ) : (
                <>
                  <div className="text-xl font-black text-gray-900">{clipsLimit}</div>
                  <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{t('settings:limit', 'Limit')}</div>
                </>
              )}
            </div>
          </div>

          {/* REAL Platform Breakdown Stats */}
          <div className="pt-6 border-t border-gray-50">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Sources Breakdown</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-pink-50 text-pink-600 rounded-lg"><Instagram size={18} /></div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{platformStats.instagram}</p>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Instagram</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-50 text-red-600 rounded-lg"><Youtube size={18} /></div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{platformStats.youtube}</p>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">YouTube</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 text-gray-900 rounded-lg"><Smartphone size={18} /></div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{platformStats.tiktok}</p>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">TikTok</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Facebook size={18} /></div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{platformStats.facebook}</p>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Facebook</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Instagram Drop Box */}
        <div className="bg-white rounded-3xl shadow-sm p-6 md:p-8 border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 rounded-2xl flex items-center justify-center shadow-lg">
                <Instagram size={20} className="text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900">Instagram Drop Box</h3>
                <p className="text-sm text-gray-400">Save reels by DMing @recolekt</p>
              </div>
            </div>
            
            {igLinked && (
              <button
                onClick={unlinkInstagram}
                disabled={igUnlinking}
                className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-500 hover:bg-red-50 font-bold rounded-xl text-sm transition-colors disabled:opacity-50"
              >
                {igUnlinking ? <Loader2 size={16} className="animate-spin" /> : <Unlink size={16} />}
                {igUnlinking ? 'Disconnecting...' : 'Disconnect'}
              </button>
            )}
          </div>

          {igLinked ? (
            <div className="flex items-start gap-3 p-4 bg-green-50 rounded-2xl border border-green-100">
              <CheckCircle size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-green-800">Instagram linked!</p>
                <p className="text-xs text-green-600 mt-0.5">DM any reel URL to <strong className="font-bold">@recolekt</strong> to save it instantly.</p>
              </div>
            </div>
          ) : (
            <div className="border border-gray-100 rounded-2xl overflow-hidden">
              <InstagramLink 
                authToken={localStorage.getItem('auth_token') || localStorage.getItem('token') || ''} 
                onLinked={() => setIgLinked(true)} 
              />
            </div>
          )}
        </div>

        {/* Two Columns at Bottom: Preferences (60%) + Resources (40%) */}
        <div className="grid md:grid-cols-[1.5fr_1fr] gap-6">
          <section>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 mb-3">{t('settings:preferences', 'Preferences')}</h3>
            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm p-1">
              {/* Language Toggle */}
              <div className="w-full flex items-center justify-between p-5 transition-colors border-b border-gray-50 rounded-xl mb-1">
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-xl bg-gray-50 text-gray-500">
                    <Globe size={20} />
                  </div>
                  <span className="font-bold text-sm">{t('settings:language', 'Language')}</span>
                </div>
                <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => i18n.changeLanguage('en')}
                    className={`px-3 py-1.5 rounded-md text-xs font-black transition-all ${lang === 'EN' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'}`}
                  >
                    English
                  </button>
                  <button
                    onClick={() => i18n.changeLanguage('fr')}
                    className={`px-3 py-1.5 rounded-md text-xs font-black transition-all ${lang === 'FR' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'}`}
                  >
                    Français
                  </button>
                </div>
              </div>

              {/* Dark Mode Toggle */}
              <div className="w-full flex items-center justify-between p-5 transition-colors rounded-xl mb-1">
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-xl bg-gray-50 text-gray-500">
                    {darkMode ? <Moon size={20} /> : <Sun size={20} />}
                  </div>
                  <span className="font-bold text-sm">{t('settings:darkMode', 'Dark Mode')}</span>
                </div>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${darkMode ? 'bg-primary-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="hidden md:block p-5">
                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white border border-red-200 text-red-600 rounded-xl font-bold text-sm hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors shadow-sm"
                >
                  <LogOut size={16} /> {t('settings:signOut', 'Sign Out')}
                </button>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 mb-3">{t('settings:resources', 'Resources')}</h3>
            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm p-1">
              <SettingItem icon={HelpCircle} label={t('settings:helpSupport', 'Help & Support')} onClick={() => navigate('/help?section=how-to')} />
              <SettingItem icon={Info} label={t('settings:about', 'About Recolekt')} onClick={() => navigate('/help?section=about')} />
            </div>
          </section>
        </div>

        <div className="md:hidden">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white border border-red-200 text-red-600 rounded-xl font-bold text-sm hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors shadow-sm mb-24"
          >
            <LogOut size={16} /> {t('settings:signOut', 'Sign Out')}
          </button>
        </div>
      </div>

      <ConfirmModal 
        isOpen={showLogoutConfirm} 
        onClose={() => setShowLogoutConfirm(false)} 
        onConfirm={handleLogout} 
        title={t('settings:signOut', 'Sign Out')} 
        message={t('settings:signOutConfirm', 'Are you sure you want to log out?')} 
        confirmLabel={t('settings:signOut', 'Sign Out')} 
      />
    </div>
  );
};