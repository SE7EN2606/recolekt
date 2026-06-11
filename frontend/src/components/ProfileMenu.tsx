import { API_BASE } from "../utils/api";
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, 
  UserCircle, 
  Settings, 
  Crown, 
  CreditCard, 
  LogOut, 
  User, 
  ChevronRight // <--- Add this one!
} from 'lucide-react';
import { Button } from './Button';
import { AuthModal } from './AuthModal';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import LogoBlack from '../assets/recolekt_logo_black.png';


interface ProfileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}


export const ProfileMenu: React.FC<ProfileMenuProps> = ({ isOpen, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const { user, signOut, loading, isAuthenticated } = useAuth();
  const { t } = useTranslation(['header', 'settings', 'common']);
  const navigate = useNavigate();

  const meta = (user as any)?.user_metadata;
  const displayName = user?.name || meta?.full_name || 'User';
  const displayPicture = user?.picture || meta?.avatar_url;
  const initials = (displayName?.charAt?.(0) || 'U').toUpperCase();

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = '';
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleNav = (path: string) => {
    navigate(path);
    onClose();
  };

  const handleLogout = async () => {
    await signOut();
    onClose();
    navigate('/');
  };

  if (!isVisible) return null;

  return (
    <>
      <div
        className={`
          fixed inset-0 z-[100] bg-white/90 backdrop-blur-2xl md:hidden flex flex-col
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="h-[80px] flex items-center justify-between px-6 border-b border-white/20 flex-shrink-0">
          <span className="text-xl font-black text-gray-900 tracking-tight">
            {t('common:myAccount', 'My Account')}
          </span>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-gray-500 bg-white/50 rounded-full hover:bg-white/80 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 pb-24 space-y-6">

            {isAuthenticated && user ? (
              <>
                {/* User Profile Summary */}
                <div className="glass-card rounded-[32px] p-8 shadow-sm">
                  <div className="flex items-center gap-5 mb-6">
                    <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 shadow-lg border-2 border-white/60">
                      {displayPicture ? (
                        <img src={displayPicture} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center text-white text-2xl font-black">
                          {initials}
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-gray-900 tracking-tight">{displayName}</h3>
                      <p className="text-gray-500 text-sm truncate">{user?.email}</p>
                      <p className="text-primary-600 text-xs font-black uppercase tracking-widest mt-1">
                        {t('common:freeMember', 'Free Member')}
                      </p>
                    </div>
                  </div>
                  <Button
                    fullWidth
                    variant="primary"
                    className="gap-2 h-14 rounded-2xl font-black shadow-xl shadow-primary-600/20"
                    onClick={() => handleNav('/billing')}
                  >
                    <Crown size={20} />
                    {t('common:upgradePro', 'Upgrade to Pro')}
                  </Button>
                </div>

                {/* Preferences */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-4">
                    {t('common:preferences', 'Preferences')}
                  </h4>
                  <div className="glass-card rounded-[24px] overflow-hidden shadow-sm">
                    <button
                      onClick={() => handleNav('/settings')}
                      className="w-full flex items-center justify-between p-5 hover:bg-white/40 border-b border-white/20 transition-colors group"
                    >
                      <div className="flex items-center gap-4">
                        {/* Changed bg to primary-50 and text to primary-600 when it's the main profile link */}
                        <div className="p-2 bg-primary-50 rounded-xl text-primary-600">
                          <UserCircle size={22} />
                        </div>
                        <span className="font-bold text-gray-900 group-hover:text-primary-600 transition-colors">
                          {t('header:accountSettings', 'Personal Info')}
                        </span>
                      </div>
                      <ChevronRight size={18} className="text-gray-300 group-hover:text-primary-300" />
                    </button>

                    <button
                      onClick={() => handleNav('/settings')}
                      className="w-full flex items-center justify-between p-5 hover:bg-white/40 border-b border-white/20 transition-colors group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-white/50 rounded-xl text-gray-500 group-hover:text-primary-600">
                          <Settings size={22} />
                        </div>
                        <span className="font-bold text-gray-900 group-hover:text-primary-600 transition-colors">
                          {t('header:settings', 'App Settings')}
                        </span>
                      </div>
                      <ChevronRight size={18} className="text-gray-300 group-hover:text-primary-300" />
                    </button>

                    <button
                      onClick={() => handleNav('/billing')}
                      className="w-full flex items-center justify-between p-5 hover:bg-white/40 transition-colors group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-white/50 rounded-xl text-gray-500 group-hover:text-primary-600">
                          <CreditCard size={22} />
                        </div>
                        <span className="font-bold text-gray-900 group-hover:text-primary-600 transition-colors">
                          {t('common:billingPlan', 'Billing & Plan')}
                        </span>
                      </div>
                      <ChevronRight size={18} className="text-gray-300 group-hover:text-primary-300" />
                    </button>
                  </div>
                </div>

                {/* Sign Out */}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-3 p-5 text-red-500 font-black glass-card rounded-[24px] shadow-sm active:scale-95 transition-transform"
                >
                  <LogOut size={22} />
                  {t('settings:signOut', 'Sign Out')}
                </button>
              </>
            ) : (
              /* Logged Out State */
              <div className="glass-card rounded-[32px] p-8 shadow-sm space-y-4">
                <div className="flex items-center gap-4 mb-2">
                  <div className="p-3 bg-white/50 rounded-2xl">
                    <User size={28} className="text-gray-400" />
                  </div>
                  <p className="text-gray-600 font-medium text-sm">
                    {t('common:signInToAccess', 'Sign in to access your library')}
                  </p>
                </div>
                <Button
                  fullWidth
                  variant="primary"
                  className="h-14 rounded-2xl font-black shadow-xl shadow-primary-600/20"
                  onClick={() => { onClose(); navigate('/auth'); }}
                  disabled={loading}
                >
                  {loading ? t('common:loading', 'Loading...') : t('common:signIn', 'Sign In')}
                </Button>
                <button
                  onClick={() => { onClose(); navigate('/auth'); }}
                  className="w-full text-primary-600 font-bold text-base py-4 px-6 border-2 border-primary-200 rounded-2xl hover:bg-primary-50 hover:border-primary-300 transition-all"
                >
                  {t('common:signUp', 'Sign Up')}
                </button>
              </div>
            )}

            {/* Footer */}
            <div className="text-center pt-6">
              <img src={LogoBlack} alt="Recolekt" className="h-7 mx-auto mb-3 opacity-50" />
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">
                © 2025 Recolekt
              </p>
            </div>

          </div>
        </div>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  );
};
