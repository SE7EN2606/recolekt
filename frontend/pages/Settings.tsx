import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Globe, Crown, Video, LogOut, HelpCircle, Info, Moon, Sun, Check, Zap, Infinity, ChartPie } from 'lucide-react';
import { Button } from '../components/Button';
import { ConfirmModal } from '../components/ConfirmModal';
import { useData } from '../context/DataContext';

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { logout, user } = useData();
  const [lang, setLang] = useState<'EN' | 'FR'>('EN');
  const [darkMode, setDarkMode] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const isPro = user?.isPro || false;
  const clipsUsed = 4;
  const clipsLimit = 5;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleLogout = () => {
    logout();
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

  return (
    <div className="w-full pt-8 md:pt-0 pb-0 md:pb-6">
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {lang === 'EN' ? 'Settings' : 'Paramètres'}
            </h1>
            <p className="text-gray-500 text-sm mt-1">Manage your account and preferences</p>
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
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">Personal Account</p>
            </div>
          </div>
          
          <Button 
            variant="outline" 
            fullWidth 
            className="rounded-full py-3 border-gray-200 text-gray-900 font-bold text-sm bg-white hover:bg-gray-50 mt-6"
            onClick={() => navigate('/account-settings')}
          >
            <User size={16} className="mr-2" /> Edit Profile
          </Button>
        </div>

        {/* Current Plan & Usage Card */}
        <div className="bg-white rounded-3xl shadow-sm p-6 md:p-8 border border-gray-100">
          <div className="flex items-start justify-between mb-6">
            <h3 className="text-xl font-black text-gray-900">Current Plan</h3>
            <span 
              className={`px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest text-white shadow-lg ${
                isPro 
                  ? 'bg-[#8b5cf6] shadow-purple-500/20' 
                  : 'bg-[#f43f5e] shadow-rose-500/20'
              }`}
            >
              {isPro ? 'PRO' : 'FREE'}
            </span>
          </div>

          {!isPro && (
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Usage Limit</span>
              <span className="text-[#f43f5e] text-xs font-bold">
                Only {clipsLimit - clipsUsed} {clipsLimit - clipsUsed === 1 ? 'clip' : 'clips'} left
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
              <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Clips Saved</div>
            </div>

            {/* Limit - Always shows pie chart icon */}
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
              <ChartPie size={20} className="mx-auto mb-2 text-gray-900" />
              {isPro ? (
                <>
                  <div className="text-xl font-black text-gray-900 flex items-center justify-center gap-1">
                    <Infinity size={20} className="text-[#8b5cf6]" strokeWidth={2.5} />
                  </div>
                  <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Unlimited</div>
                </>
              ) : (
                <>
                  <div className="text-xl font-black text-gray-900">{clipsLimit}</div>
                  <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Limit</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Dark Promo Card - Only show for FREE users */}
        {!isPro && (
          <div className="bg-dark-900 rounded-3xl shadow-xl shadow-dark-900/20 p-6 md:p-8 text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-600/20 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2"></div>
            
            <div className="relative z-10">
              <h3 className="text-2xl md:text-3xl font-black mb-6">Unlock Unlimited Clips</h3>
              
              <div className="space-y-3 mb-8">
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <Check size={16} className="text-green-400 flex-shrink-0" />
                  <span>Unlimited videos & collections</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <Check size={16} className="text-green-400 flex-shrink-0" />
                  <span>AI-powered auto-categorization</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <Check size={16} className="text-green-400 flex-shrink-0" />
                  <span>Advanced search & filters</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <Check size={16} className="text-green-400 flex-shrink-0" />
                  <span>Priority support</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <Check size={16} className="text-green-400 flex-shrink-0" />
                  <span>Export your collection anytime</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <Check size={16} className="text-green-400 flex-shrink-0" />
                  <span>Early access to new features</span>
                </div>
              </div>

              <Button 
                fullWidth
                className="bg-white text-dark-900 hover:bg-[#8b5cf6] hover:text-white font-black border-transparent shadow-lg shadow-white/10 py-4 text-base transition-all"
                onClick={() => navigate('/billing')}
              >
                <Zap size={18} className="text-yellow-500 fill-current mr-2" /> Upgrade to Pro
              </Button>
            </div>
          </div>
        )}

        {/* Two Columns at Bottom: Preferences (60%) + Resources (40%) */}
        <div className="grid md:grid-cols-[1.5fr_1fr] gap-6">
          {/* App Preferences - 60% */}
          <section>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 mb-3">Preferences</h3>
            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm p-1">
              {/* Language Toggle */}
              <div className="w-full flex items-center justify-between p-5 transition-colors border-b border-gray-50 rounded-xl mb-1">
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-xl bg-gray-50 text-gray-500">
                    <Globe size={20} />
                  </div>
                  <span className="font-bold text-sm">Language</span>
                </div>
                <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setLang('EN')}
                    className={`px-3 py-1.5 rounded-md text-xs font-black transition-all ${lang === 'EN' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'}`}
                  >
                    English
                  </button>
                  <button
                    onClick={() => setLang('FR')}
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
                  <span className="font-bold text-sm">Dark Mode</span>
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
                  <LogOut size={16} /> Sign Out
                </button>
              </div>
            </div>
          </section>

          {/* Resources - 40% */}
          <section>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 mb-3">Resources</h3>
            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm p-1">
              <SettingItem icon={HelpCircle} label="Help & Support" onClick={() => navigate('/help?section=how-to')} />
              <SettingItem icon={Info} label="About Recolekt" onClick={() => navigate('/help?section=about')} />
            </div>
          </section>
        </div>

        {/* Sign Out Button - Mobile only, outside at bottom */}
        <div className="md:hidden">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white border border-red-200 text-red-600 rounded-xl font-bold text-sm hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors shadow-sm mb-24"
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>

      <ConfirmModal 
        isOpen={showLogoutConfirm} 
        onClose={() => setShowLogoutConfirm(false)} 
        onConfirm={handleLogout} 
        title="Sign Out" 
        message="Are you sure you want to log out?" 
        confirmLabel="Sign Out" 
      />
    </div>
  );
};
