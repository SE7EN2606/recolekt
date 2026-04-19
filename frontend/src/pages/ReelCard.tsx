import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart, Loader2, CheckCircle2, AlertCircle, RefreshCw, Trash2,
  CircleSlash2, Folder as FolderIcon, ChefHat, Dumbbell,
  Wrench, Sparkles, Backpack, UtensilsCrossed, Trophy, MapPin,
  Layers3, BadgeAlert, ListOrdered,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useData } from '../context/DataContext';
import { ConfirmModal } from '../components/ConfirmModal';
import { PlatformIconAuthor } from '../components/CustomIcons';


// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface VideoCardProps {
  video: any;
  selected?: boolean;
  onToggleSelect?: () => void;
  selectionMode?: boolean;
}

type ContentType = 'recipe' | 'tools' | 'workout' | 'places' | 'general';
type ToolsSubtype =
  | 'software'
  | 'lifestyle'
  | 'gear'
  | 'food'
  | 'ranking'
  | 'tier'
  | 'verdict'
  | 'grouped'
  | 'picks';


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
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

function resolveTitle(video: any, t: any): string {
  const DEFAULT = t('videoCard:untitledVideo', 'Saved Video');
  let summaryObj = video?.summary ?? video?.summary_text ?? video?.raw?.summary ?? {};
  if (typeof summaryObj === 'string') {
    try { summaryObj = JSON.parse(summaryObj); } catch { summaryObj = {}; }
  }
  const sumEngTitle = safeStr(summaryObj?.english?.title).trim();

  let recipeObj = video?.recipe ?? video?.raw?.recipe ?? {};
  if (typeof recipeObj === 'string') {
    try { recipeObj = JSON.parse(recipeObj); } catch { recipeObj = {}; }
  }
  if (recipeObj?.recipe) recipeObj = recipeObj.recipe;
  const recEngTitle = safeStr(recipeObj?.english?.title).trim();

  const dbTitle = safeStr(video?.summary_title ?? video?.summaryTitle).trim();
  let passedTitle = safeStr(video?.title).trim();
  const captionCutoff = safeStr(video?.caption ?? '').split('\n')[0].substring(0, 56).trim();
  if (passedTitle === captionCutoff || passedTitle.length === 56) passedTitle = '';

  return (
    sumEngTitle || recEngTitle || dbTitle || passedTitle ||
    summaryObj?.title ||
    safeStr(video?.caption ?? '').split('\n')[0].trim() ||
    DEFAULT
  );
}

function resolveContentType(video: any): ContentType {
  const ct = safeStr(video?.content_type).toLowerCase();
  if (ct === 'recipe')  return 'recipe';
  if (ct === 'tools')   return 'tools';
  if (ct === 'workout') return 'workout';
  if (ct === 'places' || ct === 'location') return 'places';
  return 'general';
}

function getParsedToolsList(video: any): any | null {
  let tl = video?.tools_list ?? video?.raw?.tools_list ?? null;
  if (typeof tl === 'string') {
    try { tl = JSON.parse(tl); } catch { return null; }
  }
  return tl || null;
}

const VALID_SUBTYPES = new Set<ToolsSubtype>([
  'software', 'lifestyle', 'gear', 'food', 'ranking', 'tier', 'verdict', 'grouped', 'picks',
]);

function isToolsSubtype(v: string): v is ToolsSubtype {
  return VALID_SUBTYPES.has(v as ToolsSubtype);
}

const LIFESTYLE_SIGNALS = new Set([
  'fragrance','perfume','scent','cologne','parfum','eau de','skincare','beauty',
  'makeup','cosmetic','serum','moisturizer','foundation','lipstick','mascara',
  'cream','lotion','fashion','shirt','jacket','coat','suit','jeans',
  'sneaker','shoe','watch','jewel','jewelry','handbag','purse','luxury',
  'marque','vetement','vêtement','montre','sac',
]);

const GEAR_SIGNALS = new Set([
  'ski','snowboard','surf','skate','bike','cycling','hiking','climbing','running',
  'golf','tennis','yoga','crossfit','camera','lens','drone','microphone',
  'headphone','speaker','keyboard','mouse','monitor','laptop','smartphone','tablet',
  'gear','equipment','kit','setup','rig','matériel','supplement','protein',
  'vitamin','creatine',
]);

const FOOD_SIGNALS = new Set([
  'wine','whisky','whiskey','bourbon','beer','cocktail','coffee','tea',
  'restaurant','food','dish','cuisine','chef','vin','bière','café','boisson',
]);

const SOFTWARE_SIGNALS = new Set([
  'app','website','tool','platform','software','extension','plugin','api','saas',
  'dashboard','chrome','browser','ai','gpt','llm','bot','automation','workflow',
  'integration','notion','figma','slack','github','vercel','supabase',
  'outils','logiciel','application','site web','site',
]);

