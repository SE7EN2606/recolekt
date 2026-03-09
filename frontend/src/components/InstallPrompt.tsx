import React, { useState, useEffect } from 'react';
import { X, Share, Download } from 'lucide-react';

export const InstallPrompt: React.FC = () => {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // 1. Check if already installed
    const isAppInstalled = window.matchMedia('(display-mode: standalone)').matches || 
                           (window.navigator as any).standalone === true;
    setIsStandalone(isAppInstalled);

    if (isAppInstalled) return;

    // 2. Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isAppleDevice);

    if (isAppleDevice) {
      // Show iOS prompt after a slight delay
      setTimeout(() => setShowPrompt(true), 3000);
    }

    // 3. Detect Android Chrome (Listens for the install event)
    const handleBeforeInstallPrompt = (e: Event) => {
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

  if (!showPrompt || isStandalone) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 animate-fade-in">
      <div className="bg-white rounded-2xl p-4 shadow-2xl border border-gray-100 flex items-start gap-4">
        
        {/* App Icon placeholder */}
        <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center shrink-0">
          <Download className="text-white" size={24} />
        </div>

        <div className="flex-1">
          <h3 className="text-gray-900 font-bold text-sm">Install recolekt</h3>
          
          {isIOS ? (
             <p className="text-gray-500 text-xs mt-1">
               To install, tap the <Share size={14} className="inline mx-1" /> share button below and select <strong>"Add to Home Screen"</strong>.
             </p>
          ) : (
            <p className="text-gray-500 text-xs mt-1">
              Add our app to your home screen for faster access.
            </p>
          )}

          {!isIOS && deferredPrompt && (
            <button 
              onClick={handleInstallClick}
              className="mt-3 bg-primary-600 text-white text-xs font-bold px-4 py-2 rounded-lg active:scale-95 transition-transform"
            >
              Install App
            </button>
          )}
        </div>

        <button 
          onClick={() => setShowPrompt(false)}
          className="p-1 text-gray-400 hover:text-gray-600 active:scale-95"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
};