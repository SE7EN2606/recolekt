import { API_BASE } from "../utils/api";
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Globe, Loader2, CheckCircle2, AlertCircle, RefreshCw, Trash2 } from 'lucide-react';
import { getAuthHeaders } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { useData } from '../context/DataContext';
import { ConfirmModal } from './ConfirmModal';

interface VideoCardProps {
  video: any;
  selected?: boolean;
  onToggleSelect?: () => void;
  selectionMode?: boolean;
}


function joinUrl(base: string, path: string) {
  const p = String(path || '').replace(/^\/+/, '');
  if (!base) return `/${p}`;
  const b = String(base || '').replace(/\/+$/, '');
  return `${b}/${p}`;
}

const safeStr = (v: any): string => {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return String(v);
};

function resolveTitle(video: any, t: any): { english: string; original: string; hasTwoLanguages: boolean } {
  const DEFAULT = t('videoCard:untitledVideo');

  const summary = video?.summary ?? video?.raw?.summary ?? {};
  const summaryObj = summary?.english || summary?.original ? summary : summary?.summary ?? summary;

  const englishBlock = summaryObj?.english ?? summaryObj?.EN ?? summaryObj?.en ?? {};
  const originalBlock = summaryObj?.original ?? summaryObj?.OG ?? summaryObj?.og ?? {};

  const engTitle = safeStr(englishBlock?.title).trim();
  const origTitle = safeStr(originalBlock?.title).trim();
  const topLevelTitle = safeStr(video?.summary_title ?? video?.summaryTitle).trim();

  const recipe = video?.recipe;
  const recipeObj = recipe && typeof recipe === 'object' ? recipe : null;
  const recipeEngTitle = safeStr(recipeObj?.english?.title).trim();
  const recipeOrigTitle = safeStr(recipeObj?.original?.title).trim();

  const english =
    engTitle ||
    topLevelTitle ||
    recipeEngTitle ||
    safeStr(video?.title).trim() ||
    safeStr(video?.caption ?? '').split('\n')[0].trim() ||
    DEFAULT;

  const original =
    origTitle ||
    recipeOrigTitle ||
    safeStr(video?.title).trim() ||
    english;

  const hasTwoLanguages = !!(engTitle && origTitle) && engTitle !== origTitle;

  return { english, original, hasTwoLanguages };
}

