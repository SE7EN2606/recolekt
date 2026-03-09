import React, { useState, useEffect } from 'react';
import { X, Share, PlusSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LogoIcon from '../assets/recolekt_icon.webp';

export const IOSInstallPrompt: React.FC = () => {
  const { t } = useTranslation(['common']);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
                        || (window.navigator as any).standalone === true;

    if (isIOS && !isStandalone) {
      // 3-second delay for better UX
      const timer = setTimeout(() => setIsVisible(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-24 md:bottom-6 left-4 right-4 z-[120] animate-in fade-in slide-in-from-bottom-10 duration-500">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 relative max-w-sm mx-auto">
        <button 
          onClick={() => setIsVisible(false)}
          className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-4 mb-4">
          <img src={LogoIcon} alt="Recolekt" className="w-12 h-12 object-contain" />
          <div>
            <h3 className="font-bold text-gray-900">
              {t('common:installTitle', 'Install Recolekt')}
            </h3>
            <p className="text-xs text-gray-500">
              {t('common:installSubtitle', 'Add to home screen for the best experience')}
            </p>
          </div>
        </div>

        <div className="space-y-3 bg-gray-50 rounded-xl p-3">
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <div className="p-1.5 bg-white rounded-md shadow-sm border border-gray-100">
              <Share size={16} className="text-blue-500" />
            </div>
            <span>
              {t('common:installStep1', 'Tap the Share button in Safari')}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <div className="p-1.5 bg-white rounded-md shadow-sm border border-gray-100">
              <PlusSquare size={16} className="text-gray-700" />
            </div>
            <span>
              {t('common:installStep2', 'Select "Add to Home Screen"')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};