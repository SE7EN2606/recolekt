import React, { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const InstallPrompt: React.FC = () => {
  const { t } = useTranslation(['common']);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // 1. Safety Check: Is it already installed or is it iOS?
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone === true;
    
    // DETECT IOS - If iOS, this component MUST return null 
    // because IOSInstallPrompt will handle it.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    
    if (isStandalone || isIOS) return;

    // 2. Android/Chrome logic
    const handleBeforeInstallPrompt = (e: any) => {
      console.log("✅ beforeinstallprompt fired");
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  // VITAL: Never render for iOS or if no prompt is available
  if (!showPrompt || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-[110] animate-in fade-in slide-in-from-bottom-5 duration-500 max-w-sm mx-auto">
      <div className="bg-white rounded-2xl p-4 shadow-2xl border border-gray-100 flex items-start gap-4">
        <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
          <Download className="text-white" size={24} />
        </div>
        <div className="flex-1">
          <h3 className="text-gray-900 font-bold text-sm">
            {t('common:installTitle', 'Install Recolekt')}
          </h3>
          <p className="text-gray-500 text-xs mt-1">
            {t('common:installSubtitle', 'Add to home screen for the best experience')}
          </p>
          <button 
            onClick={handleInstallClick}
            className="mt-3 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold px-4 py-2 rounded-lg active:scale-95 transition-all"
          >
            {t('common:add', 'Install App')}
          </button>
        </div>
        <button 
          onClick={() => setShowPrompt(false)}
          className="p-1 text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
};