import React, { useState, useEffect } from 'react';
import { X, Share, PlusSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const DISMISS_KEY = 'ios_install_dismissed';
const DISMISS_DAYS = 7;

export const IOSInstallPrompt: React.FC = () => {
  const { t } = useTranslation(['common']);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                        || (window.navigator as any).standalone === true;

    // Don't show if already installed or not iOS
    if (!isIOS || isStandalone) return;

    // Don't show if user dismissed recently
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000) return;
    }

    const timer = setTimeout(() => setIsVisible(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative bg-white rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 flex flex-col items-center text-center">
          <button
            onClick={handleDismiss}
            className="absolute top-6 right-6 p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>

          {/* App Icon */}
          <div className="mb-6 shadow-xl rounded-[22%] overflow-hidden w-20 h-20 border border-gray-100 flex items-center justify-center bg-white">
            <img
              src="/assets/favicon/apple-touch-icon.png"
              alt="Recolekt"
              className="w-full h-full object-cover"
            />
          </div>

          <h3 className="text-xl font-black text-gray-900 mb-1 tracking-tight">
            {t('common:installTitle', 'Install App')}
          </h3>
          <p className="text-gray-500 text-sm mb-8 px-4 leading-relaxed">
            {t('common:installSubtitle', 'Tap the share button, then "Add to Home Screen" for a full-screen experience.')}
          </p>

          <div className="w-full space-y-3">
            <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <span className="text-sm font-medium text-gray-700">
                {t('common:installStep1', '1. Tap')} <Share size={14} className="inline text-blue-500 -mt-0.5" /> {t('common:installStep1b', 'Share')}
              </span>
            </div>

            <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <span className="text-sm font-medium text-gray-700">
                {t('common:installStep2', '2. Tap "Add to Home Screen"')} <PlusSquare size={14} className="inline text-gray-900 -mt-0.5" />
              </span>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="mt-8 bg-gray-900 text-white text-sm font-bold uppercase tracking-widest px-8 py-3 rounded-full hover:bg-gray-800 transition-colors"
          >
            {t('common:close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
};