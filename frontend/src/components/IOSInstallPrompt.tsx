import React, { useState, useEffect } from 'react';
import { X, Share, PlusSquare } from 'lucide-react';

export const IOSInstallPrompt: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if the device is iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    
    // Check if the app is already running in standalone mode (installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
                        || (window.navigator as any).standalone === true;

    // Show the prompt only if on iOS and NOT installed
    if (isIOS && !isStandalone) {
      // Small delay so it doesn't pop up immediately on first load
      const timer = setTimeout(() => setIsVisible(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 left-4 right-4 z-[100] animate-in fade-in slide-in-from-bottom-10 duration-500">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 relative">
        <button 
          onClick={() => setIsVisible(false)}
          className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close install prompt"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-200">
            <span className="text-white font-black text-xl">R</span>
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Install Recolekt</h3>
            <p className="text-xs text-gray-500">Add to your home screen for the full experience</p>
          </div>
        </div>

        <div className="space-y-3 bg-gray-50 rounded-xl p-3">
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <div className="p-1.5 bg-white rounded-md shadow-sm border border-gray-100">
              <Share size={16} className="text-blue-500" />
            </div>
            <span>Tap the <strong>Share</strong> button in Safari</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <div className="p-1.5 bg-white rounded-md shadow-sm border border-gray-100">
              <PlusSquare size={16} className="text-gray-700" />
            </div>
            <span>Select <strong>Add to Home Screen</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};