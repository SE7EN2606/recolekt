import { API_BASE } from "../utils/api";
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Globe, Loader2, CheckCircle2, AlertCircle, RefreshCw, Trash2, CircleSlash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useData } from '../context/DataContext';
import { ConfirmModal } from './ConfirmModal';
import { PlatformIconAuthor } from '../components/CustomIcons';

interface VideoCardProps {
  video: any;
  selected?: boolean;
  onToggleSelect?: () => void;
  selectionMode?: boolean;
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

  const english = engTitle || topLevelTitle || recipeEngTitle || safeStr(video?.title).trim() || safeStr(video?.caption ?? '').split('\n')[0].trim() || DEFAULT;
  const original = origTitle || recipeOrigTitle || safeStr(video?.title).trim() || english;
  const hasTwoLanguages = !!(engTitle && origTitle) && engTitle !== origTitle;

  return { english, original, hasTwoLanguages };
}

const VideoCardComponent: React.FC<VideoCardProps> = ({ video, selected, onToggleSelect, selectionMode }) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation(['videoCard', 'common']);
  const { toggleFavorite, addVideo, deleteVideos } = useData();

  const videoId = video?.id ?? video?.process_id ?? video?.processId ?? '';

  const [isFavorite, setIsFavorite] = useState<boolean>(Boolean(video?.isFavorite ?? video?.is_favorite ?? false));
  const [showOriginal, setShowOriginal] = useState(i18n.language.startsWith('fr'));
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [animateHeart, setAnimateHeart] = useState(false);
  
  const imgRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setShowOriginal(i18n.language.startsWith('fr'));
  }, [i18n.language]);

  useEffect(() => {
    setIsFavorite(Boolean(video?.isFavorite ?? video?.is_favorite ?? false));
  }, [video?.isFavorite, video?.is_favorite, videoId]);

  const isProcessing = video?.category === 'Processing' || video?.status === 'processing';
  const isFailedStatus = video?.category === 'Failed' || video?.status === 'error' || video?.status === 'failed';

  const thumbnailUrl = video?.thumbnailUrl || video?.thumbnail_url || video?.gcs_urls?.preview_thumbnail || video?.gcsUrls?.previewThumbnail || video?.preview_thumbnail || video?.raw?.gcsurls?.previewthumbnail || '';

  useEffect(() => {
    if (imgRef.current && imgRef.current.complete) {
      setImageLoaded(true);
    }
  }, [thumbnailUrl]);

  const isDone = video?.status === 'done' || video?.status === 'completed';
  const isMissingThumbnail = isDone && !thumbnailUrl;
  const hasError = isFailedStatus || isMissingThumbnail;
  const isDisabled = isProcessing || hasError;

  const isSorted = Boolean(video.folderId && video.folderId !== 'all' && video.folderId !== 'unsorted' && video.folderId !== 'default');

  const { english: englishTitle, original: originalTitle, hasTwoLanguages } = useMemo(() => resolveTitle(video, t), [video, t]);
  const displayTitle = showOriginal ? originalTitle : englishTitle;

  let languageCode = 'EN';
  const transcriptionObj = video?.transcription ?? video?.raw?.transcription ?? video?.__raw?.transcription;
  if (transcriptionObj && transcriptionObj.detected_language) {
    languageCode = String(transcriptionObj.detected_language).toUpperCase();
  } else if (video?.language) {
    languageCode = String(video.language).toUpperCase();
  }
  if (languageCode === 'OG') languageCode = 'EN';

  const author = String(video?.author ?? video?.author_name ?? video?.authorName ?? t('videoCard:unknownAuthor'));
  const duration = video?.duration;
  const sourceUrl = String(video?.originalUrl ?? video?.source_url ?? video?.sourceUrl ?? video?.raw?.sourceurl ?? '');

  const platform = useMemo(() => {
    const url = sourceUrl.toLowerCase();
    if (url.includes('facebook.com') || url.includes('fb.com')) return 'facebook';
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    return 'instagram';
  }, [sourceUrl]);

  const profileUrl = platform === 'instagram' ? `https://www.instagram.com/${author.replace('@', '')}/` : sourceUrl || '#';

  const handleHeartClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); 
    if (isDisabled) return;

    if (isFavorite) {
      setShowRemoveConfirm(true);
      return;
    }

    setAnimateHeart(true);
    setIsFavorite(true);
    setTimeout(() => setAnimateHeart(false), 400);

    try {
      await toggleFavorite(videoId);
    } catch (err) {
      setIsFavorite(false);
    }
  };

  const confirmRemoveFavorite = async () => {
    setIsFavorite(false);
    setShowRemoveConfirm(false);
    try {
      await toggleFavorite(videoId);
    } catch (err) {
      setIsFavorite(true);
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
      e.preventDefault(); e.stopPropagation(); return;
    }
    if (selectionMode) {
      e.preventDefault(); e.stopPropagation(); onToggleSelect?.();
    } else {
      navigate(`/video/${videoId}`);
    }
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!sourceUrl || isRetrying) return;
    setIsRetrying(true);
    try { await addVideo(sourceUrl, true); } catch (err) {} finally { setIsRetrying(false); }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!videoId || isDeleting) return;
    setIsDeleting(true);
    try { await deleteVideos([videoId]); } catch (err) { setIsDeleting(false); }
  };

  const errorText = video?.errorMessage || video?.error_message || video?.raw?.errormessage || (isMissingThumbnail ? t('videoCard:missingThumbnailText', 'Media download failed.') : t('videoCard:defaultError'));

  return (
    <>
      <div className="group relative flex flex-col gap-3 transition-transform duration-300">
        <div
          onClick={handleCardClick}
          className={`relative rounded-2xl overflow-hidden aspect-[9/16] shadow-sm transition-all duration-300 bg-gray-100 ${
            isDisabled ? 'cursor-default' : 'cursor-pointer hover:shadow-lg'
          } ${selected ? 'scale-[0.98]' : ''}`}
        >
          <div className={`absolute inset-0 bg-gray-200 transition-opacity duration-200 ${imageLoaded ? 'opacity-0' : 'opacity-100'}`} />

          {thumbnailUrl ? (
            <img
              ref={imgRef}
              src={thumbnailUrl}
              alt={displayTitle}
              onLoad={() => setImageLoaded(true)}
              className={`absolute inset-0 w-full h-full object-cover transition-all duration-200 z-10 ${imageLoaded ? 'opacity-100' : 'opacity-0'} ${!selected ? 'group-hover:scale-105' : ''}`}
              decoding="async"
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center relative z-10 ${isProcessing ? '' : 'bg-gray-200'}`}>
              {!hasError && !isProcessing && (
                <span className="text-gray-400 text-sm">{t('videoCard:noPreview')}</span>
              )}
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 pointer-events-none z-20" />

          {/* PURPLE SELECTION OVERLAY */}
          {selectionMode && selected && (
            <div className="selected-overlay" />
          )}

          {isProcessing && (
            <div className="processing-overlay z-30">
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
                <button onClick={handleRetry} disabled={isRetrying || isDeleting} className="flex items-center justify-center gap-2 w-full py-2.5 bg-white text-red-600 font-semibold rounded-xl text-sm hover:bg-red-50 transition-colors disabled:opacity-50 shadow-sm">
                  {isRetrying ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  {t('common:tryAgain')}
                </button>
                <button onClick={handleDelete} disabled={isRetrying || isDeleting} className="flex items-center justify-center gap-2 w-full py-2.5 bg-red-700 text-white font-medium rounded-xl text-sm hover:bg-red-800 transition-colors disabled:opacity-50">
                  {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {t('common:remove')}
                </button>
              </div>
            </div>
          )}

          {/* FAVORITE HEART (Top Left) */}
          {!selectionMode && !hasError && (
            <div 
               className={`absolute top-3 left-3 favorite-heart ${animateHeart ? 'heart-animate' : ''} ${isDisabled ? 'opacity-30 cursor-not-allowed pointer-events-none' : ''}`} 
               onClick={handleHeartClick}
            >
              {/* NO TAILWIND COLOR CLASSES - Lets CSS do the work */}
              <Heart className={isFavorite ? 'favorited' : ''} />
            </div>
          )}

          {/* SELECTION RADIO (Top Right) */}
          {selectionMode && (
            <div className="absolute top-3 right-3 modern-radio" onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}>
              <div className={`radio-circle ${selected ? 'radio-active' : ''}`} />
            </div>
          )}

          {/* STATUS INDICATOR (Top Right, Hidden in selection mode) */}
          {!selectionMode && !hasError && !isProcessing && (
            <div className="absolute top-3 right-3 z-30 pointer-events-none">
              <div className="w-7 h-7 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white shadow-sm">
                {isSorted ? (
                  <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center" title={t('common:sorted')}>
                    <CheckCircle2 size={12} strokeWidth={3} className="text-white" />
                  </div>
                ) : (
                  <div className="w-5 h-5 bg-gray-600 rounded-full flex items-center justify-center" title={t('common:unsorted')}>
                    <CircleSlash2 size={12} strokeWidth={3} className="text-white" />
                  </div>
                )}
              </div>
            </div>
          )}

          {hasTwoLanguages && !isDisabled && !selectionMode && (
            <button 
              onClick={handleLanguageToggle} 
              className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg flex items-center gap-1.5 z-30 shadow-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors" 
              title={showOriginal ? t('videoCard:showingLanguage', { lang: languageCode }) : t('videoCard:showingEnglish')}
            >
              <Globe size={14} />
              <span className="text-[11px] font-bold uppercase">{showOriginal ? languageCode : 'EN'}</span>
            </button>
          )}

          {duration && duration !== '0:00' && !hasError && (
            <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-medium text-white z-30">{duration}</div>
          )}
        </div>

        <div className="px-1">
          <h3 onClick={handleCardClick} className={`font-semibold text-gray-900 leading-tight line-clamp-2 transition-colors ${isDisabled ? 'cursor-default opacity-50' : 'hover:text-primary-600 cursor-pointer'}`} title={displayTitle}>{displayTitle}</h3>
          <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-1.5 w-fit group/author" onClick={(e) => { e.stopPropagation(); if (isDisabled) e.preventDefault(); }}>
            <PlatformIconAuthor platform={platform} />
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