import { API_BASE } from "../utils/api";
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, Globe, LogOut, ChevronRight, 
  HelpCircle, Info, Moon, Sun, Zap, Check, Video, Infinity, PieChart
} from 'lucide-react';
import { Button } from '../components/Button';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useTranslation } from 'react-i18next';

export const AppSettings: React.FC = () => {
  const navigate = useNavigate();
  const { signOut, user, loading, isAuthenticated, updateUserLanguage } = useAuth();
  const { videos } = useData(); 
  const { t, i18n } = useTranslation(['settings']);

  const [darkMode, setDarkMode] = React.useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);

  const currentLang = i18n.language.startsWith('fr') ? 'FR' : 'EN';

  const isPro = (user as any)?.isPro || false;
  const clipsUsed = videos ? videos.length : 0;
  const clipsLimit = 5;
  const remaining = Math.max(0, clipsLimit - clipsUsed); 
  const progressPercent = Math.min(100, (clipsUsed / clipsLimit) * 100); 

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [loading, isAuthenticated, navigate]);

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const SettingItem = ({ icon: Icon, label, onClick, badge, rightContent }: any) => (
    <button 
      onClick={onClick}
      className="
        w-full flex items-center justify-between
        px-4 md:px-5 py-4 md:py-5
        transition-colors border-b border-gray-50 last:border-0
        hover:bg-gray-50 group text-left
      "
    >
      <div className="flex items-center gap-3 md:gap-4">
        <div className="p-2 rounded-xl bg-gray-50 text-gray-500 group-hover:text-primary-600 transition-colors">
          <Icon size={18} />
        </div>
        <span className="font-bold text-sm md:text-base text-gray-900">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {rightContent}
        {badge && (
          <span className="px-2 py-0.5 bg-primary-600 text-white text-[9px] font-black rounded uppercase tracking-wider">
            {badge}
          </span>
        )}
        {!rightContent && (
          <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-400" />
        )}
      </div>
    </button>
  );

  if (loading || !user) return null;

  return (
    <div className="w-full pt-6 md:pt-0 pb-0 md:pb-6 animate-fade-in">
      {/* ✅ FIXED: Removed px-4 */}
      <div className="flex flex-col gap-4 md:gap-6 mb-6 md:mb-8 md:px-0">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">
            {t('settings:appSettings')}
          </h1>
          <p className="text-gray-500 text-xs md:text-sm mt-1">
            {t('settings:manageAccount')}
          </p>
        </div>
      </div>

      {/* ✅ FIXED: Removed px-4 */}
      <div className="space-y-5 md:space-y-6 md:px-0">
        {/* User Card */}
        <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm p-5 md:p-8 border border-gray-100">
          <div className="flex items-center gap-4 md:gap-5 mb-5 md:mb-6">
            <div className="w-14 h-14 md:w-16 md:h-16 bg-dark-900 rounded-full flex items-center justify-center text-white text-lg md:text-2xl font-black shadow-lg overflow-hidden border-2 border-white">
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                user?.name?.charAt(0).toUpperCase() || 'U'
              )}
            </div>
            <div>
              <h2 className="text-lg md:text-2xl font-black text-gray-900 tracking-tight uppercase">
                {user?.name || 'User'}
              </h2>
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">
                {t('settings:personalAccount')}
              </p>
            </div>
          </div>

          <div className="pt-6 md:pt-8 border-t border-gray-100">
            <div className="flex items-center justify-between mb-4 md:mb-6">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                {t('settings:currentPlan')}
              </span>
              <span
                className={`
                  px-3 md:px-4 py-1.5 rounded-xl
                  text-[10px] md:text-[11px]
                  font-black uppercase tracking-widest text-white shadow-lg
                  ${isPro ? 'bg-[#8b5cf6] shadow-purple-500/20' : 'bg-[#f43f5e] shadow-rose-500/20'}
                `}
              >
                {isPro ? t('settings:pro') : t('settings:free')}
              </span>
            </div>

            {isPro ? (
              <div className="bg-primary-50 rounded-2xl p-4 md:p-6 border border-primary-100 flex items-center justify-between">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="p-2.5 md:p-3 bg-white rounded-full text-primary-600 shadow-sm">
                    <Infinity size={22} />
                  </div>
                  <div>
                    <div className="font-black text-sm md:text-base text-gray-900">
                      {t('settings:unlimitedClips')}
                    </div>
                    <div className="text-[11px] md:text-xs font-medium text-primary-600">
                      {t('settings:unstoppable')}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2.5 md:mb-3">
                  <span className="text-xs md:text-sm font-bold text-gray-900">
                    {t('settings:usageLimit')}
                  </span>
                  <span className="text-[#f43f5e] text-[11px] md:text-xs font-black bg-rose-50 px-2 py-1 rounded-lg">
                    {t('settings:clipsLeft', { count: remaining })}
                  </span>
                </div>

                <div className="relative h-3.5 md:h-4 w-full bg-gray-100 rounded-full overflow-hidden mb-6 md:mb-8">
                  <div 
                    className="h-full bg-[#f43f5e] transition-all duration-700 shadow-[0_0_10px_rgba(244,63,94,0.4)]" 
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  <div className="p-3.5 md:p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                    <Video size={18} className="mx-auto mb-1.5 md:mb-2 text-gray-400" />
                    <div className="text-lg md:text-xl font-black text-gray-900">
                      {clipsUsed}
                    </div>
                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                      {t('settings:used')}
                    </div>
                  </div>
                  <div className="p-3.5 md:p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                    <PieChart size={18} className="mx-auto mb-1.5 md:mb-2 text-gray-400" />
                    <div className="text-lg md:text-xl font-black text-gray-900">
                      {clipsLimit}
                    </div>
                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                      {t('settings:limit')}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Upgrade Card */}
        {!isPro && (
          <div className="bg-dark-900 rounded-2xl md:rounded-3xl shadow-xl shadow-dark-900/20 p-5 md:p-8 text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-56 md:w-64 h-56 md:h-64 bg-primary-600/20 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2"></div>
            <div className="relative z-10">
              <h3 className="text-xl md:text-3xl font-black mb-5 md:mb-6 tracking-tight">
                {t('settings:unlockUnlimited')}
              </h3>
              <div className="space-y-2.5 md:space-y-3 mb-6 md:mb-8">
                {[t('settings:feat1'), t('settings:feat2'), t('settings:feat3')].map((feat, i) => (
                  <div key={i} className="flex items-center gap-2.5 md:gap-3 text-xs md:text-sm text-gray-300">
                    <Check size={16} className="text-green-400 flex-shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
              <Button 
                fullWidth
                className="
                  bg-white text-dark-900 hover:bg-[#8b5cf6] hover:text-white
                  font-black border-transparent shadow-lg py-3.5 md:py-4
                  text-sm md:text-base transition-all
                "
                onClick={() => navigate('/billing')}
              >
                <Zap size={18} className="text-yellow-500 fill-current mr-2" /> {t('settings:upgrade')}
              </Button>
            </div>
          </div>
        )}

        {/* Preferences & Resources */}
        <div className="grid md:grid-cols-[1.5fr_1fr] gap-5 md:gap-6">
          <section>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-1.5 md:px-2 mb-2.5 md:mb-3">
              {t('settings:preferences')}
            </h3>
            <div className="bg-white rounded-2xl md:rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
              {/* Language */}
              <div className="w-full flex items-center justify-between px-4 md:px-5 py-4 md:py-5 border-b border-gray-50">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="p-2 rounded-xl bg-gray-50 text-gray-500">
                    <Globe size={18} />
                  </div>
                  <span className="font-bold text-sm md:text-base text-gray-900">
                    {t('settings:language')}
                  </span>
                </div>
                
                {/* Dropdown Menu */}
                <div className="relative">
                  <select
                    value={i18n.language.substring(0, 2)}
                    onChange={(e) => updateUserLanguage(e.target.value)}
                    className="appearance-none bg-gray-50 border border-gray-100 text-gray-900 font-black text-xs md:text-sm rounded-xl px-4 py-2 pr-8 outline-none focus:ring-2 focus:ring-primary-100 cursor-pointer transition-all"
                  >
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <ChevronRight size={14} className="rotate-90" />
                  </div>
                </div>
              </div>

              {/* Dark Mode */}
              <div className="w-full flex items-center justify-between px-4 md:px-5 py-4 md:py-5">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="p-2 rounded-xl bg-gray-50 text-gray-500">
                    {darkMode ? <Moon size={18} /> : <Sun size={18} />}
                  </div>
                  <span className="font-bold text-sm md:text-base text-gray-900">
                    {t('settings:darkMode')}
                  </span>
                </div>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`
                    relative inline-flex h-5 md:h-6 w-10 md:w-11
                    items-center rounded-full transition-colors
                    ${darkMode ? 'bg-primary-600' : 'bg-gray-200'}
                  `}
                >
                  <span
                    className={`
                      inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                      ${darkMode ? 'translate-x-5 md:translate-x-6' : 'translate-x-1'}
                    `}
                  />
                </button>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-1.5 md:px-2 mb-2.5 md:mb-3">
              {t('settings:resources')}
            </h3>
            <div className="bg-white rounded-2xl md:rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
              <SettingItem
                icon={HelpCircle}
                label={t('settings:helpSupport')}
                onClick={() => navigate('/help?section=how-to')}
              />
              <SettingItem
                icon={Info}
                label={t('settings:about')}
                onClick={() => navigate('/help?section=about')}
              />
            </div>
          </section>
        </div>

        <div className="pb-20 md:pb-8">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="
              w-full flex items-center justify-center gap-2
              px-6 py-3.5 md:py-4
              bg-white border border-red-100
              text-red-600 rounded-2xl
              font-black text-xs md:text-sm
              hover:bg-red-600 hover:text-white
              transition-all shadow-sm
            "
          >
            <LogOut size={16} /> {t('settings:signOut')}
          </button>
        </div>
      </div>

      <ConfirmModal 
        isOpen={showLogoutConfirm} 
        onClose={() => setShowLogoutConfirm(false)} 
        onConfirm={handleLogout} 
        title={t('settings:signOut')}
        message={t('settings:confirmSignOut')}
        confirmLabel={t('settings:signOut')}
      />
    </div>
  );
};