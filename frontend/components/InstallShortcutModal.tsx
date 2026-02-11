import React, { useState } from 'react';
import { X, Copy, Check, Download } from 'lucide-react';

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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Download className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Install iOS Shortcut</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Step 1: Copy Token */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                1
              </div>
              <p className="font-semibold text-gray-900">Copy your API token</p>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={apiToken}
                readOnly
                className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg font-mono text-sm bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={copyToken}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all flex items-center gap-2 font-medium"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Step 2: Install Shortcut */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                2
              </div>
              <p className="font-semibold text-gray-900">Install the shortcut</p>
            </div>
            <a
              href={shortcutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-blue-600 text-white text-center py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold shadow-sm"
            >
              Get Shortcut
            </a>
          </div>

          {/* Step 3: Instructions */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                3
              </div>
              <p className="font-semibold text-gray-900">Paste when prompted</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                When installing the shortcut, you'll be asked for an API token. 
                Paste the token you copied in Step 1.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 rounded-b-2xl border-t">
          <p className="text-sm text-gray-600 text-center">
            ✅ That's it! Share any Instagram reel to <span className="font-semibold">"Send to Recolekt"</span>
          </p>
        </div>
      </div>
    </div>
  );
};
