import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutGrid, User, Plus } from 'lucide-react';
import { ProfileMenu } from './ProfileMenu';



interface MobileBottomNavProps {
  onAddClick: () => void;
}



export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onAddClick }) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);



  return (
    <>
      {/* Hide MobileBottomNav when ProfileMenu is open */}
      <div className={`md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 px-6 pb-6 pt-2 transition-transform duration-300 ${isProfileOpen ? 'translate-y-full' : 'translate-y-0'}`}>
        <div className="flex items-end justify-between">
          
          {/* Left: Collections */}
          <NavLink 
            to="/gallery"
            className={({ isActive }) => `flex flex-col items-center gap-1 min-w-[64px] transition-colors ${isActive ? 'text-primary-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <LayoutGrid size={24} />
            <span className="text-[10px] font-medium">Collections</span>
          </NavLink>



          {/* Center: Add Button (Floating overlap) */}
          <div className="relative -top-5">
            <button 
              onClick={onAddClick}
              className="w-14 h-14 bg-primary-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-primary-600/30 active:scale-95 transition-transform border-4 border-white"
            >
              <Plus size={32} />
            </button>
          </div>



          {/* Right: Profile */}
          <button 
            className={`flex flex-col items-center gap-1 min-w-[64px] transition-colors ${isProfileOpen ? 'text-primary-600' : 'text-gray-400 hover:text-gray-600'}`}
            onClick={() => setIsProfileOpen(true)}
          >
            <User size={24} />
            <span className="text-[10px] font-medium">My Profile</span>
          </button>



        </div>
      </div>



      <ProfileMenu isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </>
  );
};
