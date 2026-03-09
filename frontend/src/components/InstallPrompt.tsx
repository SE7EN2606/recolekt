import React, { useState, useEffect } from 'react';
import { X, Share, PlusSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LogoIcon from '../assets/recolekt_icon.webp';

// TRAP: Catch event even if React isn't ready
let caughtPrompt: any = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    caughtPrompt = e;
  });
}

export const InstallPrompt: React.FC = () => {
  const { i18n } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const appleDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIOS(appleDevice);

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone === true;
    if (isStandalone) return;

    if (appleDevice) {
      setTimeout(() => setShowPrompt(true), 3000);
    } else {
      if (caughtPrompt) {
        setDeferredPrompt(caughtPrompt);
        setShowPrompt(true);
      }
      const handlePrompt = (e: any) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setShowPrompt(true);
      };
      window.addEventListener('beforeinstallprompt', handlePrompt);
      return () => window.removeEventListener('beforeinstallprompt', handlePrompt);
    }
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setShowPrompt(false);
  };

  if (!showPrompt) return null;

  const isFr = i18n.language?.startsWith('fr');
  const txt = {
    title: isFr ? "Installer Recolekt" : "Install Recolekt",
    sub: isFr ? "Ajoutez à l'écran d'accueil pour une meilleure expérience" : "Add to home screen for the best experience",
    btn: isFr ? "Installer l'App" : "Install App",
    s1: isFr ? "Appuyez sur le bouton Partager dans Safari" : "Tap the Share button in Safari",
    s2: isFr ? "Sélectionnez \"Sur l'écran d'accueil\"" : "Select 'Add to Home Screen'"
  };

  return (
    <div className="fixed bottom-24 left-4 right-4 z-[999] animate-in fade-in slide-in-from-bottom-5 max-w-sm mx-auto">
      <div className="bg-white rounded-2xl p-4 shadow-2xl border border-gray-100 relative">
        <button onClick={() => setShowPrompt(false)} className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>
        <div className="flex gap-4">
          
          {/* ✅ FIXED: Removed the purple background wrapper. Logo displays at full size. */}
          <img src={LogoIcon} className="w-12 h-12 rounded-[10px] object-cover shadow-sm shrink-0 border border-gray-100/10" alt="App" />
          
          <div className="flex-1 pr-6">
            <h3 className="font-bold text-sm text-gray-900">{txt.title}</h3>
            <p className="text-gray-500 text-[11px] mt-0.5 leading-tight">{txt.sub}</p>
            {isIOS ? (
              <div className="mt-3 space-y-2 bg-gray-50 p-2 rounded-lg text-[10px] text-gray-600 border border-gray-100">
                <div className="flex items-center gap-2"><Share size={14} className="text-blue-500" /><span>{txt.s1}</span></div>
                <div className="flex items-center gap-2"><PlusSquare size={14} /><span>{txt.s2}</span></div>
              </div>
            ) : (
              <button onClick={handleInstall} className="mt-3 w-full bg-primary-600 hover:bg-primary-700 active:scale-95 transition-all text-white text-xs font-bold py-2 rounded-lg">{txt.btn}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};