const VideoCardComponent: React.FC<VideoCardProps> = ({ video, selected, onToggleSelect, selectionMode }) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation(['videoCard', 'common']);
  
  // Safely extract context variables without forcing types that might crash
  const dataContext = useData() as any;
  const addVideo = dataContext.addVideo;
  const deleteVideos = dataContext.deleteVideos;
  const setVideos = dataContext.setVideos;

  const videoId = video?.id ?? video?.process_id ?? video?.processId ?? '';

  const [isFavorite, setIsFavorite] = useState<boolean>(Boolean(video?.isFavorite ?? video?.is_favorite ?? false));
  const [showOriginal, setShowOriginal] = useState(i18n.language.startsWith('fr'));
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  useEffect(() => {
    setShowOriginal(i18n.language.startsWith('fr'));
  }, [i18n.language]);

  useEffect(() => {
    setIsFavorite(Boolean(video?.isFavorite ?? video?.is_favorite ?? false));
  }, [video?.isFavorite, video?.is_favorite, videoId]);

  const isProcessing = video?.category === 'Processing' || video?.status === 'processing';
  const isFailedStatus = video?.category === 'Failed' || video?.status === 'error' || video?.status === 'failed';

  const thumbnailUrl =
    video?.thumbnailUrl ||
    video?.thumbnail_url ||
    video?.gcs_urls?.preview_thumbnail ||
    video?.gcsUrls?.previewThumbnail ||
    video?.preview_thumbnail ||
    video?.raw?.gcsurls?.previewthumbnail ||
    '';

  const isDone = video?.status === 'done' || video?.status === 'completed';
  const isMissingThumbnail = isDone && !thumbnailUrl;
  const hasError = isFailedStatus || isMissingThumbnail;
  const isDisabled = isProcessing || hasError;

  const { english: englishTitle, original: originalTitle, hasTwoLanguages } = useMemo(
    () => resolveTitle(video, t),
    [video, t]
  );

  const displayTitle = showOriginal ? originalTitle : englishTitle;

  let languageCode = 'OG';
  const transcription = video?.transcription ?? video?.transcript ?? video?.raw?.transcription;
  if (transcription && typeof transcription === 'object' && transcription.detected_language) {
    languageCode = String(transcription.detected_language).toUpperCase();
  }

  const author = String(video?.author ?? video?.author_name ?? video?.authorName ?? t('videoCard:unknownAuthor'));
  const duration = video?.duration;

  const sourceUrl = String(
    video?.originalUrl ?? video?.source_url ?? video?.sourceUrl ?? video?.raw?.sourceurl ?? '',
  );

  const platform = useMemo(() => {
    const url = sourceUrl.toLowerCase();
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('facebook.com') || url.includes('fb.com')) return 'facebook';
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    return 'instagram';
  }, [sourceUrl]);

  const profileUrl =
    platform === 'instagram'
      ? `https://www.instagram.com/${author.replace('@', '')}/`
      : sourceUrl || '#';

  const handleHeartClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); 
    
    if (isDisabled) return;

    if (isFavorite) {
      setShowRemoveConfirm(true);
      return;
    }

    // Optimistic Update
    setIsFavorite(true);
    video.is_favorite = true;
    video.isFavorite = true;
    
    if (!videoId) return;

    try {
      const encodedId = encodeURIComponent(String(videoId));
      const url = joinUrl(API_BASE, `/api/update/${encodedId}`);
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ is_favorite: true }),
      });
      
      if (!response.ok) throw new Error('API Update Failed');

      if (typeof setVideos === 'function') {
        setVideos((prev: any[]) => 
          prev?.map ? prev.map((v: any) => 
            (v.id === videoId || v.process_id === videoId || v.processId === videoId) 
              ? { ...v, is_favorite: true, isFavorite: true } 
              : v
          ) : prev
        );
      }
    } catch (err) {
      console.error('Failed to favorite:', err);
      setIsFavorite(false); 
      video.is_favorite = false;
      video.isFavorite = false;
    }
  };

  const confirmRemoveFavorite = async () => {
    setIsFavorite(false);
    video.is_favorite = false;
    video.isFavorite = false;
    setShowRemoveConfirm(false);
    
    if (!videoId) return;

    try {
      const encodedId = encodeURIComponent(String(videoId));
      const url = joinUrl(API_BASE, `/api/update/${encodedId}`);
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ is_favorite: false }),
      });

      if (!response.ok) throw new Error('API Update Failed');

      if (typeof setVideos === 'function') {
        setVideos((prev: any[]) => 
          prev?.map ? prev.map((v: any) => 
            (v.id === videoId || v.process_id === videoId || v.processId === videoId) 
              ? { ...v, is_favorite: false, isFavorite: false } 
              : v
          ) : prev
        );
      }
    } catch (err) {
      console.error('Failed to remove favorite:', err);
      setIsFavorite(true);
      video.is_favorite = true;
      video.isFavorite = true;
    }
  };

  const handleLanguageToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled) return;
    setShowOriginal((prev) => !prev);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (isDisabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (selectionMode) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect?.();
    } else {
      navigate(`/video/${videoId}`);
    }
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!sourceUrl || isRetrying) return;
    setIsRetrying(true);
    try {
      await addVideo(sourceUrl, true);
    } catch (err) {
      console.error('Retry failed:', err);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!videoId || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteVideos([videoId]);
    } catch (err) {
      console.error('Delete failed:', err);
      setIsDeleting(false);
    }
  };

  const errorText =
    video?.errorMessage ||
    video?.error_message ||
    video?.raw?.errormessage ||
    (isMissingThumbnail
      ? t('videoCard:missingThumbnailText', 'Media download failed.')
      : t('videoCard:defaultError'));

  return (
    <>
      <div className="group relative flex flex-col gap-3 transition-transform duration-300">
        <div
          onClick={handleCardClick}
          className={`relative rounded-2xl overflow-hidden aspect-[9/16] shadow-sm transition-shadow duration-300 ${
            isDisabled ? 'cursor-default' : 'cursor-pointer'
          } ${selected ? 'ring-4 ring-primary-500 ring-offset-2' : 'hover:shadow-lg'}`}
          style={{ WebkitMaskImage: '-webkit-radial-gradient(white, black)' }}
        >
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={displayTitle}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
              decoding="async"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${isProcessing ? 'placeholder-skeleton' : 'bg-gray-200'}`}>
              {!hasError && !isProcessing && (
                <span className="text-gray-400 text-sm">{t('videoCard:noPreview')}</span>
              )}
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 pointer-events-none" />

          {isProcessing && (
            <div className="processing-overlay">
              <div className="scan-grid" /><div className="scan-line-seq-h" /><div className="scan-line-seq-v" />
              <div className="flex flex-col items-center gap-3 relative z-10">
                <Loader2 className="w-10 h-10 text-white animate-spin drop-shadow-md" />
                <span className="text-white text-sm font-medium drop-shadow-md tracking-wide">{t('videoCard:processing')}</span>
              </div>
            </div>
          )}

          {hasError && (
            <div className="absolute inset-0 bg-red-600/90 backdrop-blur-md z-40 flex flex-col items-center justify-center p-4 text-center">
              <AlertCircle className="w-12 h-12 text-white/90 mb-3" />
              <p className="text-white font-bold text-base mb-1">{t('videoCard:processingFailed')}</p>
              <p className="text-white/80 text-xs mb-6 px-2 line-clamp-2">{errorText}</p>
              <div className="flex flex-col gap-2 w-full max-w-[140px]">
                <button
                  onClick={handleRetry}
                  disabled={isRetrying || isDeleting}
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-white text-red-600 font-semibold rounded-xl text-sm hover:bg-red-50 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {isRetrying ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  {t('common:tryAgain')}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isRetrying || isDeleting}
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-red-700 text-white font-medium rounded-xl text-sm hover:bg-red-800 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {t('common:remove')}
                </button>
              </div>
            </div>
          )}

          {selectionMode && (
            <div className="absolute top-3 right-3 z-20 pointer-events-none">
              {selected ? (
                <div className="bg-primary-600 text-white rounded-full p-1 shadow-md"><CheckCircle2 size={20} /></div>
              ) : (
                <div className="w-7 h-7 rounded-full border-2 border-white/60 bg-black/20 backdrop-blur-sm" />
              )}
            </div>
          )}

          {/* Language Toggle */}
          {hasTwoLanguages && !isDisabled && !selectionMode && (
            <button
              onClick={handleLanguageToggle}
              className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1.5 text-white hover:bg-black/80 transition-colors z-30"
              title={showOriginal ? t('videoCard:showingLanguage', { lang: languageCode }) : t('videoCard:showingEnglish')}
            >
              <Globe size={12} className="text-gray-200" />
              <span className="text-[10px] font-bold uppercase tracking-wider">{showOriginal ? languageCode : 'EN'}</span>
            </button>
          )}

          {duration && duration !== '0:00' && !hasError && (
            <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-medium text-white z-20">{duration}</div>
          )}

          {/* Platform Icon - UNIFIED STYLING */}
          {!selectionMode && !hasError && (
            <div className="absolute top-3 right-3 z-20">
              <div className="w-7 h-7 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white shadow-sm overflow-hidden">
                {platform === 'instagram' && (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                    <defs>
                      <linearGradient id={`instagram-gradient-${videoId || 'x'}`} x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#FED373" /><stop offset="25%" stopColor="#F15245" /><stop offset="50%" stopColor="#D92E7F" /><stop offset="75%" stopColor="#9B36B7" /><stop offset="100%" stopColor="#515ECF" />
                      </linearGradient>
                    </defs>
                    <rect x="2" y="2" width="20" height="20" rx="5" fill={`url(#instagram-gradient-${videoId || 'x'})`} /><circle cx="12" cy="12" r="4" stroke="white" strokeWidth="2" fill="none" /><circle cx="17.5" cy="6.5" r="1.5" fill="white" />
                  </svg>
                )}
                {platform === 'facebook' && (
                  <svg viewBox="0 0 24 24" fill="#1877F2" className="w-5 h-5">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                )}
                {platform === 'youtube' && (
                  <svg viewBox="0 0 24 24" fill="#FF0000" className="w-5 h-5">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                )}
                {platform === 'tiktok' && (
                  <svg viewBox="0 0 24 24" fill="#000000" className="w-5 h-5">
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.06-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.9-.32-1.98-.23-2.81.31-.75.42-1.24 1.17-1.35 1.97-.08.76.11 1.57.54 2.2.44.67 1.18 1.15 1.97 1.28.85.14 1.73-.09 2.4-.62.59-.44.97-1.09 1.08-1.81.11-1.15.06-2.31.06-3.46 0-4.82-.01-9.65.01-14.47z"/>
                  </svg>
                )}
              </div>
            </div>
          )}

          {/* Heart Button */}
          {!selectionMode && !hasError && (
            <div className="absolute inset-0 p-4 flex flex-col justify-start z-30 pointer-events-none">
              <div className="flex justify-start pointer-events-auto">
                <button
                  onClick={handleHeartClick}
                  disabled={isDisabled}
                  className={`
                    absolute top-3 left-3 flex-shrink-0 z-30
                    w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200
                    ${isDisabled
                      ? 'bg-transparent opacity-30 cursor-not-allowed'
                      : 'bg-white/20 backdrop-blur-md hover:bg-white/60 shadow-sm'
                    }
                  `}
                >
                  <Heart
                    size={18}
                    color="#FF2C00"
                    fill={isFavorite ? '#e63946' : 'transparent'}
                    strokeWidth={2.5}
                    style={{ transition: 'all 250ms ease-out', opacity: isFavorite ? 1 : 0.8 }}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-1">
          <h3 onClick={handleCardClick} className={`font-semibold text-gray-900 leading-tight line-clamp-2 transition-colors ${isDisabled ? 'cursor-default opacity-50' : 'hover:text-primary-600 cursor-pointer'}`} title={displayTitle}>{displayTitle}</h3>
          <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-1.5 w-fit group/author" onClick={(e) => { e.stopPropagation(); if (isDisabled) e.preventDefault(); }}>
            {platform === 'facebook' ? (
              <svg className="w-3 h-3 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            ) : (
              <svg className="w-3 h-3 text-pink-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" /></svg>
            )}
            <span className={`text-xs font-medium text-gray-500 truncate group-hover/author:text-gray-900 transition-colors ${isDisabled ? 'opacity-50' : ''}`}>{author}</span>
          </a>
        </div>
      </div>

      <ConfirmModal
        isOpen={showRemoveConfirm}
        onClose={() => setShowRemoveConfirm(false)}
        onConfirm={confirmRemoveFavorite}
        title={t('videoCard:removeFavoriteTitle', 'Remove Favorite')}
        message={t('videoCard:removeFavoriteMessage', 'Are you sure you want to remove this video from your favorites?')}
        confirmLabel={t('common:remove', 'Remove')}
        variant="danger"
      />
    </>
  );
};

export const VideoCard = React.memo(VideoCardComponent);