function deriveToolsSubtype(video: any): ToolsSubtype {
  // 1. Root-level list_subtype — canonical, present on every video object
  const rootSubtype = safeStr(
    video?.list_subtype ??
    video?.listSubtype ??
    video?.list_type
  ).toLowerCase();
  if (isToolsSubtype(rootSubtype)) return rootSubtype;

  // 2. Stored subtype inside tools_list object
  const tl = getParsedToolsList(video);
  if (tl) {
    const stored = safeStr(tl?.list_subtype ?? tl?.listSubtype).toLowerCase();
    if (isToolsSubtype(stored)) return stored;
  }

  // 3. Derive from tools_list content heuristics
  if (!tl) return 'picks';

  const cats: any[] = tl?.en?.categories ?? tl?.categories ?? [];
  if (!Array.isArray(cats) || cats.length === 0) return 'picks';

  let hasUrl = false;
  let isRanked = false;
  let hasTier = false;
  const allText: string[] = [];

  for (const cat of cats) {
    allText.push(safeStr(cat?.name).toLowerCase());
    if (Array.isArray(cat?.items)) {
      for (const item of cat.items) {
        if (item?.url) hasUrl = true;
        if (typeof item?.rank === 'number' && item.rank <= 10) isRanked = true;
        if (typeof item?.tier === 'string' && item.tier.trim()) hasTier = true;
        allText.push(safeStr(item?.name).toLowerCase());
        allText.push(safeStr(item?.description).toLowerCase());
      }
    }
  }

  const combined = allText.join(' ');

  if (hasTier) return 'tier';
  if ([...LIFESTYLE_SIGNALS].some(s => combined.includes(s))) return 'lifestyle';
  if ([...FOOD_SIGNALS].some(s => combined.includes(s)))      return 'food';
  if ([...GEAR_SIGNALS].some(s => combined.includes(s)))      return 'gear';
  if (hasUrl)                                                  return 'software';
  if ([...SOFTWARE_SIGNALS].some(s => combined.includes(s)))  return 'software';
  if (isRanked)                                                return 'ranking';

  return 'picks';
}


// ─────────────────────────────────────────────────────────────────────────────
// Tools subtype badge metadata
// ─────────────────────────────────────────────────────────────────────────────
const TOOLS_SUBTYPE_META: Record<ToolsSubtype, { icon: React.ReactElement; label: string }> = {
  software:  { icon: <Wrench          size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'Software'  },
  lifestyle: { icon: <Sparkles        size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'Lifestyle' },
  gear:      { icon: <Backpack        size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'Gear'      },
  food:      { icon: <UtensilsCrossed size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'Food'      },
  ranking:   { icon: <Trophy          size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'Ranking'   },
  tier:      { icon: <Layers3         size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'Tier List' },
  verdict:   { icon: <BadgeAlert      size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'Verdict'   },
  grouped:   { icon: <ListOrdered     size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'Grouped'   },
  picks:     { icon: <Heart           size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'Picks'     },
};


// ─────────────────────────────────────────────────────────────────────────────
// Content-type badge
// ─────────────────────────────────────────────────────────────────────────────
interface ContentTypeBadgeProps {
  type: ContentType;
  toolsSubtype?: ToolsSubtype;
}

const ContentTypeBadge: React.FC<ContentTypeBadgeProps> = ({ type, toolsSubtype }) => {
  if (type === 'general') return null;

  if (type === 'recipe') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide uppercase bg-orange-50 text-orange-600 border-orange-200">
        <ChefHat size={11} strokeWidth={2.5} aria-hidden="true" />
        Recipe
      </span>
    );
  }

  if (type === 'workout') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide uppercase bg-emerald-50 text-emerald-700 border-emerald-200">
        <Dumbbell size={11} strokeWidth={2.5} aria-hidden="true" />
        Workout
      </span>
    );
  }

  if (type === 'places') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide uppercase bg-sky-50 text-sky-700 border-sky-200">
        <MapPin size={11} strokeWidth={2.5} aria-hidden="true" />
        Places
      </span>
    );
  }

  if (type === 'tools') {
    const { icon, label } = TOOLS_SUBTYPE_META[toolsSubtype ?? 'picks'];
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide uppercase bg-primary-50 text-primary-700 border-primary-200">
        {icon}
        {label}
      </span>
    );
  }

  return null;
};


