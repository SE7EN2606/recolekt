import React, { useState, useEffect } from 'react';
import { X, Share, PlusSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LogoIcon from '../assets/recolekt_icon.webp';

export const IOSInstallPrompt: React.FC = () => {
  const { t } = useTranslation(['common']);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
                        || (window.navigator as any).standalone === true;

    // Strict check: Only show if iOS AND NOT already installed
    if (isIOS && !isStandalone) {
      const timer = setTimeout(() => setIsVisible(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-24 md:bottom-6 left-4 right-4 z-[120] animate-in fade-in slide-in-from-bottom-10 duration-500 max-w-sm mx-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 relative">
        <button onClick={() => setIsVisible(false)} className="absolute top-3 right-3 p-1 text-gray-400"><X size={18} /></button>
        <div className="flex items-center gap-4 mb-4">
          <img src={LogoIcon} alt="Recolekt" className="w-12 h-12 object-contain" />
          <div>
            <h3 className="font-bold text-gray-900">{t('common:installTitle', 'Install Recolekt')}</h3>
            <p className="text-xs text-gray-500">{t('common:installSubtitle', 'Add to home screen')}</p>
          </div>
        </div>
        <div className="space-y-3 bg-gray-50 rounded-xl p-3 text-sm text-gray-700">
          <div className="flex items-center gap-3"><Share size={16} className="text-blue-500" /><span>{t('common:installStep1')}</span></div>
          <div className="flex items-center gap-3"><PlusSquare size={16} /><span>{t('common:installStep2')}</span></div>
        </div>
      </div>
    </div>
  );
};