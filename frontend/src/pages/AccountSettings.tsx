import { API_BASE } from "../utils/api";
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Globe, Crown, Video, LogOut, HelpCircle, Info, Moon, Sun, Check, Zap, Infinity, ChartPie, Activity, AlertTriangle, BarChart3, Instagram, Copy, CheckCircle, Loader2, RefreshCw, Link2 } from 'lucide-react';
import { Button } from '../components/Button';
import { ConfirmModal } from '../components/ConfirmModal';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../context/LanguageContext'; // If you use a custom context for language

interface MistralLimits {
  status: string;
  remaining_requests?: string;
  total_limit?: string;
  reset_seconds?: string;
  model?: string;
  error?: string;
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

  // Instagram linking state
  const [igLinked, setIgLinked] = useState(false);
  const [igPin, setIgPin] = useState('');
  const [igPinExpiry, setIgPinExpiry] = useState(0);
  const [igLinkState, setIgLinkState] = useState<'idle' | 'generating' | 'waiting' | 'linked' | 'error'>('idle');
  const [igCopied, setIgCopied] = useState(false);

  const isPro = false;
  const clipsUsed = 4;
  const clipsLimit = 5;

  // ✅ Fetch Mistral rate limits
  useEffect(() => {
    fetch('/api/rate-limits')
      .then(res => res.json())
      .then((data: MistralLimits) => {
        setMistralLimits(data);
        setLoadingLimits(false);
      })
      .catch(err => {
        console.error('Failed to load Mistral limits:', err);
        setLoadingLimits(false);
      });
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Check Instagram link status on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (!token) return;
    fetch(`${API_BASE}/api/auth/instagram/link-status`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(d => { if (d.linked) { setIgLinked(true); setIgLinkState('linked'); } })
      .catch(() => {});
  }, []);

  // Countdown timer for PIN expiry
  useEffect(() => {
    if (igLinkState !== 'waiting' || igPinExpiry <= 0) return;
    const t = setTimeout(() => setIgPinExpiry(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [igLinkState, igPinExpiry]);

  // Poll for link confirmation
  useEffect(() => {
    if (igLinkState !== 'waiting') return;
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/instagram/link-status`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.linked) {
          setIgLinked(true);
          setIgLinkState('linked');
          clearInterval(interval);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [igLinkState]);

  const generateIgPin = async () => {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    setIgLinkState('generating');
    try {
      const res = await fetch(`${API_BASE}/api/auth/instagram/generate-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.pin) {
        setIgPin(data.pin);
        setIgPinExpiry(data.expires_in || 900);
        setIgLinkState('waiting');
      } else {
        setIgLinkState('error');
      }
    } catch {
      setIgLinkState('error');
    }
  };

  const copyIgPin = () => {
    navigator.clipboard.writeText(igPin).catch(() => {});
    setIgCopied(true);
    setTimeout(() => setIgCopied(false), 2000);
  };

  const openInstagramDM = () => {
    navigator.clipboard.writeText(igPin).catch(() => {});
    window.open('https://www.instagram.com/direct/t/recolekt', '_blank');
  };

  const formatPinTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

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

  // ✅ Mistral Status Badge
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

      {/* Single Column Layout */}
      <div className="space-y-6">
        {/* Profile Card */}
        <div className="bg-white rounded-3xl shadow-sm p-6 md:p-8 border border-gray-100">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-dark-900 rounded-full flex items-center justify-center text-white text-2xl font-black shadow-lg">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1">
              <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">{user?.name || 'User'}</h2>
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">{t('settings:personalAccount', 'Personal Account')}</p>
            </div>
          </div>
          
          <Button 
            variant="outline" 
            fullWidth 
            className="rounded-full py-3 border-gray-200 text-gray-900 font-bold text-sm bg-white hover:bg-gray-50 mt-6"
            onClick={() => navigate('/account-settings')}
          >
            <User size={16} className="mr-2" /> {t('settings:editProfile', 'Edit Profile')}
          </Button>
        </div>

        {/* Current Plan & Usage Card */}
        <div className="bg-white rounded-3xl shadow-sm p-6 md:p-8 border border-gray-100">
          <div className="flex items-start justify-between mb-6">
            <h3 className="text-xl font-black text-gray-900">{t('settings:currentPlan', 'Current Plan')}</h3>
            <span 
              className={`px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest text-white shadow-lg ${
                isPro 
                  ? 'bg-[#8b5cf6] shadow-purple-500/20' 
                  : 'bg-[#f43f5e] shadow-rose-500/20'
              }`}
            >
              {isPro ? t('settings:pro', 'PRO') : t('settings:free', 'FREE')}
            </span>
          </div>

          {!isPro && (
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('settings:usageLimit', 'Usage Limit')}</span>
              <span className="text-[#f43f5e] text-xs font-bold">
                {t('settings:clipsLeft', 'Only {{count}} clips left', { count: clipsLimit - clipsUsed })}
              </span>
            </div>
          )}

          {!isPro && (
            <div className="relative h-3 w-full bg-gray-100 rounded-full overflow-hidden mb-6">
              <div 
                className="h-full bg-[#f43f5e] transition-all duration-700" 
                style={{ width: `${(clipsUsed / clipsLimit) * 100}%` }}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Clips Saved */}
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
              <Video size={20} className="mx-auto mb-2 text-gray-900" />
              <div className="text-xl font-black text-gray-900">{clipsUsed}</div>
              <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{t('settings:clipsSaved', 'Clips Saved')}</div>
            </div>

            {/* Limit - Always shows pie chart icon */}
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
        </div>

        {/* ✅ NEW: Mistral AI Control Panel Card */}
        <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 rounded-3xl shadow-sm p-6 md:p-8 border border-indigo-100">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                <BarChart3 size={20} className="text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900">{t('settings:aiProcessing', 'AI Processing')}</h3>
                <p className="text-sm text-gray-500">{t('settings:mistralLimits', 'Mistral API rate limits')}</p>
              </div>
            </div>
            <MistralStatus />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-white/70 backdrop-blur-sm rounded-2xl border border-gray-100 text-center">
              <Activity size={24} className="mx-auto mb-2 text-indigo-600" />
              <div className="text-lg font-black text-gray-900">{mistralLimits?.remaining_requests || '—'}</div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t('settings:remaining', 'Remaining')}</div>
            </div>
            <div className="p-4 bg-white/70 backdrop-blur-sm rounded-2xl border border-gray-100 text-center">
              <BarChart3 size={24} className="mx-auto mb-2 text-purple-600" />
              <div className="text-lg font-black text-gray-900">{mistralLimits?.total_limit || '—'}</div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t('settings:totalLimit', 'Total Limit')}</div>
            </div>
            <div className="p-4 bg-white/70 backdrop-blur-sm rounded-2xl border border-gray-100 text-center">
              <Activity size={24} className="mx-auto mb-2 text-pink-600" />
              <div className="text-lg font-black text-gray-900">{mistralLimits?.reset_seconds || '—'}s</div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t('settings:reset', 'Reset')}</div>
            </div>
          </div>

