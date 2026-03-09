import React, { useState, useEffect } from 'react';
import { X, Share, PlusSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LogoIcon from '../assets/recolekt_icon.webp';

export const InstallPrompt: React.FC = () => {
  const { i18n } = useTranslation();
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // 1. Check if it's iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;

    // 2. Check if it's already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone === true;

    // 🚀 ONLY show this custom UI for iOS. 
    // Android will naturally show its own native mini-infobar at the top.
    if (isIOS && !isStandalone) {
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!showPrompt) return null;

  const isFr = i18n.language?.startsWith('fr');
  const txt = {
    title: isFr ? "Installer Recolekt" : "Install Recolekt",
    sub: isFr ? "Ajoutez à l'écran d'accueil pour une meilleure expérience" : "Add to home screen for the best experience",
    s1: isFr ? "Appuyez sur le bouton Partager dans Safari" : "Tap the Share button in Safari",
    s2: isFr ? "Sélectionnez \"Sur l'écran d'accueil\"" : "Select 'Add to Home Screen'"
  };

  return (
    <div className="fixed bottom-24 left-4 right-4 z-[999] animate-in fade-in slide-in-from-bottom-5 max-w-sm mx-auto">
      <div className="bg-white rounded-2xl p-4 shadow-2xl border border-gray-100 relative">
        <button 
          onClick={() => setShowPrompt(false)} 
          className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={20} />
        </button>
        <div className="flex gap-4">
          <img 
            src={LogoIcon} 
            className="w-12 h-12 rounded-[10px] object-cover shadow-sm shrink-0 border border-gray-100/10" 
            alt="App" 
          />
          <div className="flex-1 pr-6">
            <h3 className="font-bold text-sm text-gray-900">{txt.title}</h3>
            <p className="text-gray-500 text-[11px] mt-0.5 leading-tight">{txt.sub}</p>
            <div className="mt-3 space-y-2 bg-gray-50 p-2 rounded-lg text-[10px] text-gray-600 border border-gray-100">
              <div className="flex items-center gap-2">
                <Share size={14} className="text-blue-500" />
                <span>{txt.s1}</span>
              </div>
              <div className="flex items-center gap-2">
                <PlusSquare size={14} />
                <span>{txt.s2}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};