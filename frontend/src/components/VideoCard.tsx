import { API_BASE } from "../utils/api";
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Heart, Loader2, CheckCircle2, AlertCircle, RefreshCw, Trash2,
  CircleSlash2, Folder as FolderIcon, Globe, StickyNote, Clock3, ChefHat,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useData } from '../context/DataContext';
import { ConfirmModal } from '../components/ConfirmModal';
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
  variant?: 'gallery' | 'cookbook';
}

const safeStr = (v: any): string => {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return String(v);
};

const parseMaybeJson = <T,>(value: unknown, fallback: T): T => {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  if (typeof value === 'object') return value as T;
  return fallback;
};

const getFolderName = (folderId: string, folders: any): string | null => {
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

  let summaryObj: any = video?.summary ?? video?.summarytext ?? video?.raw?.summary ?? {};
  if (typeof summaryObj === 'string') {
    try { summaryObj = JSON.parse(summaryObj); } catch { summaryObj = {}; }
  }

  const sumEngTitle = safeStr(summaryObj?.english?.title).trim();

  let recipeObj: any = video?.recipe ?? video?.raw?.recipe ?? {};
  if (typeof recipeObj === 'string') {
    try { recipeObj = JSON.parse(recipeObj); } catch { recipeObj = {}; }
  }
  if (recipeObj?.recipe) recipeObj = recipeObj.recipe;

  const recEngTitle = safeStr(recipeObj?.english?.title).trim();
  const dbTitle = safeStr(video?.summarytitle ?? video?.summaryTitle).trim();

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

function resolveOriginalTitle(video: any): string | null {
  let summaryObj: any = video?.summary ?? video?.summarytext ?? video?.raw?.summary ?? {};
  if (typeof summaryObj === 'string') {
    try { summaryObj = JSON.parse(summaryObj); } catch { summaryObj = {}; }
  }
  const origTitle = safeStr(summaryObj?.original?.title).trim();
  const engTitle = safeStr(summaryObj?.english?.title).trim();
  if (origTitle && engTitle && origTitle !== engTitle) return origTitle;
  return null;
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
  return value === 'software' || value === 'lifestyle' || value === 'gear'
    || value === 'food' || value === 'ranking' || value === 'tier'
    || value === 'verdict' || value === 'grouped' || value === 'picks';
}

function getToolsList(video: any): any {
  const raw =
    video?.toolslist ?? video?.tools_list ?? video?.toolsList ??
    video?.raw?.toolslist ?? video?.raw?.tools_list;
  return parseMaybeJson<any>(raw, null);
}

function getToolsSubtypeForBadge(video: any): ToolsSubtype {
  const rootSubtype = safeStr(
    video?.list_subtype ?? video?.listSubtype ?? video?.raw?.list_subtype
  ).toLowerCase();
  if (isToolsSubtype(rootSubtype)) return rootSubtype;
  const toolsList = getToolsList(video);
  const derived = deriveToolsSubtype(toolsList);
  return isToolsSubtype(derived) ? derived : 'picks';
}

function getRecipeUserState(video: any) {
  const raw = video?.recipeUserState ?? video?.recipe_user_state ?? video?.raw?.recipe_user_state ?? {};
  const cookCount = Number(raw?.cookCount ?? raw?.cook_count ?? 0);

  return {
    cookCount: Number.isFinite(cookCount) && cookCount > 0 ? cookCount : 0,
    hasNote: Boolean(raw?.hasNote ?? raw?.has_note),
    hasActiveSession: Boolean(raw?.hasActiveSession ?? raw?.has_active_session),
  };
}

function getRecipeIdentityChips(video: any): string[] {
  const chips: string[] = [];
  const addChip = (value: unknown) => {
    const label = safeStr(value).trim();
    if (!label) return;
    const normalized = label.toLowerCase();
    if (chips.some(chip => chip.toLowerCase() === normalized)) return;
    chips.push(label);
  };

  const summaryObj = parseMaybeJson<any>(video?.summary ?? video?.summarytext ?? video?.raw?.summary, {});
  let recipeObj = parseMaybeJson<any>(video?.recipe ?? video?.raw?.recipe, {});
  if (recipeObj?.recipe) recipeObj = recipeObj.recipe;

  addChip(recipeObj?.cuisine);
  addChip(recipeObj?.cuisine_type);
  addChip(recipeObj?.method);
  addChip(recipeObj?.cooking_method);
  addChip(video?.summary_topic ?? video?.summaryTopic ?? summaryObj?.topic ?? summaryObj?.theme);
  addChip(video?.category !== 'Processing' && video?.category !== 'Failed' ? video?.category : '');

  return chips.slice(0, 2);
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

const VideoCardComponent: React.FC<VideoCardProps> = ({
  video,
  selected,
  onToggleSelect,
  selectionMode,
  variant = 'gallery',
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation(['videoCard', 'gallery', 'common']);
  const { toggleFavorite, addVideo, deleteVideos, folders } = useData();

  const videoId = video?.id ?? video?.process_id ?? video?.processId ?? '';

  const [isFavorite, setIsFavorite] = useState<boolean>(Boolean(video?.isFavorite ?? video?.isfavorite ?? false));
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [animateHeart, setAnimateHeart] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const [scanState, setScanState] = useState<'h-active' | 'v-active'>('h-active');
  const imgRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showOriginalTitle, setShowOriginalTitle] = useState(false);

  useEffect(() => {
    setIsFavorite(Boolean(video?.isFavorite ?? video?.isfavorite ?? false));
  }, [video?.isFavorite, video?.isfavorite, videoId]);

  const isProcessing = video?.category === 'Processing' || video?.status === 'processing';
  const isFailedStatus = video?.category === 'Failed' || video?.status === 'error' || video?.status === 'failed';

  const thumbnailUrl =
    video?.posterUrl || video?.coverUrl || video?.gcsurls?.poster ||
    video?.thumbnailUrl || video?.thumbnailurl ||
    video?.gcsurls?.previewthumbnail || video?.gcsUrls?.previewThumbnail ||
    video?.previewthumbnail || video?.gcs_urls?.preview_thumbnail;

  useEffect(() => {
    if (!isProcessing) return;
    const msgInterval = setInterval(() => setMsgIndex((p) => (p + 1) % PROCESSING_MESSAGES.length), 2000);
    const scanInterval = setInterval(() => setScanState((p) => (p === 'h-active' ? 'v-active' : 'h-active')), 4000);
    return () => { clearInterval(msgInterval); clearInterval(scanInterval); };
  }, [isProcessing]);

  useEffect(() => {
    if (imgRef.current?.complete) setImageLoaded(true);
  }, [thumbnailUrl]);

  const isDone = video?.status === 'done' || video?.status === 'completed';
  const isMissingThumb = isDone && !thumbnailUrl;
  const hasError = isFailedStatus || isMissingThumb;
  const isDisabled = isProcessing || hasError;

  const folderId = video?.folderId ?? video?.folder_id;
  const isSorted = Boolean(
    folderId && folderId !== 'all' && folderId !== 'unsorted' && folderId !== 'default',
  );

  const folderName = useMemo(() => getFolderName(folderId, folders), [folderId, folders]);
  const displayTitle = useMemo(() => resolveTitle(video, t), [video, t]);
  const originalTitle = useMemo(() => resolveOriginalTitle(video), [video]);
  const contentType = useMemo(() => resolveVideoContentType(video), [video]);
  const recipeState = useMemo(() => getRecipeUserState(video), [video]);
  const recipeIdentityChips = useMemo(() => getRecipeIdentityChips(video), [video]);
  const toolsSubtype = useMemo(
    () => (contentType === 'products' || contentType === 'software' || contentType === 'finance')
      ? getToolsSubtypeForBadge(video)
      : undefined,
    [video, contentType],
  );

  const showTypeBadge = !isProcessing && !hasError;

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
      } catch { return false; }
    }
    if (Array.isArray(loc)) return loc.length > 0;
    if (typeof loc === 'object') {
      return !!((loc as any).name || (loc as any).places?.length > 0 || (loc as any).items?.length > 0);
    }
    return false;
  }, [video?.location]);

  const showPlacesBadge = !isProcessing && !hasError && hasLocation && contentType !== 'location' && contentType !== 'places';
  const showRecipeStateBadges = variant === 'cookbook';

  const duration = String(video?.duration ?? '').trim();
  const sourceUrl = String(video?.originalUrl ?? video?.sourceurl ?? video?.sourceUrl ?? video?.raw?.sourceurl ?? '');

  const handleHeartClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled || !navigator.onLine) return;
    if (isFavorite) { setShowRemoveConfirm(true); return; }
    setAnimateHeart(true);
    setIsFavorite(true);
    setTimeout(() => setAnimateHeart(false), 400);
    try { await toggleFavorite(videoId); } catch { setIsFavorite(false); }
  };

  const confirmRemoveFavorite = async () => {
    setIsFavorite(false);
    setShowRemoveConfirm(false);
    try { await toggleFavorite(videoId); } catch { setIsFavorite(true); }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (isDisabled) { e.preventDefault(); e.stopPropagation(); return; }
    if (selectionMode) { e.preventDefault(); e.stopPropagation(); onToggleSelect?.(); }
    else { navigate(`/video/${videoId}`, { state: location.pathname === '/cookbook' ? { from: 'cookbook' } : undefined }); }
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!sourceUrl || isRetrying || !navigator.onLine) return;
    setIsRetrying(true);
    try { await addVideo(sourceUrl, true); } catch {} finally { setIsRetrying(false); }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!videoId || isDeleting || !navigator.onLine) return;
    setIsDeleting(true);
    try { await deleteVideos([videoId]); } catch { setIsDeleting(false); }
  };

  const rawError = video?.errorMessage || video?.errormessage || video?.errorcode || video?.raw?.errormessage;
  let errorText = t('videoCard:defaultError', 'Media download failed.');
  if (rawError === RESTRICTED_CONTENT) {
    errorText = t('videoCard:restrictedContent', 'Instagram blocked this video — Sensitive or Private.');
  } else if (isMissingThumb) {
    errorText = t('videoCard:missingThumbnailText', 'Media download failed.');
  } else if (rawError) {
    errorText = rawError;
  }

  const activeTitle = showOriginalTitle && originalTitle ? originalTitle : displayTitle;

  return (
    <>
      <div
        onClick={handleCardClick}
        className={`relative rounded-2xl overflow-hidden aspect-9/16 shadow-sm transition-all duration-300 bg-slate-900 cursor-pointer hover:shadow-lg ${selected ? 'ring-2 ring-primary-600 ring-offset-2' : ''} group`}
      >
        {!imageLoaded && !hasError && !isProcessing && (
          <div className="placeholder-skeleton" />
        )}

        {thumbnailUrl ? (
          <img
            ref={imgRef}
            src={thumbnailUrl}
            alt={activeTitle}
            onLoad={() => setImageLoaded(true)}
            loading="lazy"
            decoding="async"
            className={`absolute inset-0 w-full h-full object-cover transition-all duration-200 z-10 ${imageLoaded ? 'opacity-100' : 'opacity-0'} ${!selected ? 'group-hover:scale-105' : ''}`}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-900">
            {!hasError && !isProcessing && (
              <span className="text-gray-500 text-xs font-medium">{t('videoCard:noPreview')}</span>
            )}
          </div>
        )}

        {selectionMode && selected && (
          <div className="absolute inset-0 bg-primary-600/20 z-20 pointer-events-none" />
        )}

        {isProcessing && (
          <div className="absolute inset-0 z-40 bg-slate-900 overflow-hidden shadow-[0_0_20px_rgba(124,58,237,0.25)] border border-primary-500/40">
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt="Processing" className="absolute inset-0 w-full h-full object-cover opacity-70 blur-sm scale-110 z-0" />
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
              <span key={msgIndex} className="text-primary-200 text-[12px] font-medium tracking-widest lowercase drop-shadow-md ai-message will-change-transform">
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
            <Heart size={24} className={isFavorite ? 'favorited' : 'text-white drop-shadow'} aria-hidden="true" />
          </button>
        )}

        {selectionMode && (
          <div
            onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
            className="absolute top-3 left-3 z-30"
          >
            {selected
              ? <CheckCircle2 size={24} className="text-primary-600 fill-white" />
              : <div className="w-6 h-6 rounded-full border-2 border-white/80 bg-black/20" />}
          </div>
        )}

        {!selectionMode && !hasError && !isProcessing && !isSorted && (
          <div className="absolute top-3 right-3 z-30 pointer-events-none">
            <div className="w-7 h-7 bg-black/35 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/15 shadow-sm">
              <CircleSlash2 size={13} className="text-white" />
            </div>
          </div>
        )}

        {folderName && !isDisabled && !selectionMode && (
          <div className="absolute bottom-3 left-3 z-30">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full shadow-lg">
              <FolderIcon size={11} className="text-primary-400" strokeWidth={2.5} />
              <span className="text-[10px] font-bold text-white uppercase tracking-wide truncate max-w-[72px] md:max-w-[120px]">{folderName}</span>
            </div>
          </div>
        )}

        {!hasError && !isProcessing && duration && duration !== '0:00' && (
          <div className="absolute bottom-3 right-3 z-30 pointer-events-none">
            <div className="bg-black/55 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px] font-bold text-white shadow-md">
              {duration}
            </div>
          </div>
        )}

      </div>

      {/* Title row with globe toggle (only shown when original title differs from english) */}
      <div className="pt-3 px-0.5" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} style={{userSelect:"text"}}>
        <div className="flex items-start gap-2">
          <p className="flex-1 text-sm font-bold text-gray-900 leading-snug line-clamp-2 mb-1 select-text cursor-text">
            {isProcessing ? 'Processing…' : activeTitle}
          </p>
          {originalTitle && !isDisabled && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowOriginalTitle(p => !p); }}
              className={`flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full border shadow-sm transition-colors mt-0.5 ${
                showOriginalTitle
                  ? 'bg-primary-600 border-primary-700 text-white'
                  : 'bg-white/80 border-gray-200 text-gray-500 hover:text-primary-600 hover:border-primary-300'
              }`}
              title={showOriginalTitle ? 'Show English title' : 'Show original title'}
            >
              <Globe size={12} />
            </button>
          )}
        </div>
        {!hasError && !isProcessing && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {showTypeBadge && <ContentTypeBadge type={contentType} toolsSubtype={toolsSubtype} />}
            {showPlacesBadge && <ContentTypeBadge type="places" />}
            {contentType === 'recipe' && recipeIdentityChips.map(chip => (
              <span key={chip} className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-black text-stone-600">
                {chip}
              </span>
            ))}
          </div>
        )}
        {contentType === 'recipe' && !isDisabled && showRecipeStateBadges && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {recipeState.hasActiveSession && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700 ring-1 ring-amber-100">
                <Clock3 size={10} aria-hidden="true" />
                Cooking
              </span>
            )}
            {recipeState.cookCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-100">
                <ChefHat size={10} aria-hidden="true" />
                Cooked {recipeState.cookCount}×
              </span>
            )}
            {recipeState.hasNote && (
              <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1 text-[10px] font-black text-stone-600">
                <StickyNote size={10} aria-hidden="true" />
                Note
              </span>
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={showRemoveConfirm}
        title={t('videoCard:removeFavoriteTitle', 'Remove from Favorites')}
        message={t('videoCard:removeFavoriteMessage', 'Remove this video from your favorites?')}
        confirmLabel={t('common:remove', 'Remove')}
        onClose={() => setShowRemoveConfirm(false)}
        onConfirm={confirmRemoveFavorite}
      />
    </>
  );
};

export const VideoCard = React.memo(VideoCardComponent);
