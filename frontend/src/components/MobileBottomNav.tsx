import React from 'react';
import { NavLink } from 'react-router-dom';
import { Plus, Network } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface MobileBottomNavProps {
  onAddClick: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onAddClick }) => {
  const { t } = useTranslation(['modals', 'sidebar', 'gallery']);

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 transition-transform duration-300">
      
      {/* ISOLATED GLASS BACKGROUND 
        Putting the blur on this absolute layer prevents Android from blurring the text/icons!
      */}
      <div className="absolute inset-0 bg-white/75 backdrop-blur-lg -webkit-backdrop-blur-lg border-t border-white/40 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] -z-10" />

      {/* FOREGROUND CONTENT */}
      <div className="flex items-center justify-between max-w-sm mx-auto w-full px-6 pb-4 pt-2 relative">

        {/* Left: Collections */}
        <NavLink
          to="/gallery"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 w-[84px] py-1.5 rounded-3xl transition-all duration-300 ${
              isActive 
                ? 'text-primary-600' 
                : 'text-gray-500 active:bg-gray-100/50'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className={`transition-transform duration-300 ${isActive ? 'scale-110' : ''}`}
              >
                <path d="M7 2h10"/>
                <path d="M5 6h14"/>
                <rect width="18" height="12" x="3" y="10" rx="2"/>
                <path d="M10 13l5 3-5 3v-6z" fill={isActive ? 'currentColor' : 'none'} />
              </svg>
              <span className="text-[11px] font-medium tracking-wide mt-0.5">
                {t('gallery:gallery', 'Gallery')}
              </span>
            </>
          )}
        </NavLink>

        {/* Center: Add Button */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-8">
          <button
            onClick={onAddClick}
            aria-label={t('common:add', 'Add new video')}
            className={`
              w-14 h-14 rounded-full flex items-center justify-center 
              bg-primary-600 text-white shadow-lg shadow-primary-600/30 
              border-4 border-white transition-all duration-200
              active:scale-95 active:bg-primary-700
              relative overflow-hidden
              group
            `}
          >
            <Plus 
              size={28} 
              strokeWidth={3} 
              className="group-hover:rotate-90 transition-transform duration-300 relative z-10" 
            />
          </button>
        </div>

        {/* Right: Organizer */}
        <NavLink
          to="/grocery-list"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 w-[84px] py-1.5 rounded-3xl transition-all duration-300 ${
              isActive 
                ? 'text-primary-600' 
                : 'text-gray-500 active:bg-gray-100/50'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Network 
                size={24} 
                strokeWidth={2.2} 
                className={`transition-transform duration-300 ${isActive ? 'scale-110' : ''}`}
              />
              <span className="text-[11px] font-medium tracking-wide mt-0.5">
                {t('sidebar:groceryList', 'Grocery')}
              </span>
            </>
          )}
        </NavLink>

      </div>
    </div>
  );
};
