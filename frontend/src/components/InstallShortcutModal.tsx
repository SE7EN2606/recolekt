import React, { useState } from 'react';
import { X, Copy, Check, ExternalLink } from 'lucide-react';

interface InstallShortcutModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiToken: string;
  shortcutUrl: string;
}

export const InstallShortcutModal: React.FC<InstallShortcutModalProps> = ({
  isOpen,
  onClose,
  apiToken,
  shortcutUrl
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const copyToken = () => {
    navigator.clipboard.writeText(apiToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 duration-300 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 flex justify-between items-center p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center">
              <ExternalLink className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Install Shortcut</h3>
              <p className="text-xs text-gray-500">3 quick steps</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Step 1: Copy Token */}
          <div className="bg-blue-50 rounded-2xl p-5 border-2 border-blue-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-black flex-shrink-0">
                1
              </div>
              <p className="font-bold text-gray-900 text-base">Copy your token</p>
            </div>
            
            <div className="bg-white rounded-xl p-3 mb-3 border border-blue-200">
              <p className="font-mono text-xs text-gray-700 break-all leading-relaxed">
                {apiToken}
              </p>
            </div>

            <button
              onClick={copyToken}
              className="w-full py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 font-bold shadow-lg shadow-blue-600/30 active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5" />
                  Copied to Clipboard!
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  Copy Token
                </>
              )}
            </button>
          </div>

          {/* Step 2: Install Shortcut */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-5 border-2 border-purple-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-black flex-shrink-0">
                2
              </div>
              <p className="font-bold text-gray-900 text-base">Get the shortcut</p>
            </div>
            
            <a
              href={shortcutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-center rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all font-bold shadow-lg shadow-purple-600/30 active:scale-95"
            >
              Open Shortcuts App →
            </a>
            
            <p className="text-xs text-purple-900 mt-3 text-center font-medium">
              This will open the Shortcuts app on your iPhone
            </p>
          </div>

          {/* Step 3: Instructions */}
          <div className="bg-green-50 rounded-2xl p-5 border-2 border-green-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-black flex-shrink-0">
                3
              </div>
              <p className="font-bold text-gray-900 text-base">Paste your token</p>
            </div>
            
            <div className="space-y-2">
              <div className="flex gap-3">
                <div className="w-1.5 bg-green-600 rounded-full flex-shrink-0"></div>
                <p className="text-sm text-green-900 font-medium">
                  Tap <span className="font-bold">"Add Shortcut"</span>
                </p>
              </div>
              <div className="flex gap-3">
                <div className="w-1.5 bg-green-600 rounded-full flex-shrink-0"></div>
                <p className="text-sm text-green-900 font-medium">
                  When prompted, <span className="font-bold">paste the token</span> from Step 1
                </p>
              </div>
              <div className="flex gap-3">
                <div className="w-1.5 bg-green-600 rounded-full flex-shrink-0"></div>
                <p className="text-sm text-green-900 font-medium">
                  Done! ✨
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-5 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
              <Check className="w-4 h-4" />
            </div>
            <p className="font-bold text-sm">Ready to use!</p>
          </div>
          <p className="text-xs text-white/90 leading-relaxed">
            Share any Instagram reel → tap <span className="font-bold">"Send to Recolekt"</span> → your reel is saved! 🎉
          </p>
        </div>
      </div>
    </div>
  );
};
