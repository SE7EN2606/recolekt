import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Plus, FolderTree } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface MobileBottomNavProps {
  onAddClick: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onAddClick }) => {
  const { t } = useTranslation(['modals', 'sidebar']);
  const location = useLocation();

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40">
      {/* Main Navbar Background - Solid Brand Color */}
      <div className="bg-primary-600 px-6 pb-4 pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] rounded-t-2xl relative">
        <div className="flex items-center justify-between max-w-[280px] mx-auto w-full relative">

          {/* Left: Collections */}
          <NavLink
            to="/gallery"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 w-[80px] py-1.5 rounded-[20px] transition-all duration-300 ${
                isActive 
                  ? 'bg-black/20 text-white shadow-sm' 
                  : 'text-white/70 active:bg-black/10'
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
              strokeWidth="2.2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              className={`transition-transform duration-300 ${location.pathname === '/gallery' ? 'scale-110' : ''}`}
            >
              <path d="M7 2h10"/>
              <path d="M5 6h14"/>
              <rect width="18" height="12" x="3" y="10" rx="2"/>
              <path d="M10 13l5 3-5 3v-6z" fill={location.pathname === '/gallery' ? 'currentColor' : 'none'} />
            </svg>
            <span className="text-[11px] font-medium tracking-wide mt-0.5">{t('modals:collections')}</span>
          </NavLink>

          {/* Center: Add Button (Cutout Effect) */}
          {/* The bg-[#f9fafb] acts as the "mask" cutting into the purple bar */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-6 bg-[#f9fafb] p-1.5 rounded-full z-50">
            <button
              onClick={onAddClick}
              className="w-14 h-14 rounded-full flex items-center justify-center bg-white text-primary-600 shadow-md transition-transform duration-200 active:scale-90 group"
            >
              <Plus 
                size={30} 
                strokeWidth={3} 
                className="group-hover:rotate-90 transition-transform duration-300" 
              />
            </button>
          </div>

          {/* Right: Organizer */}
          <NavLink
            to="/organizer"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 w-[80px] py-1.5 rounded-[20px] transition-all duration-300 ${
                isActive 
                  ? 'bg-black/20 text-white shadow-sm' 
                  : 'text-white/70 active:bg-black/10'
              }`
            }
          >
            <FolderTree 
              size={24} 
              strokeWidth={2.2} 
              className={`transition-transform duration-300 ${location.pathname === '/organizer' ? 'scale-110' : ''}`}
            />
            <span className="text-[11px] font-medium tracking-wide mt-0.5">{t('sidebar:Organizer', 'Organizer')}</span>
          </NavLink>

        </div>
      </div>
    </div>
  );
};