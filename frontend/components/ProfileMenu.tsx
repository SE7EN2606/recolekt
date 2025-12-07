import React, { useEffect, useState } from 'react';
import { X, PlayCircle, UserCircle, ChevronRight } from 'lucide-react';
import { Button } from './Button';

interface ProfileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileMenu: React.FC<ProfileMenuProps> = ({ isOpen, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);

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

  if (!isVisible) return null;

  return (
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
        <div className="p-6 pb-24 space-y-8">
          
          {/* Sign In CTA */}
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm border border-gray-100">
            <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center text-primary-600 mb-4 mx-auto">
              <UserCircle size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Sign in to SaveReels</h2>
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
              Sync your collections across devices, get AI recommendations, and more.
            </p>
            <Button fullWidth size="lg" className="shadow-lg shadow-primary-600/20">
              Sign In / Sign Up
            </Button>
          </div>

          <div className="space-y-6">
            <div className="flex flex-col gap-1">
               <h4 className="font-bold text-gray-900 px-2 mb-2">Save and organize your favorite reels.</h4>
               {/* Decorative separator */}
               <div className="h-px bg-gray-200 mx-2 mb-4"></div>
            </div>

            {/* Links Grid */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-10">
              {/* Product */}
              <div>
                <h4 className="font-bold text-gray-900 mb-4 text-sm uppercase tracking-wider text-primary-600">Product</h4>
                <ul className="space-y-3 text-sm text-gray-600 font-medium">
                  <li><a href="#" className="hover:text-primary-600 transition-colors flex items-center justify-between">Features</a></li>
                  <li><a href="#" className="hover:text-primary-600 transition-colors flex items-center justify-between">Pricing</a></li>
                  <li><a href="#" className="hover:text-primary-600 transition-colors flex items-center justify-between">Security</a></li>
                </ul>
              </div>

              {/* Company */}
              <div>
                <h4 className="font-bold text-gray-900 mb-4 text-sm uppercase tracking-wider text-primary-600">Company</h4>
                <ul className="space-y-3 text-sm text-gray-600 font-medium">
                  <li><a href="#" className="hover:text-primary-600 transition-colors">About</a></li>
                  <li><a href="#" className="hover:text-primary-600 transition-colors">Blog</a></li>
                  <li><a href="#" className="hover:text-primary-600 transition-colors">Contact</a></li>
                </ul>
              </div>

              {/* Legal */}
              <div>
                <h4 className="font-bold text-gray-900 mb-4 text-sm uppercase tracking-wider text-primary-600">Legal</h4>
                <ul className="space-y-3 text-sm text-gray-600 font-medium">
                  <li><a href="#" className="hover:text-primary-600 transition-colors">Privacy</a></li>
                  <li><a href="#" className="hover:text-primary-600 transition-colors">Terms</a></li>
                </ul>
              </div>
            </div>
          </div>

          {/* Footer Copy */}
          <div className="text-center pt-8 border-t border-gray-200">
             <div className="flex items-center justify-center gap-2 mb-3 text-gray-900">
                <PlayCircle size={20} fill="currentColor" className="text-primary-600" />
                <span className="font-bold text-lg">SaveReels</span>
             </div>
             <p className="text-gray-400 text-xs leading-relaxed max-w-xs mx-auto">
               © 2024 SaveReels. Respecting privacy and platform terms of service.
             </p>
          </div>

        </div>
      </div>
    </div>
  );
};