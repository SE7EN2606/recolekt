import { API_BASE } from "../utils/api";
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Globe, Loader2, CheckCircle2, AlertCircle, RefreshCw, Trash2, CircleSlash2, Folder as FolderIcon } from 'lucide-react';
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

const getFolderName = (folderId: string, folders: any[]): string | null => {
  if (!folderId || folderId === 'all' || folderId === 'unsorted' || folderId === 'default') return null;
  if (folderId === 'favorites') return 'Favorites';
  for (const folder of folders) {
    if (folder.id === folderId) return folder.name;
    if (folder.subFolders) {
      const sub = getFolderName(folderId, folder.subFolders);
      if (sub) return sub;
    }
  }
  return null;
};

function resolveTitle(video: any, t: any): { english: string; original: string; hasTwoLanguages: boolean } {
  const DEFAULT = t('videoCard:untitledVideo', 'Saved Video');

  let summaryObj = video?.summary ?? video?.summary_text ?? video?.raw?.summary ?? {};
  if (typeof summaryObj === 'string') {
    try { summaryObj = JSON.parse(summaryObj); } catch(e) { summaryObj = {}; }
  }

  const sumEngTitle = safeStr(summaryObj?.english?.title).trim();
  const sumOrigTitle = safeStr(summaryObj?.original?.title).trim();

  let recipeObj = video?.recipe ?? video?.raw?.recipe ?? {};
  if (typeof recipeObj === 'string') {
    try { recipeObj = JSON.parse(recipeObj); } catch(e) { recipeObj = {}; }
  }
  if (recipeObj?.recipe) recipeObj = recipeObj.recipe;

  const recEngTitle = safeStr(recipeObj?.english?.title).trim();
  const recOrigTitle = safeStr(recipeObj?.original?.title).trim();

  const dbTitle = safeStr(video?.summary_title ?? video?.summaryTitle).trim();

  let passedTitle = safeStr(video?.title).trim();
  const captionCutoff = safeStr(video?.caption ?? '').split('\n')[0].substring(0, 56).trim();
  if (passedTitle === captionCutoff || passedTitle.length === 56) {
    passedTitle = '';
  }

  const english = sumEngTitle || recEngTitle || dbTitle || passedTitle || summaryObj?.title || safeStr(video?.caption ?? '').split('\n')[0].trim() || DEFAULT;
  const original = sumOrigTitle || recOrigTitle || dbTitle || passedTitle || summaryObj?.title || english;
  const hasTwoLanguages = !!(sumEngTitle && sumOrigTitle) || !!(recEngTitle && recOrigTitle);

  return { english, original, hasTwoLanguages };
}

