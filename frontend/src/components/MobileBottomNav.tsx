import React from 'react';
import { NavLink } from 'react-router-dom';
import { Plus, FolderTree } from 'lucide-react'; // ✅ Swapped User for FolderKanban
import { MobileMenu } from './MobileMenu';
import { useTranslation } from 'react-i18next';

interface MobileBottomNavProps {
  onAddClick: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onAddClick }) => {
  const { t } = useTranslation(['modals', 'sidebar']);

  return (
    <>
      <div
        className={`
          md:hidden fixed bottom-0 left-0 right-0 z-30
          glass border-t border-white/40
          px-6 pb-6 pt-2
          transition-transform duration-300
        `}
      >
        <div className="flex items-end justify-between">

          {/* Left: Collections (TV/Play Icon) */}
          <NavLink
            to="/gallery"
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 min-w-[64px] transition-colors ${
                isActive ? 'text-primary-600' : 'text-gray-500'
              }`
            }
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M7 2h10"/>
              <path d="M5 6h14"/>
              <rect width="18" height="12" x="3" y="10" rx="2"/>
              <path d="M10 13l5 3-5 3v-6z" />
            </svg>
            <span className="text-[10px] font-medium">{t('modals:collections')}</span>
          </NavLink>

          {/* Center: Add Button (Floating + Glass Animation) */}
          <div className="relative -top-6">
            <button
              onClick={onAddClick}
              className={`
                w-14 h-14 rounded-full flex items-center justify-center 
                bg-primary-600 text-white shadow-xl shadow-primary-600/40 
                border border-white/20 transition-all duration-200
                active:scale-90 active:bg-primary-700
                relative overflow-hidden
                after:content-[''] after:absolute after:inset-0 after:bg-white/30 after:opacity-0 active:after:opacity-100 after:transition-opacity
                group
              `}
            >
              <Plus 
                size={28} 
                strokeWidth={2.5} 
                className="group-hover:rotate-90 transition-transform duration-300 relative z-10" 
              />
            </button>
          </div>

          {/* Right: Organizer (NEW) */}
          <NavLink
            to="/organizer"
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 min-w-[64px] transition-colors ${
                isActive ? 'text-primary-600' : 'text-gray-500'
              }`
            }
          >
            <FolderTree size={24} strokeWidth={2} />
            <span className="text-[10px] font-medium">{t('sidebar:Organizer')}</span>
          </NavLink>

        </div>
      </div>
    </>
  );
};