import React, { useState } from 'react';
import { X, BookmarkCheck, CircleX } from 'lucide-react';
import { DuplicateReelError, useData } from '../context/DataContext';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

const PasteIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M24.89,6.61H22.31V4.47A2.47,2.47,0,0,0,19.84,2H6.78A2.47,2.47,0,0,0,4.31,4.47V22.92a2.47,2.47,0,0,0,2.47,2.47H9.69V27.2a2.8,2.8,0,0,0,2.8,2.8h12.4a2.8,2.8,0,0,0,2.8-2.8V9.41A2.8,2.8,0,0,0,24.89,6.61ZM6.78,23.52a.61.61,0,0,1-.61-.6V4.47a.61.61,0,0,1,.61-.6H19.84a.61.61,0,0,1,.61.6V6.61h-8a2.8,2.8,0,0,0-2.8,2.8V23.52Zm19,3.68a.94.94,0,0,1-.94.93H12.49a.94.94,0,0,1-.94-.93V9.41a.94.94,0,0,1,.94-.93h12.4a.94.94,0,0,1,.94.93Z"></path>
    <path d="M23.49,13.53h-9.6a.94.94,0,1,0,0,1.87h9.6a.94.94,0,1,0,0-1.87Z"></path>
    <path d="M23.49,17.37h-9.6a.94.94,0,1,0,0,1.87h9.6a.94.94,0,1,0,0-1.87Z"></path>
    <path d="M23.49,21.22h-9.6a.93.93,0,1,0,0,1.86h9.6a.93.93,0,1,0,0-1.86Z"></path>
  </svg>
);

const SUPPORTED_DOMAINS = [
  'instagram.com',
  'facebook.com', 'fb.watch', 'fb.com',
  'youtube.com', 'youtu.be',
  'tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com',
];

const isSupportedUrl = (url: string): boolean => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return SUPPORTED_DOMAINS.some(d => lower.includes(d));
};

interface AddVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddVideoModal: React.FC<AddVideoModalProps> = ({ isOpen, onClose }) => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [alreadySaved, setAlreadySaved] = useState(false);
  const [savedReelPath, setSavedReelPath] = useState('');
  const { addVideo } = useData();
  const { t } = useTranslation(['modals', 'common']);
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setUrl('');
      setError('');
      setAlreadySaved(false);
      setSavedReelPath('');
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = '';
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      setError('');
      setAlreadySaved(false);
      setSavedReelPath('');
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  };

  const handleClear = () => {
    setUrl('');
    setError('');
    setAlreadySaved(false);
    setSavedReelPath('');
  };

  const handleClose = () => {
    setAlreadySaved(false);
    setError('');
    setSavedReelPath('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLoading) return;
    if (!url.trim()) return;

    // ── Platform validation ───────────────────────────────────────────
    if (!isSupportedUrl(url.trim())) {
      setError(t('modals:errorUnsupportedPlatform', 'Only Instagram, Facebook, YouTube, and TikTok URLs are supported.'));
      return;
    }

    setIsLoading(true);
    setError('');
    setAlreadySaved(false);
    setSavedReelPath('');

    try {
      await addVideo(url.trim());
      setUrl('');
      onClose();
      navigate('/gallery');

    } catch (err: any) {
      if (err instanceof DuplicateReelError && err.duplicate.existingReelId) {
        setAlreadySaved(true);
        setSavedReelPath(err.duplicate.existingReelUrl || `/video/${err.duplicate.existingReelId}`);
        setIsLoading(false);
        return;
      }

      const backendError = String(err.message || '').toLowerCase();

      if (backendError.includes('already been saved') || backendError.includes('already exists')) {
        setAlreadySaved(true);
        setIsLoading(false);
        return;
      }

      let translatedError = t('modals:importFailed');
      if (backendError.includes('not authenticated') || backendError.includes('authentication required')) {
        translatedError = t('modals:errorNotAuth');
      } else if (backendError.includes('unsupported_platform') || backendError.includes('unsupported platform')) {
        translatedError = t('modals:errorUnsupportedPlatform', 'Only Instagram, Facebook, YouTube, and TikTok URLs are supported.');
      } else if (backendError.includes('provide either file or url') || backendError.includes('invalid url')) {
        translatedError = t('modals:errorInvalidUrl');
      } else if (backendError.includes('failed to import') || backendError.includes('internal error')) {
        translatedError = t('modals:errorServer');
      } else if (err.message) {
        translatedError = err.message;
      }

      setError(translatedError);
      console.error('Error adding video:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center px-4 transition-all duration-300 ${
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div
        className={`
          relative bg-white/90 backdrop-blur-xl border border-white/40
          w-full max-w-lg rounded-2xl shadow-2xl
          transform transition-all duration-300
          ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              {t('modals:saveNewVideo')}
            </h2>
            <button onClick={handleClose} className="p-2 -mr-2 text-gray-400 hover:bg-white/50 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>

          {alreadySaved ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <BookmarkCheck size={20} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-800">
                    {t('modals:errorAlreadySaved', 'Already saved')}
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    {t('modals:alreadySavedHint', 'This video is already in your Recolekt library.')}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-2.5 border border-white/40 bg-white/40 text-gray-700 rounded-xl hover:bg-white/60 transition-colors font-semibold"
                >
                  {t('common:cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => { handleClose(); navigate(savedReelPath || '/gallery'); }}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-bold shadow-sm"
                >
                  {savedReelPath
                    ? t('modals:viewSavedReel', 'View saved reel')
                    : t('modals:goToGallery', 'Go to Gallery')}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setError(''); setAlreadySaved(false); setSavedReelPath(''); }}
                  placeholder={t('modals:pastePlaceholder')}
                  className={`w-full h-[50px] pl-4 bg-white/50 border border-white/40 rounded-xl focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all outline-none text-gray-900 placeholder-gray-400 backdrop-blur-sm ${
                    url ? 'pr-[88px]' : 'pr-16'
                  }`}
                  style={{ fontSize: '16px' }}
                  autoFocus
                  disabled={isLoading}
                />

                {/* Clear button — always red when URL has content */}
                {url && (
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={isLoading}
                    className="absolute right-[46px] top-1/2 -translate-y-1/2 flex items-center justify-center w-[26px] h-[26px] bg-gray-100 hover:bg-red-50 text-red-500 hover:text-red-600 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Clear"
                  >
                    <CircleX size={14} />
                  </button>
                )}

                {/* Paste button */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    onClick={handlePaste}
                    disabled={isLoading}
                    className="flex items-center justify-center w-[36px] h-[36px] bg-white/60 hover:bg-white/80 text-gray-600 rounded-lg transition-all border border-white/40 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm"
                    title={t('modals:pasteTitle')}
                  >
                    <PasteIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Platform hint */}
              <p className="text-xs text-gray-400 -mt-1">
                {t('modals:supportedPlatforms', 'Instagram · Facebook · YouTube · TikTok')}
              </p>

              {error && (
                <p className="text-sm text-red-600 font-medium">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2.5 border border-white/40 bg-white/40 text-gray-700 rounded-xl hover:bg-white/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold backdrop-blur-sm"
                >
                  {t('common:cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!url.trim() || isLoading}
                  className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold shadow-sm shadow-primary-600/20"
                >
                  {isLoading ? t('common:processing') : t('common:save')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