// ─────────────────────────────────────────────────────────────────────────────
// Processing messages
// ─────────────────────────────────────────────────────────────────────────────
const PROCESSING_MESSAGES = [
  'msg_indexing', 'msg_parsing', 'msg_visual', 'msg_auditory',
  'msg_analysing', 'msg_decoding', 'msg_semantic', 'msg_contextual',
  'msg_identifying', 'msg_mapping', 'msg_inferring', 'msg_correlating',
  'msg_synthesizing', 'msg_distilling', 'msg_abstracting', 'msg_interpreting',
  'msg_ideating', 'msg_curating', 'msg_refining', 'msg_tuning',
  'msg_optimizing', 'msg_polishing', 'msg_finalizing',
];


// ─────────────────────────────────────────────────────────────────────────────
// VideoCard
// ─────────────────────────────────────────────────────────────────────────────
const VideoCardComponent: React.FC<VideoCardProps> = ({ video, selected, onToggleSelect, selectionMode }) => {
  console.log('REEL list_subtype:', video?.list_subtype, '| listSubtype:', video?.listSubtype, '| list_type:', video?.list_type, '| content_type:', video?.content_type, '| tools_list keys:', Object.keys(video?.tools_list ?? {}));
  const navigate   = useNavigate();
  const { t }      = useTranslation(['videoCard', 'gallery', 'common']);
  const { toggleFavorite, addVideo, deleteVideos, folders } = useData();

  const videoId = video?.id ?? video?.process_id ?? video?.processId ?? '';

  const [isFavorite,        setIsFavorite]       = useState(Boolean(video?.isFavorite ?? video?.is_favorite ?? false));
  const [isRetrying,        setIsRetrying]       = useState(false);
  const [isDeleting,        setIsDeleting]       = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [animateHeart,      setAnimateHeart]     = useState(false);
  const [msgIndex,          setMsgIndex]         = useState(0);
  const [scanState,         setScanState]        = useState<'h-active' | 'v-active'>('h-active');

  const imgRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setIsFavorite(Boolean(video?.isFavorite ?? video?.is_favorite ?? false));
  }, [video?.isFavorite, video?.is_favorite, videoId]);

  const isProcessing   = video?.category === 'Processing' || video?.status === 'processing';
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
    const msgInterval  = setInterval(() => setMsgIndex(p => (p + 1) % PROCESSING_MESSAGES.length), 2000);
    const scanInterval = setInterval(() => setScanState(p => p === 'h-active' ? 'v-active' : 'h-active'), 4000);
    return () => {
      clearInterval(msgInterval);
      clearInterval(scanInterval);
    };
  }, [isProcessing]);

  useEffect(() => {
    if (imgRef.current?.complete) setImageLoaded(true);
  }, [thumbnailUrl]);

  const isDone         = video?.status === 'done' || video?.status === 'completed';
  const isMissingThumb = isDone && !thumbnailUrl;
  const hasError       = isFailedStatus || isMissingThumb;
  const isDisabled     = isProcessing || hasError;

  const isSorted = Boolean(
    video.folderId &&
    video.folderId !== 'all' &&
    video.folderId !== 'unsorted' &&
    video.folderId !== 'default',
  );

  const folderName = useMemo(
    () => getFolderName(video?.folderId || '', folders || []),
    [video?.folderId, folders],
  );

  const displayTitle = useMemo(() => resolveTitle(video, t), [video, t]);
  const contentType  = useMemo(() => resolveContentType(video), [video?.content_type]);
  const toolsSubtype = useMemo(
    () => contentType === 'tools' ? deriveToolsSubtype(video) : undefined,
    [video, contentType],
  );

  const showTypeBadge = !isProcessing && !hasError && contentType !== 'general';

  const author    = String(video?.author ?? video?.author_name ?? video?.authorName ?? t('videoCard:unknownAuthor'));
  const duration  = video?.duration;
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
  if (rawError === 'RESTRICTED_CONTENT') errorText = t('videoCard:restrictedContent', 'Instagram blocked this video (Sensitive or Private).');
  else if (isMissingThumb) errorText = t('videoCard:missingThumbnailText', 'Media download failed.');
  else if (rawError) errorText = rawError;

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
            onClick={e => { e.stopPropagation(); onToggleSelect?.(); }}
            className="absolute top-3 left-3 z-30"
          >
            {selected
              ? <CheckCircle2 size={24} className="text-primary-600 fill-white" />
              : <div className="w-6 h-6 rounded-full border-2 border-white/80 bg-black/20" />
            }
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

      {/* ── Text area (below card) ───────────────────────────────────── */}
      <div className="pt-3 px-0.5">
        {showTypeBadge && (
          <div className="mb-1.5">
            <ContentTypeBadge type={contentType} toolsSubtype={toolsSubtype} />
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
            onClick={e => { e.stopPropagation(); if (isDisabled) e.preventDefault(); }}
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