          <div className="text-center">
            <Button 
              variant="outline" 
              className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold"
              onClick={() => window.open('https://console.mistral.ai/', '_blank')}
            >
              {t('settings:openMistralConsole', 'Open Mistral Console')}
            </Button>
          </div>
        </div>

        {/* Dark Promo Card - Only show for FREE users */}
        {!isPro && (
          <div className="bg-dark-900 rounded-3xl shadow-xl shadow-dark-900/20 p-6 md:p-8 text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-600/20 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2"></div>
            
            <div className="relative z-10">
              <h3 className="text-2xl md:text-3xl font-black mb-6">{t('settings:unlockUnlimited', 'Unlock Unlimited Clips')}</h3>
              
              <div className="space-y-3 mb-8">
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <Check size={16} className="text-green-400 flex-shrink-0" />
                  <span>{t('settings:featureUnlimited', 'Unlimited videos & collections')}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <Check size={16} className="text-green-400 flex-shrink-0" />
                  <span>{t('settings:featureAi', 'AI-powered auto-categorization')}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <Check size={16} className="text-green-400 flex-shrink-0" />
                  <span>{t('settings:featureSearch', 'Advanced search & filters')}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <Check size={16} className="text-green-400 flex-shrink-0" />
                  <span>{t('settings:featureSupport', 'Priority support')}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <Check size={16} className="text-green-400 flex-shrink-0" />
                  <span>{t('settings:featureExport', 'Export your collection anytime')}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <Check size={16} className="text-green-400 flex-shrink-0" />
                  <span>{t('settings:featureEarlyAccess', 'Early access to new features')}</span>
                </div>
              </div>

              <Button 
                fullWidth
                className="bg-white text-dark-900 hover:bg-[#8b5cf6] hover:text-white font-black border-transparent shadow-lg shadow-white/10 py-4 text-base transition-all"
                onClick={() => navigate('/billing')}
              >
                <Zap size={18} className="text-yellow-500 fill-current mr-2" /> {t('settings:upgradePro', 'Upgrade to Pro')}
              </Button>
            </div>
          </div>
        )}

