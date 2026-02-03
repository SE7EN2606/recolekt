import React, { useEffect, useState } from 'react';
import { X, UserCircle } from 'lucide-react';
import { Button } from './Button';
import { AuthModal } from './AuthModal';


interface ProfileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}


export const ProfileMenu: React.FC<ProfileMenuProps> = ({ isOpen, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);


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

  // Close menu when resizing to desktop view
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && isOpen) {
        onClose();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, onClose]);


  if (!isVisible) return null;


  return (
    <>
      <div 
        className={`
          fixed inset-0 z-[100] bg-white md:hidden flex flex-col
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="h-[72px] flex items-center justify-between px-6 border-b border-gray-100 flex-shrink-0 bg-white">
          <span className="text-xl font-bold text-gray-900">My Profile</span>
          <button 
            onClick={onClose}
            className="p-2 -mr-2 text-gray-500 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X size={24} />
          </button>
        </div>


        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50">
          <div className="p-6 pb-40 space-y-8">

            {/* Sign In CTA - Modern Design */}
            <div className="relative overflow-hidden rounded-[32px] p-8 pb-12 group transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl bg-gradient-to-br from-gray-900 to-gray-800 text-white shadow-xl shadow-dark-900/20">
              <div className="relative z-10 h-full flex flex-col">
                {/* Icon and Title side by side */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 rounded-2xl bg-white/10 text-white transition-colors">
                    <UserCircle size={28} />
                  </div>
                  <h2 className="text-2xl font-black tracking-tight">Join Recolekt</h2>
                </div>
                
                <div className="mb-6">
                  <p className="font-medium leading-relaxed text-sm text-gray-400">
                    Sync your collections across devices, get AI recommendations, and unlock premium features.
                  </p>
                </div>

                <div className="flex flex-col gap-3 items-center relative z-30">
                  {/* Start for free button */}
                  <button 
                    onClick={() => setIsAuthModalOpen(true)}
                    type="button"
                    className="w-full max-w-[180px] inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed bg-white text-gray-900 hover:bg-primary-600 hover:text-white shadow-lg px-6 py-3 text-sm font-black cursor-pointer"
                  >
                    Start for free
                  </button>
                  {/* Log in button - SAME shape and rounded corners */}
                  <button 
                    onClick={() => setIsAuthModalOpen(true)}
                    type="button"
                    className="w-full max-w-[180px] inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed bg-transparent text-white hover:bg-white/10 shadow-lg px-6 py-3 text-sm font-black cursor-pointer border-2 border-white/30"
                  >
                    Log in
                  </button>
                </div>
              </div>
              
              {/* Glow effect - purple with pointer-events-none */}
              <div className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full blur-[80px] opacity-50 transition-opacity group-hover:opacity-70 bg-primary-600 pointer-events-none"></div>
            </div>


            <div className="space-y-6">
              {/* Links Grid - Company moved EVEN MORE to the right */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-10">
                {/* Product */}
                <div className="pl-2">
                  <h4 className="font-bold text-gray-900 mb-4 text-sm uppercase tracking-wider text-primary-600">Product</h4>
                  <ul className="space-y-3 text-sm text-gray-600 font-medium">
                    <li><a href="#" className="hover:text-primary-600 transition-colors flex items-center justify-between">Features</a></li>
                    <li><a href="#" className="hover:text-primary-600 transition-colors flex items-center justify-between">Pricing</a></li>
                    <li><a href="#" className="hover:text-primary-600 transition-colors flex items-center justify-between">Security</a></li>
                  </ul>
                </div>


                {/* Company - moved EVEN MORE to the right with pl-12 */}
                <div className="pl-12">
                  <h4 className="font-bold text-gray-900 mb-4 text-sm uppercase tracking-wider text-primary-600">Company</h4>
                  <ul className="space-y-3 text-sm text-gray-600 font-medium">
                    <li><a href="#" className="hover:text-primary-600 transition-colors">About</a></li>
                    <li><a href="#" className="hover:text-primary-600 transition-colors">Blog</a></li>
                    <li><a href="#" className="hover:text-primary-600 transition-colors">Contact</a></li>
                  </ul>
                </div>
              </div>
            </div>

          </div>
        </div>


        {/* Footer - Dark like desktop with proper z-index */}
        <div className="bg-dark-900 text-white border-t border-gray-800 py-6 px-6 fixed bottom-0 left-0 right-0 z-[110]">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img 
              src="https://raw.githubusercontent.com/SE7EN2606/recolekt/81dfd0ba97241d903f74e94e9e795b09ed6ab48d/recolekt_logo_white_bg.svg" 
              alt="Recolekt" 
              className="h-6"
            />
          </div>
          <div className="text-center">
            <p className="text-gray-400 text-xs mb-1">
              © 2026 Recolekt. All rights reserved.
            </p>
            <p className="text-gray-500 text-[10px] mb-2">
              AI-powered video organization and insights.
            </p>
            <div className="flex items-center justify-center gap-3 text-[10px] text-gray-500">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <span>|</span>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
            </div>
          </div>
        </div>

      </div>

      {/* Auth Modal - Higher z-index to be visible above ProfileMenu */}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  );
};
