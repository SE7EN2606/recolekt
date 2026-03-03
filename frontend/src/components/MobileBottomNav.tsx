import { API_BASE } from "../utils/api";
import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutGrid, User, Plus } from 'lucide-react';
import { ProfileMenu } from './ProfileMenu';
import { useTranslation } from 'react-i18next';

interface MobileBottomNavProps {
  onAddClick: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onAddClick }) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { t } = useTranslation(['modals']);

  // ✅ Fix: Scroll Lock when Profile Menu is open
  useEffect(() => {
    if (isProfileOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.paddingRight = '';
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.paddingRight = '';
      document.body.style.overflow = '';
    };
  }, [isProfileOpen]);

  return (
    <>
      <div
        className={`
          md:hidden fixed bottom-0 left-0 right-0 z-30
          glass border-t border-white/40
          px-6 pb-6 pt-2
          transition-transform duration-300
          ${isProfileOpen ? 'translate-y-full' : 'translate-y-0'}
        `}
      >
        <div className="flex items-end justify-between">

          {/* Left: Collections */}
          <NavLink
            to="/gallery"
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 min-w-[64px] transition-colors ${
                isActive ? 'text-primary-600' : 'text-gray-500 hover:text-gray-700'
              }`
            }
          >
            <LayoutGrid size={24} strokeWidth={2} />
            <span className="text-[10px] font-medium">{t('modals:collections')}</span>
          </NavLink>

          {/* Center: Add Button (Floating) */}
          <div className="relative -top-6">
            <button
              onClick={onAddClick}
              className="w-14 h-14 rounded-full flex items-center justify-center bg-primary-600 text-white shadow-xl shadow-primary-600/40 border border-white/20 transition-all hover:bg-primary-700 hover:ring-4 hover:ring-white/60 active:scale-95 group"
            >
              <Plus size={28} strokeWidth={2.5} className="group-hover:rotate-90 transition-transform duration-300" />
            </button>
          </div>

          {/* Right: Profile */}
          <button
            className={`flex flex-col items-center gap-1 min-w-[64px] transition-colors ${
              isProfileOpen ? 'text-primary-600' : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setIsProfileOpen(true)}
          >
            <User size={24} strokeWidth={2} />
            <span className="text-[10px] font-medium">{t('modals:myProfile')}</span>
          </button>

        </div>
      </div>

      <ProfileMenu isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </>
  );
};