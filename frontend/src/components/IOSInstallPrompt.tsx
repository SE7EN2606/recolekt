import React, { useState, useEffect } from 'react';
import { X, Share, PlusSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const IOSInstallPrompt: React.FC = () => {
  const { t } = useTranslation(['common']);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
                        || (window.navigator as any).standalone === true;

    if (isIOS && !isStandalone) {
      const timer = setTimeout(() => setIsVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 flex flex-col items-center text-center">
          <button 
            onClick={() => setIsVisible(false)} 
            className="absolute top-6 right-6 p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>

          {/* App Icon */}
          <div className="mb-6 shadow-xl rounded-[22%] overflow-hidden w-20 h-20 border border-gray-100">
            <img src="/assets/favicon/assets/apple-touch-icon.png" alt="Recolekt" className="w-12 h-12 rounded-xl object-contain shadow-sm" />
          </div>

          <h3 className="text-2xl font-black text-gray-900 mb-2 italic uppercase tracking-tight">
            Recolekt
          </h3>
          <p className="text-gray-500 text-sm mb-8 px-4 leading-relaxed">
            {t('common:installSubtitle', 'Add to your home screen for a full-screen experience and easy access.')}
          </p>

          <div className="w-full space-y-4">
            <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <span className="text-sm font-medium text-gray-700">{t('common:installStep1', '1. Tap the share button')}</span>
              <Share size={20} className="text-blue-500" />
            </div>
            
            <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <span className="text-sm font-medium text-gray-700">{t('common:installStep2', '2. Select "Add to Home Screen"')}</span>
              <PlusSquare size={20} className="text-gray-900" />
            </div>
          </div>
          
          <button 
            onClick={() => setIsVisible(false)}
            className="mt-8 text-gray-400 text-xs font-medium uppercase tracking-widest hover:text-gray-600"
          >
            {t('common:close', 'Maybe later')}
          </button>
        </div>
      </div>
    </div>
  );
};