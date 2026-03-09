import React, { useState, useEffect } from 'react';
import { X, Download, Share, PlusSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LogoIcon from '../assets/recolekt_icon.webp';

export const InstallPrompt: React.FC = () => {
  const { t, i18n } = useTranslation(['common']);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // 1. Hardware/Environment Check
    const userAgent = window.navigator.userAgent.toLowerCase();
    const appleDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(appleDevice);

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone === true;
    
    if (isStandalone) return;

    // 2. iOS Logic: Show after 3 seconds
    if (appleDevice) {
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }

    // 3. Android Logic: Catch the event
    const handleBeforeInstallPrompt = (e: any) => {
      console.log("✅ PWA: Caught install prompt event");
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setShowPrompt(false);
    setDeferredPrompt(null);
  };

  if (!showPrompt) return null;

  // Fallback translations if i18n isn't ready yet
  const isFr = i18n.language?.startsWith('fr');
  const content = {
    title: isFr ? "Installer Recolekt" : "Install Recolekt",
    subtitle: isFr ? "Ajoutez à l'écran d'accueil" : "Add to home screen",
    btn: isFr ? "Installer l'App" : "Install App",
    step1: isFr ? "Appuyez sur le bouton Partager" : "Tap the share button",
    step2: isFr ? "Sélectionnez \"Sur l'écran d'accueil\"" : "Select 'Add to Home Screen'"
  };

  return (
    <div className="fixed bottom-24 left-4 right-4 z-[999] animate-in fade-in slide-in-from-bottom-5 duration-500 max-w-sm mx-auto">
      <div className="bg-white rounded-2xl p-4 shadow-2xl border border-gray-100 relative">
        <button 
          onClick={() => setShowPrompt(false)} 
          className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
             <img src={LogoIcon} alt="Icon" className="w-8 h-8 object-contain" />
          </div>
          
          <div className="flex-1 pr-6">
            <h3 className="text-gray-900 font-bold text-sm">{content.title}</h3>
            <p className="text-gray-500 text-xs mt-1">{content.subtitle}</p>

            {isIOS ? (
              <div className="mt-3 space-y-2 bg-gray-50 rounded-lg p-2 text-[11px] text-gray-600 border border-gray-100">
                <div className="flex items-center gap-2">
                  <Share size={14} className="text-blue-500" /> <span>{content.step1}</span>
                </div>
                <div className="flex items-center gap-2">
                  <PlusSquare size={14} /> <span>{content.step2}</span>
                </div>
              </div>
            ) : (
              <button 
                onClick={handleInstallClick}
                className="mt-3 w-full bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold py-2 rounded-lg active:scale-95 transition-all shadow-md"
              >
                {content.btn}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};