        {/* Instagram Drop Box Card */}
        <div className="bg-white rounded-3xl shadow-sm p-6 md:p-8 border border-gray-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 rounded-2xl flex items-center justify-center shadow-lg">
              <Instagram size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900">Instagram Drop Box</h3>
              <p className="text-sm text-gray-400">Save reels by DMing @recolekt</p>
            </div>
          </div>

          {/* LINKED */}
          {igLinkState === 'linked' && (
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-2xl border border-green-100">
              <CheckCircle size={20} className="text-green-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-green-800">Instagram linked!</p>
                <p className="text-xs text-green-600">DM any reel URL to <span className="font-bold">@recolekt</span> to save it instantly.</p>
              </div>
            </div>
          )}

          {/* IDLE */}
          {igLinkState === 'idle' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Link your Instagram to save reels by simply DMing their URL to <span className="font-bold text-gray-800">@recolekt</span>.</p>
              <button
                onClick={generateIgPin}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white font-bold rounded-xl text-sm shadow-md"
              >
                <Link2 size={16} />
                Link Instagram Account
              </button>
            </div>
          )}

          {/* GENERATING */}
          {igLinkState === 'generating' && (
            <div className="flex items-center justify-center gap-2 py-6 text-gray-400 text-sm">
              <Loader2 size={18} className="animate-spin" />
              Generating your code...
            </div>
          )}

          {/* WAITING FOR DM */}
          {igLinkState === 'waiting' && (
            <div className="space-y-4">
              <ol className="text-sm text-gray-600 space-y-2">
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                  <span>Copy the code below and open Instagram</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                  <span>Send it as a DM to <span className="font-bold text-gray-900">@recolekt</span></span>
                </li>
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                  <span>Come back — we'll detect it automatically</span>
                </li>
              </ol>

              <div className="bg-gray-50 border border-gray-100 rounded-2xl py-5 px-6 flex flex-col items-center gap-1">
                <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Your PIN</span>
                <span className="font-mono text-4xl font-black tracking-[0.4em] text-gray-900">{igPin}</span>
                <span className="text-xs text-gray-400">Expires in {formatPinTime(igPinExpiry)}</span>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={openInstagramDM}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white font-bold rounded-xl text-sm"
                >
                  <Instagram size={16} />
                  Copy PIN & open Instagram
                </button>
                <button
                  onClick={copyIgPin}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-colors"
                >
                  {igCopied ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
                  {igCopied ? 'Copied!' : 'Copy PIN only'}
                </button>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                <Loader2 size={12} className="animate-spin" />
                Waiting for your DM...
              </div>
            </div>
          )}

          {/* ERROR */}
          {igLinkState === 'error' && (
            <div className="space-y-3">
              <p className="text-sm text-red-500">Something went wrong. Please try again.</p>
              <button onClick={generateIgPin} className="flex items-center gap-2 text-sm font-bold text-gray-700">
                <RefreshCw size={14} /> Try again
              </button>
            </div>
          )}
        </div>

        {/* Two Columns at Bottom: Preferences (60%) + Resources (40%) */}
        <div className="grid md:grid-cols-[1.5fr_1fr] gap-6">
          {/* App Preferences - 60% */}
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
                    {t('settings:english', 'English')}
                  </button>
                  <button
                    onClick={() => i18n.changeLanguage('fr')}
                    className={`px-3 py-1.5 rounded-md text-xs font-black transition-all ${lang === 'FR' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'}`}
                  >
                    {t('settings:french', 'Français')}
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

              {/* Sign Out Button - Desktop only */}
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

          {/* Resources - 40% */}
          <section>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 mb-3">{t('settings:resources', 'Resources')}</h3>
            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm p-1">
              <SettingItem icon={HelpCircle} label={t('settings:helpSupport', 'Help & Support')} onClick={() => navigate('/help?section=how-to')} />
              <SettingItem icon={Info} label={t('settings:about', 'About Recolekt')} onClick={() => navigate('/help?section=about')} />
            </div>
          </section>
        </div>

        {/* Sign Out Button - Mobile only, outside at bottom */}
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