const VideoCardComponent: React.FC<VideoCardProps> = ({ video, selected, onToggleSelect, selectionMode }) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation(['videoCard', 'common']);
  const { toggleFavorite, addVideo, deleteVideos, folders } = useData();

  const videoId = video?.id ?? video?.process_id ?? video?.processId ?? '';

  const [isFavorite, setIsFavorite] = useState(Boolean(video?.isFavorite ?? video?.is_favorite ?? false));
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
  const thumbnailUrl = video?.thumbnailUrl || video?.thumbnail_url || video?.gcs_urls?.preview_thumbnail || video?.gcsUrls?.previewThumbnail || video?.preview_thumbnail || '';

  useEffect(() => {
    if (imgRef.current && imgRef.current.complete) setImageLoaded(true);
  }, [thumbnailUrl]);

  const isDone = video?.status === 'done' || video?.status === 'completed';
  const isMissingThumbnail = isDone && !thumbnailUrl;
  const hasError = isFailedStatus || isMissingThumbnail;
  const isDisabled = isProcessing || hasError;

  const isSorted = Boolean(video.folderId && video.folderId !== 'all' && video.folderId !== 'unsorted' && video.folderId !== 'default');

  const folderName = useMemo(
    () => getFolderName(video?.folderId || '', folders || []),
    [video?.folderId, folders]
  );

  const { english: englishTitle, original: originalTitle, hasTwoLanguages } = useMemo(() => resolveTitle(video, t), [video, t]);
  const displayTitle = showOriginal ? originalTitle : englishTitle;

  let languageCode = 'EN';
  const transcriptionObj = video?.transcription ?? video?.raw?.transcription ?? video?.__raw?.transcription;
  if (transcriptionObj?.detected_language) {
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
    if (isFavorite) { setShowRemoveConfirm(true); return; }
    setAnimateHeart(true);
    setIsFavorite(true);
    setTimeout(() => setAnimateHeart(false), 400);
    try { await toggleFavorite(videoId); } catch (err) { setIsFavorite(false); }
  };

  const confirmRemoveFavorite = async () => {
    setIsFavorite(false);
    setShowRemoveConfirm(false);
    try { await toggleFavorite(videoId); } catch (err) { setIsFavorite(true); }
  };

  const handleLanguageToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled) return;
    setShowOriginal((prev) => !prev);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (isDisabled) { e.preventDefault(); e.stopPropagation(); return; }
    if (selectionMode) { e.preventDefault(); e.stopPropagation(); onToggleSelect?.(); }
    else { navigate(`/video/${videoId}`); }
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

  const errorText = video?.errorMessage || video?.error_message || video?.raw?.errormessage
    || (isMissingThumbnail ? t('videoCard:missingThumbnailText', 'Media download failed.') : t('videoCard:defaultError'));

  return (
    <>
      <div
        onClick={handleCardClick}
        className={`relative rounded-2xl overflow-hidden aspect-[9/16] shadow-sm transition-all duration-300 bg-gray-100 cursor-pointer hover:shadow-lg ${selected ? 'ring-2 ring-primary-600 ring-offset-2' : ''} group`}
      >
        {/* Fade overlay for disabled state */}
        <div className={`absolute inset-0 bg-gray-200 transition-opacity duration-200 ${isDisabled ? 'opacity-40' : 'opacity-0'}`} />

        {/* Thumbnail */}
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
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-gray-50">
            {!hasError && !isProcessing && (
              <span className="text-gray-300 text-xs font-medium">{t('videoCard:noPreview')}</span>
            )}
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 pointer-events-none z-20" />

        {/* Selection overlay */}
        {selectionMode && selected && (
          <div className="absolute inset-0 bg-primary-600/20 z-20 pointer-events-none" />
        )}

        {/* Processing state */}
        {isProcessing && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-sm">
            <Loader2 size={28} className="text-white animate-spin" />
            <span className="text-white text-xs font-bold uppercase tracking-wider">{t('videoCard:processing')}</span>
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 p-4 bg-black/60 backdrop-blur-sm">
            <AlertCircle size={28} className="text-red-400" />
            <div className="text-center">
              <p className="text-white text-xs font-bold mb-1">{t('videoCard:processingFailed')}</p>
              <p className="text-gray-300 text-[10px] leading-tight">{errorText}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={handleRetry} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg transition-colors">
                {isRetrying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {t('common:tryAgain')}
              </button>
              <button onClick={handleDelete} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/80 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors">
                {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                {t('common:remove')}
              </button>
            </div>
          </div>
        )}

        {/* Heart / Favorite */}
        {!selectionMode && !hasError && (
          <button
            onClick={handleHeartClick}
            className={`absolute top-3 left-3 favorite-heart z-30 ${animateHeart ? 'scale-125' : ''} transition-transform`}
          >
            <Heart
              size={24}
              className={isFavorite ? 'text-red-500 fill-red-500' : 'text-white drop-shadow'}
              aria-hidden="true"
            />
          </button>
        )}

        {/* Selection checkbox */}
        {selectionMode && (
          <div onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }} className="absolute top-3 left-3 z-30">
            {selected
              ? <CheckCircle2 size={24} className="text-primary-600 fill-white" />
              : <div className="w-6 h-6 rounded-full border-2 border-white/80 bg-black/20" />
            }
          </div>
        )}

        {/* Sorted / Unsorted indicator — top right */}
        {!selectionMode && !hasError && !isProcessing && (
          <div className="absolute top-3 right-3 z-30 pointer-events-none">
            <div className="w-7 h-7 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white shadow-sm">
              {isSorted ? (
                <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center" title="sorted">
                  <CheckCircle2 size={12} className="text-white" aria-hidden="true" />
                </div>
              ) : (
                <div className="w-5 h-5 bg-gray-400/80 rounded-full flex items-center justify-center" title="unsorted">
                  <CircleSlash2 size={12} className="text-white" aria-hidden="true" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Folder badge — bottom left */}
        {folderName && !isDisabled && !selectionMode && (
          <div className="absolute bottom-3 left-3 z-30" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full shadow-lg">
              <FolderIcon size={11} className="text-primary-400 flex-shrink-0" strokeWidth={2.5} />
              <span className="text-[10px] font-bold text-white uppercase tracking-wide leading-none truncate max-w-[80px]">
                {folderName}
              </span>
            </div>
          </div>
        )}

        {/* Language toggle — bottom left, only when no folder badge, desktop only */}
        {hasTwoLanguages && !isDisabled && !selectionMode && !folderName && (
          <button
            onClick={handleLanguageToggle}
            className="hidden md:flex absolute bottom-3 left-3 px-3 py-1.5 rounded-lg items-center gap-1.5 z-30 shadow-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
            title={`Affichage en ${showOriginal ? languageCode : 'EN'}`}
          >
            <Globe size={14} aria-hidden="true" />
            <span className="text-[11px] font-bold uppercase">{showOriginal ? languageCode : 'EN'}</span>
          </button>
        )}

        {/* Duration — bottom right, desktop only */}
        {duration && duration !== '0:00' && !hasError && (
          <div className="hidden md:block absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-medium text-white z-30">
            {duration}
          </div>
        )}
      </div>

      {/* Title + Author row */}
      <div className="pt-3 px-0.5">
        <p className="text-sm font-bold text-gray-900 leading-snug line-clamp-2 mb-1">{displayTitle}</p>
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => { e.stopPropagation(); if (isDisabled) e.preventDefault(); }}
          className="inline-flex items-center gap-1.5 group/author"
        >
          <PlatformIconAuthor platform={platform} />
          <span className="text-xs text-gray-400 font-medium truncate max-w-[140px] group-hover/author:text-gray-700 transition-colors">
            {author}
          </span>
        </a>
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
