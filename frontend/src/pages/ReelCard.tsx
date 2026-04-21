import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart, Loader2, CheckCircle2, AlertCircle, RefreshCw, Trash2,
  CircleSlash2, Folder as FolderIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useData } from '../context/DataContext';
import { ConfirmModal } from '../components/ConfirmModal';
import { PlatformIconAuthor } from '../components/CustomIcons';
import {
  ContentTypeBadge,
  resolveContentType,
  deriveToolsSubtype,
  type ContentType,
  type ToolsSubtype,
} from '../components/ContentTypeBadge';

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

const parseMaybeJson = <T,>(value: unknown, fallback: T): T => {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  if (typeof value === 'object') return value as T;
  return fallback;
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

function resolveTitle(video: any, t: any): string {
  const DEFAULT = t('videoCard:untitledVideo', 'Saved Video');

  let summaryObj: any = video?.summary ?? video?.summary_text ?? video?.raw?.summary ?? {};
  if (typeof summaryObj === 'string') {
    try {
      summaryObj = JSON.parse(summaryObj);
    } catch {
      summaryObj = {};
    }
  }
  const sumEngTitle = safeStr(summaryObj?.english?.title).trim();

  let recipeObj: any = video?.recipe ?? video?.raw?.recipe ?? {};
  if (typeof recipeObj === 'string') {
    try {
      recipeObj = JSON.parse(recipeObj);
    } catch {
      recipeObj = {};
    }
  }
  if (recipeObj?.recipe) recipeObj = recipeObj.recipe;
  const recEngTitle = safeStr(recipeObj?.english?.title).trim();

  const dbTitle = safeStr(video?.summary_title ?? video?.summaryTitle).trim();
  let passedTitle = safeStr(video?.title).trim();
  const captionCutoff = safeStr(video?.caption ?? '').split('\n')[0].substring(0, 56).trim();

  if (passedTitle === captionCutoff) passedTitle = '';
  if (passedTitle.length > 56) passedTitle = '';

  return (
    sumEngTitle ||
    recEngTitle ||
    dbTitle ||
    passedTitle ||
    safeStr(summaryObj?.title) ||
    safeStr(video?.caption ?? '').split('\n')[0].trim() ||
    DEFAULT
  );
}

function getRawContentType(video: any): string {
  return safeStr(
    video?.contenttype ??
    video?.content_type ??
    video?.contentType ??
    video?.raw?.content_type ??
    video?.raw?.contenttype
  ).toLowerCase();
}

function resolveVideoContentType(video: any): ContentType {
  return resolveContentType(getRawContentType(video));
}

function isToolsSubtype(value: unknown): value is ToolsSubtype {
  return value === 'software'
    || value === 'lifestyle'
    || value === 'gear'
    || value === 'food'
    || value === 'ranking'
    || value === 'tier'
    || value === 'verdict'
    || value === 'grouped'
    || value === 'picks';
}

function getToolsList(video: any): any {
  const raw =
    video?.toolslist ??
    video?.tools_list ??
    video?.toolsList ??
    video?.raw?.toolslist ??
    video?.raw?.tools_list;

  return parseMaybeJson<any>(raw, null);
}

function getToolsSubtypeForBadge(video: any): ToolsSubtype {
  const rootSubtype = safeStr(
    video?.list_subtype ??
    video?.listSubtype ??
    video?.raw?.list_subtype
  ).toLowerCase();

  if (isToolsSubtype(rootSubtype)) return rootSubtype;

  const toolsList = getToolsList(video);
  const derived = deriveToolsSubtype(toolsList);
  return isToolsSubtype(derived) ? derived : 'picks';
}

const PROCESSING_MESSAGES = [
  'msg_indexing', 'msg_parsing', 'msg_visual', 'msg_auditory',
  'msg_analysing', 'msg_decoding', 'msg_semantic', 'msg_contextual',
  'msg_identifying', 'msg_mapping', 'msg_inferring', 'msg_correlating',
  'msg_synthesizing', 'msg_distilling', 'msg_abstracting', 'msg_interpreting',
  'msg_ideating', 'msg_curating', 'msg_refining', 'msg_tuning',
  'msg_optimizing', 'msg_polishing', 'msg_finalizing',
];

const RESTRICTED_CONTENT = 'RESTRICTED_CONTENT';

const VideoCardComponent: React.FC<VideoCardProps> = ({ video, selected, onToggleSelect, selectionMode }) => {
  const navigate = useNavigate();
  const { t } = useTranslation(['videoCard', 'gallery', 'common']);
  const { toggleFavorite, addVideo, deleteVideos, folders } = useData();

  const videoId = video?.id ?? video?.process_id ?? video?.processId ?? '';

  const [isFavorite, setIsFavorite] = useState(Boolean(video?.isFavorite ?? video?.is_favorite ?? false));
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [animateHeart, setAnimateHeart] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const [scanState, setScanState] = useState<'h-active' | 'v-active'>('h-active');

  const imgRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setIsFavorite(Boolean(video?.isFavorite ?? video?.is_favorite ?? false));
  }, [video?.isFavorite, video?.is_favorite, videoId]);

  const isProcessing = video?.category === 'Processing' || video?.status === 'processing';
  const isFailedStatus = video?.category === 'Failed' || video?.status === 'error' || video?.status === 'failed';

  const thumbnailUrl = (
    video?.posterUrl ||
    video?.coverUrl ||
    video?.gcs_urls?.poster ||
    video?.thumbnailUrl ||
    video?.thumbnail_url ||
    video?.gcs_urls?.preview_thumbnail ||
    video?.gcsUrls?.previewThumbnail ||
    video?.preview_thumbnail ||
    ''
  );

  useEffect(() => {
    if (!isProcessing) return;
    const msgInterval = setInterval(() => setMsgIndex(p => (p + 1) % PROCESSING_MESSAGES.length), 2000);
    const scanInterval = setInterval(() => setScanState(p => (p === 'h-active' ? 'v-active' : 'h-active')), 4000);

    return () => {
      clearInterval(msgInterval);
      clearInterval(scanInterval);
    };
  }, [isProcessing]);

  useEffect(() => {
    if (imgRef.current?.complete) setImageLoaded(true);
  }, [thumbnailUrl]);

  const isDone = video?.status === 'done' || video?.status === 'completed';
  const isMissingThumb = isDone && !thumbnailUrl;
  const hasError = isFailedStatus || isMissingThumb;
  const isDisabled = isProcessing || hasError;

  const folderId = video?.folderId ?? video?.folder_id ?? '';
  const isSorted = Boolean(
    folderId &&
    folderId !== 'all' &&
    folderId !== 'unsorted' &&
    folderId !== 'default',
  );

  const folderName = useMemo(
    () => getFolderName(folderId, folders || []),
    [folderId, folders],
  );

  const displayTitle = useMemo(() => resolveTitle(video, t), [video, t]);
  const contentType = useMemo(() => resolveVideoContentType(video), [video]);

  const toolsSubtype = useMemo(
    () => (
      contentType === 'products' ||
      contentType === 'software' ||
      contentType === 'finance'
    )
      ? getToolsSubtypeForBadge(video)
      : undefined,
    [video, contentType],
  );

  const showTypeBadge = !isProcessing && !hasError && contentType !== 'general';

  const hasLocation = useMemo(() => {
    const loc = video?.location;
    if (!loc) return false;

    if (typeof loc === 'string') {
      try {
        const parsed = JSON.parse(loc);
        if (Array.isArray(parsed)) return parsed.length > 0;
        if (parsed && typeof parsed === 'object') {
          return !!(parsed.places?.length || parsed.items?.length || parsed.name);
        }
      } catch {
        return false;
      }
    }

    if (Array.isArray(loc)) return loc.length > 0;

    if (typeof loc === 'object') {
      return !!(
        (loc as any).name ||
        ((loc as any).places?.length > 0) ||
        ((loc as any).items?.length > 0)
      );
    }

    return false;
  }, [video?.location]);

  const showPlacesBadge = !isProcessing && !hasError && hasLocation && contentType !== 'places';

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

  const handleHeartClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled || !navigator.onLine) return;

    if (isFavorite) {
      setShowRemoveConfirm(true);
      return;
    }

    setAnimateHeart(true);
    setIsFavorite(true);
    setTimeout(() => setAnimateHeart(false), 400);

    try {
      await toggleFavorite(videoId);
    } catch {
      setIsFavorite(false);
    }
  };

  const confirmRemoveFavorite = async () => {
    setIsFavorite(false);
    setShowRemoveConfirm(false);

    try {
      await toggleFavorite(videoId);
    } catch {
      setIsFavorite(true);
    }
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
    if (!sourceUrl || isRetrying || !navigator.onLine) return;

    setIsRetrying(true);
    try {
      await addVideo(sourceUrl, true);
    } catch {
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!videoId || isDeleting || !navigator.onLine) return;

    setIsDeleting(true);
    try {
      await deleteVideos([videoId]);
    } catch {
      setIsDeleting(false);
    }
  };

  const rawError = video?.errorMessage || video?.error_message || video?.error_code || video?.raw?.errormessage;
  let errorText = t('videoCard:defaultError', 'Media download failed.');
  if (rawError === RESTRICTED_CONTENT) {
    errorText = t('videoCard:restrictedContent', 'Instagram blocked this video (Sensitive or Private).');
  } else if (isMissingThumb) {
    errorText = t('videoCard:missingThumbnailText', 'Media download failed.');
  } else if (rawError) {
    errorText = rawError;
  }

  return (
    <>
      <div
        onClick={handleCardClick}
        className={`
          relative rounded-2xl overflow-hidden aspect-9/16 shadow-sm
          transition-all duration-300 bg-slate-900 cursor-pointer hover:shadow-lg
          ${selected ? 'ring-2 ring-primary-600 ring-offset-2' : ''} group
        `}
      >
        {!imageLoaded && !hasError && !isProcessing && (
          <div className="placeholder-skeleton" />
        )}

        {thumbnailUrl ? (
          <img
            ref={imgRef}
            src={thumbnailUrl}
            alt={displayTitle}
            onLoad={() => setImageLoaded(true)}
            loading="lazy"
            decoding="async"
            className={`
              absolute inset-0 w-full h-full object-cover transition-all duration-200 z-10
              ${imageLoaded ? 'opacity-100' : 'opacity-0'}
              ${!selected ? 'group-hover:scale-105' : ''}
            `}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-900">
            {!hasError && !isProcessing && (
              <span className="text-gray-500 text-xs font-medium">{t('videoCard:noPreview')}</span>
            )}
          </div>
        )}

        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent opacity-80 pointer-events-none z-20" />

        {selectionMode && selected && (
          <div className="absolute inset-0 bg-primary-600/20 z-20 pointer-events-none" />
        )}

        {isProcessing && (
          <div className="absolute inset-0 z-40 bg-slate-900 overflow-hidden shadow-[0_0_20px_rgba(124,58,237,0.25)] border border-primary-500/40">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt="Processing"
                className="absolute inset-0 w-full h-full object-cover opacity-70 blur-sm scale-110 z-0"
              />
            ) : (
              <div className="absolute inset-0 bg-slate-900 z-0" />
            )}
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-10" />

            <div className={`absolute -top-full left-0 w-full h-full z-30 pointer-events-none will-change-transform ${scanState === 'h-active' ? 'h-active' : 'idle'}`}>
              <div className="absolute bottom-0 left-0 w-full h-px bg-primary-400 shadow-[0_0_8px_1px_rgba(167,139,250,1)]" />
            </div>

            <div className={`absolute top-0 -left-full w-full h-full z-30 pointer-events-none will-change-transform ${scanState === 'v-active' ? 'v-active' : 'idle'}`}>
              <div className="absolute top-0 right-0 h-full w-px bg-primary-400 shadow-[0_0_8px_1px_rgba(167,139,250,1)]" />
            </div>

            <div className="absolute inset-0 flex flex-col items-center justify-center z-40 pointer-events-none px-4 text-center">
              <Loader2 className="w-10 h-10 text-primary-400 animate-spin mb-3 drop-shadow-[0_0_10px_rgba(167,139,250,0.6)]" />
              <span
                key={msgIndex}
                className="text-primary-200 text-[12px] font-medium tracking-widest lowercase drop-shadow-md ai-message will-change-transform"
              >
                {t(`gallery:${PROCESSING_MESSAGES[msgIndex]}`, 'processing...')}
              </span>
            </div>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 p-4 bg-black/70 backdrop-blur-sm border border-red-500/30 rounded-2xl">
            <AlertCircle size={28} className="text-red-400 drop-shadow-md" />
            <div className="text-center">
              <p className="text-white text-xs font-bold mb-1">{t('videoCard:processingFailed')}</p>
              <p className="text-gray-300 text-[10px] leading-tight line-clamp-2">{errorText}</p>
            </div>
            <div className="flex gap-2 mt-1">
              <button
                onClick={handleRetry}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold rounded-lg transition-colors border border-white/10"
              >
                {isRetrying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {t('common:tryAgain')}
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-200 hover:text-white text-[10px] font-bold rounded-lg transition-colors border border-red-500/30"
              >
                {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                {t('common:remove')}
              </button>
            </div>
          </div>
        )}

        {!selectionMode && !hasError && (
          <button
            onClick={handleHeartClick}
            className={`absolute top-3 left-3 favorite-heart z-30 ${animateHeart ? 'heart-animate' : ''} transition-transform`}
          >
            <Heart
              size={24}
              className={isFavorite ? 'favorited' : 'text-white drop-shadow'}
              aria-hidden="true"
            />
          </button>
        )}

        {selectionMode && (
          <div
            onClick={e => {
              e.stopPropagation();
              onToggleSelect?.();
            }}
            className="absolute top-3 left-3 z-30"
          >
            {selected
              ? <CheckCircle2 size={24} className="text-primary-600 fill-white" />
              : <div className="w-6 h-6 rounded-full border-2 border-white/80 bg-black/20" />}
          </div>
        )}

        {!selectionMode && !hasError && !isProcessing && (
          <div className="absolute top-3 right-3 z-30 pointer-events-none">
            <div className="w-7 h-7 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20 shadow-sm">
              {isSorted ? (
                <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                  <CheckCircle2 size={12} className="text-white" />
                </div>
              ) : (
                <div className="w-5 h-5 bg-gray-400/80 rounded-full flex items-center justify-center">
                  <CircleSlash2 size={12} className="text-white" />
                </div>
              )}
            </div>
          </div>
        )}

        {folderName && !isDisabled && !selectionMode && (
          <div className="absolute bottom-3 left-3 z-30">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full shadow-lg">
              <FolderIcon size={11} className="text-primary-400" strokeWidth={2.5} />
              <span className="text-[10px] font-bold text-white uppercase tracking-wide truncate max-w-20">
                {folderName}
              </span>
            </div>
          </div>
        )}

        {duration && duration !== '0:00' && !hasError && !isProcessing && (
          <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px] font-bold text-white z-30 shadow-md">
            {duration}
          </div>
        )}
      </div>

      <div className="pt-3 px-0.5">
        {(showTypeBadge || showPlacesBadge) && (
          <div className="flex flex-wrap items-center gap-1 mb-1.5">
            {showTypeBadge && (
              <ContentTypeBadge
                type={contentType}
                toolsSubtype={toolsSubtype}
              />
            )}
            {showPlacesBadge && <ContentTypeBadge type="places" />}
          </div>
        )}

        <p className="text-sm font-bold text-gray-900 leading-snug line-clamp-2 mb-1">
          {displayTitle}
        </p>

        {!isProcessing && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => {
              e.stopPropagation();
              if (isDisabled) e.preventDefault();
            }}
            className="inline-flex items-center gap-1.5 group/author w-max mt-1"
          >
            <PlatformIconAuthor platform={platform} />
            <span className="text-xs text-gray-400 font-medium truncate max-w-30 group-hover/author:text-gray-700 transition-colors">
              {author}
            </span>
          </a>
        )}
      </div>

      <ConfirmModal
        isOpen={showRemoveConfirm}
        onClose={() => setShowRemoveConfirm(false)}
        onConfirm={confirmRemoveFavorite}
        title={t('videoCard:removeFavoriteTitle')}
        message={t('videoCard:removeFavoriteMessage')}
        confirmLabel={t('common:remove')}
        variant="danger"
      />
    </>
  );
};

export const VideoCard = React.memo(VideoCardComponent);