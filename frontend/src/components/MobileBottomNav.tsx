import React from 'react';
import { NavLink } from 'react-router-dom';
import { Plus, Network } from 'lucide-react'; // ✅ Changed to Network icon
import { useTranslation } from 'react-i18next';

interface MobileBottomNavProps {
  onAddClick: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onAddClick }) => {
  const { t } = useTranslation(['modals', 'sidebar']);

  return (
    <div
      className={`
        md:hidden fixed bottom-0 left-0 right-0 z-30
        glass border-t border-white/40
        px-6 pb-4 pt-2
        transition-transform duration-300
      `}
    >
      <div className="flex items-center justify-between max-w-sm mx-auto w-full relative">

        {/* Left: Collections */}
        <NavLink
          to="/gallery"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 w-[84px] py-1.5 rounded-3xl transition-all duration-300 ${
              isActive 
                ? 'text-primary-600' /* ✅ Removed the glass background/shadow from text */
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
              <span className="text-[11px] font-medium tracking-wide mt-0.5">{t('modals:collections')}</span>
            </>
          )}
        </NavLink>

        {/* Center: Add Button */}
        {/* ✅ Moved a bit higher from -top-5 to -top-8 */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-8">
          <button
            onClick={onAddClick}
            className={`
              w-14 h-14 rounded-full flex items-center justify-center 
              bg-primary-600 text-white shadow-xl shadow-primary-600/40 
              border-4 border-white/80 backdrop-blur-sm transition-all duration-200
              active:scale-90 active:bg-primary-700
              relative overflow-hidden
              after:content-[''] after:absolute after:inset-0 after:bg-white/30 after:opacity-0 active:after:opacity-100 after:transition-opacity
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
          to="/organizer"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 w-[84px] py-1.5 rounded-3xl transition-all duration-300 ${
              isActive 
                ? 'text-primary-600' /* ✅ Removed the glass background/shadow from text */
                : 'text-gray-500 active:bg-gray-100/50'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {/* ✅ Used Network icon */}
              <Network 
                size={24} 
                strokeWidth={2.2} 
                className={`transition-transform duration-300 ${isActive ? 'scale-110' : ''}`}
              />
              <span className="text-[11px] font-medium tracking-wide mt-0.5">{t('sidebar:Organizer', 'Organizer')}</span>
            </>
          )}
        </NavLink>

      </div>
    </div>
  );
};