import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Trash2, Heart, FolderInput, AlertCircle, X,
  EllipsisVertical, AlignLeft, Pencil, Save, Globe, Folder, Archive,
  MapPin, BookOpen, Clock3, StickyNote,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import { ActionSheet, ActionItem } from '../components/ActionSheet';
import { MoveCollectionModal } from '../components/MoveCollectionModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { ReportModal } from '../components/ReportModal';
import { EditableTitle, EditableBullets } from '../components/VideoDetailComponents';
import RecipeDetailsCard from "../components/RecipeDetailsCard";
import { WorkoutCard } from '../components/WorkoutCard';
import { ToolsListCard } from '../components/ToolsListCard';
import { LocationCard } from '../components/LocationCard';
import { MetadataPanel } from '../components/MetadataPanel';
import { Skeleton, Accordion, OriginalLink } from '../components/VideoDetailWidgets';
import { ContentTypeBadge, deriveToolsSubtype } from '../components/ContentTypeBadge';
import { useTranslation } from 'react-i18next';
import { useScrollLock } from '../utils/useScrollLock';
import { apiUrl, fetchGcsJson, HASHTAG_STYLE } from '../utils/videoDetailUtils';
import { scaleQuantity } from '../utils/videoUtils';
import { CustomMessageSquareMoreIcon, IOSShareIcon, PlatformIconAuthor } from '../components/CustomIcons';
import {
  buildRecipeForCard,
  hasUsableRecipeContent,
  parseRecipePayload,
  recipeIngredientCount,
  recipeInstructionCount,
} from '../features/recipe-core/recipePayload';
import {
  mergeVideoPayload,
  buildViewModel,
  getToolsCategoriesForLanguage,
  isBadgeToolsSubtype,
  isToolsContentType,
  parseSummaryObject,
} from './VideoDetailViewModel';

const MoveCollectionModalExt = MoveCollectionModal as React.ComponentType<{
  isOpen: boolean;
  onClose: () => void;
  videoIds: string[];
  onMove: (folderId: string) => void;
}>;

const ReportModalExt = ReportModal as React.ComponentType<{
  isOpen: boolean;
  onClose: () => void;
  videoId?: string;
}>;

const getAuthToken = (): string => {
  try {
    const direct =
      (window as any).__REKOLEKT_TOKEN__ ||
      localStorage.getItem('auth_token') ||
      localStorage.getItem('token') ||
      localStorage.getItem('access_token') ||
      localStorage.getItem('jwt') ||
      localStorage.getItem('recolekt_token') ||
      '';

    if (direct) {
      return String(direct).replace(/^Bearer\s+/i, '').trim();
    }

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key);
      if (!value) continue;
      const lowerKey = key.toLowerCase();
      const looksRelevant =
        lowerKey.includes('token') ||
        lowerKey.includes('jwt') ||
        lowerKey.includes('auth');
      const looksLikeJwt = value.split('.').length === 3;
      if (looksRelevant && looksLikeJwt) {
        return value.replace(/^Bearer\s+/i, '').trim();
      }
    }

    return '';
  } catch {
    return '';
  }
};

const fetchBackendAuthed = async (url: string) => {
  const token = getAuthToken();
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const extractLocationPlaces = (location: any): any[] => {
  if (!location) return [];
  if (Array.isArray(location)) return location;
  if (Array.isArray(location.places)) return location.places;
  if (Array.isArray(location.items)) return location.items;
  if (Array.isArray(location.location)) return location.location;
  if (location.location && typeof location.location === 'object') return [location.location];
  if (location.name) return [location];
  return [];
};

const cachedLocationNeedsHydration = (candidate: any, thumb?: string) => {
  try {
    const vm = buildViewModel(candidate, false, thumb);
    const places = extractLocationPlaces(vm?.location);
    if (!places.length) return false;
    return places.some(
      (p: any) => p?.lat == null || p?.lng == null || (!p?.city && !p?.region && !p?.country),
    );
  } catch {
    return false;
  }
};

export type RecipeMetaChip = {
  label: string;
  value: string;
};

type LocalCookStatus = {
  cookedCount: number;
  lastCookedLabel: string;
};

type RecipeNoteStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

function getRecipeMetaChips(recipe: any, video?: any): RecipeMetaChip[] {
  const read = (...values: any[]) =>
    values
      .map((value) => String(value || '').trim())
      .find((value) => value && value.toLowerCase() !== 'general') || '';

  const recipeCategory = read(
    recipe?.category,
    recipe?.recipe_category,
    recipe?.dish_type,
    recipe?.meal_type,
    video?.recipe?.category,
    video?.recipe?.dish_type,
  );

  const recipeTopic = read(
    recipe?.name,
    recipe?.title,
    recipe?.topic,
    video?.recipe?.name,
    video?.recipe?.title,
    video?.topic,
    video?.subCategory,
  );

  return [
    recipeCategory ? { label: 'Category', value: recipeCategory } : null,
    recipeTopic ? { label: 'Topic', value: recipeTopic } : null,
    read(recipe?.cuisine) ? { label: 'Cuisine', value: read(recipe?.cuisine) } : null,
    read(recipe?.style) ? { label: 'Style', value: read(recipe?.style) } : null,
    read(recipe?.cooking_style, recipe?.method) ? { label: 'Method', value: read(recipe?.cooking_style, recipe?.method) } : null,
  ].filter(Boolean) as RecipeMetaChip[];
}

function RecipeMetaPanel({ chips }: { chips: RecipeMetaChip[] }) {
  const readChip = (...labels: string[]) =>
    chips.find((chip) =>
      labels.includes(String(chip.label || '').trim().toLowerCase())
    )?.value || '';

  const cuisine = readChip('cuisine');
  const style = readChip('style');
  const method = readChip('method');

  const cuisineStyle = [cuisine, style].filter(Boolean).join(' · ');

  if (!cuisineStyle && !method) return null;

  return (
    <div className="flex gap-3">
      {cuisineStyle && (
        <div className="flex-1 bg-orange-50 border border-orange-100 rounded-2xl shadow-sm p-4 flex flex-col items-center justify-center gap-1">
          <span className="text-[9px] font-black text-orange-600/80 uppercase tracking-widest text-center">
            Cuisine
          </span>
          <div className="text-sm font-black text-orange-900 leading-snug text-center">
            {cuisineStyle}
          </div>
        </div>
      )}

      {method && (
        <div className="flex-1 bg-rose-50 border border-rose-100 rounded-2xl shadow-sm p-4 flex flex-col items-center justify-center gap-1">
          <span className="text-[9px] font-black text-rose-600/80 uppercase tracking-widest text-center">
            Method
          </span>
          <div className="text-sm font-black text-rose-900 leading-snug text-center">
            {method}
          </div>
        </div>
      )}
    </div>
  );
}

function readFirstString(...values: any[]): string {
  return values
    .map((value) => String(value || '').trim())
    .find(Boolean) || '';
}

function getTodayCookedLabel(): string {
  return 'today';
}

function getInitialCookStatus(video: any): LocalCookStatus {
  const cookedCount = Number(
    video?.cookedCount ??
    video?.cooked_count ??
    video?.cookCount ??
    video?.cook_count ??
    video?.timesCooked ??
    video?.times_cooked ??
    0
  );
  const lastCooked = readFirstString(
    video?.lastCookedAt,
    video?.last_cooked_at,
    video?.lastCooked,
    video?.last_cooked
  );

  return {
    cookedCount: Number.isFinite(cookedCount) && cookedCount > 0 ? cookedCount : 0,
    lastCookedLabel: lastCooked,
  };
}

function RecipeRailCard({
  icon,
  label,
  title,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 bg-stone-100 text-gray-700 rounded-md">{icon}</div>
        <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
          {label}
        </span>
      </div>
      <div className="text-base font-black text-gray-900 leading-snug">{title}</div>
      {children && <div className="mt-2 text-sm text-gray-500 leading-relaxed">{children}</div>}
    </div>
  );
}

function RecipeNotesCard({
  note,
  onChange,
  status,
}: {
  note: string;
  onChange: (value: string) => void;
  status: RecipeNoteStatus;
}) {
  const statusLabel =
    status === 'loading'
      ? 'Loading note...'
      : status === 'saving'
        ? 'Saving...'
        : status === 'saved'
          ? 'Saved'
          : status === 'error'
            ? 'Could not save'
            : 'Saved automatically';

  return (
    <div className="bg-amber-50/70 border border-amber-100 rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 bg-white/80 text-amber-700 rounded-md">
          <StickyNote size={16} aria-hidden="true" />
        </div>
        <span className="text-[11px] font-black text-amber-700/70 uppercase tracking-widest">
          Personal notes
        </span>
      </div>
      <textarea
        value={note}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Add a note for next time..."
        className="min-h-[132px] w-full resize-none rounded-xl border border-amber-100 bg-white/80 px-3 py-3 text-sm font-medium leading-relaxed text-gray-800 placeholder:text-amber-700/45 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100"
      />
      <div
        className={`mt-2 text-[11px] font-medium ${
          status === 'error' ? 'text-rose-600' : 'text-amber-800/50'
        }`}
      >
        {statusLabel}
      </div>
    </div>
  );
}

function RecipeCookStatusCard({
  status,
  onMarkCooked,
  onReset,
}: {
  status: LocalCookStatus;
  onMarkCooked: () => void;
  onReset: () => void;
}) {
  const hasCooked = status.cookedCount > 0;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 bg-stone-100 text-gray-700 rounded-md">
          <Clock3 size={16} aria-hidden="true" />
        </div>
        <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
          Cook status
        </span>
      </div>

      <div className="text-base font-black text-gray-900 leading-snug">
        {hasCooked ? `Cooked ${status.cookedCount}×` : 'Not cooked yet'}
      </div>
      <div className="mt-2 text-sm text-gray-500 leading-relaxed">
        {hasCooked
          ? `Last cooked ${status.lastCookedLabel || 'today'}`
          : 'Track this locally when you make it.'}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onMarkCooked}
          className="flex-1 rounded-xl bg-gray-950 px-3 py-2.5 text-[12px] font-black text-white transition-colors hover:bg-gray-800"
        >
          {hasCooked ? 'Cook again' : 'Mark cooked'}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!hasCooked}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[12px] font-bold text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function SourceDetailsContent({
  caption,
  transcript,
  originalUrl,
  platform,
  t,
}: {
  caption?: string;
  transcript?: string;
  originalUrl?: string;
  platform: string;
  t: any;
}) {
  return (
    <div className="space-y-5">
      {caption && (
        <div>
          <h4 className="mb-2 text-[11px] font-black uppercase tracking-widest text-gray-400">
            {t('videoDetail:caption', 'Caption')}
          </h4>
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {caption}
          </div>
        </div>
      )}

      {transcript && (
        <div>
          <h4 className="mb-2 text-[11px] font-black uppercase tracking-widest text-gray-400">
            {t('videoDetail:transcript', 'Transcript')}
          </h4>
          <div className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap font-medium italic border-l-2 border-gray-100 pl-4">
            {transcript}
          </div>
        </div>
      )}

      {originalUrl && (
        <OriginalLink url={originalUrl} platform={platform} t={t} />
      )}
    </div>
  );
}

function RecipeCookbookRail({
  folderName,
  metaChips,
  caption,
  transcript,
  originalUrl,
  platform,
  t,
  note,
  onNoteChange,
  noteStatus,
  cookStatus,
  onMarkCooked,
  onResetCookStatus,
}: {
  folderName: string | null;
  metaChips: RecipeMetaChip[];
  caption?: string;
  transcript?: string;
  originalUrl?: string;
  platform: string;
  t: any;
  note: string;
  onNoteChange: (value: string) => void;
  noteStatus: RecipeNoteStatus;
  cookStatus: LocalCookStatus;
  onMarkCooked: () => void;
  onResetCookStatus: () => void;
}) {
  const category = metaChips.find((chip) => chip.label === 'Category')?.value;
  const topic = metaChips.find((chip) => chip.label === 'Topic')?.value;
  const hasSourceDetails = Boolean(caption || transcript || originalUrl);
  const contextItems = [category, topic].filter(Boolean);

  return (
    <div className="hidden md:flex flex-col w-full gap-5 mt-0">
      <RecipeRailCard
        icon={<Folder size={16} aria-hidden="true" />}
        label="Collection"
        title={folderName || 'Unsorted'}
      />

      <RecipeCookStatusCard
        status={cookStatus}
        onMarkCooked={onMarkCooked}
        onReset={onResetCookStatus}
      />

      <RecipeNotesCard note={note} onChange={onNoteChange} status={noteStatus} />

      {originalUrl && (
        <OriginalLink url={originalUrl} platform={platform} t={t} />
      )}

      {hasSourceDetails && (
        <Accordion
          icon={<AlignLeft size={16} />}
          label={t('videoDetail:sourceDetails', 'Source details')}
        >
          <SourceDetailsContent
            caption={caption}
            transcript={transcript}
            platform={platform}
            t={t}
          />
        </Accordion>
      )}

      {contextItems.length > 0 && (
        <RecipeRailCard
          icon={<BookOpen size={16} aria-hidden="true" />}
          label="Recipe context"
          title={contextItems.join(' · ')}
        >
          Category and topic are kept low-priority for organizing, not cooking.
        </RecipeRailCard>
      )}
    </div>
  );
}

export const VideoDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    videos,
    folders,
    deleteVideos,
    moveVideos,
    toggleFavorite,
    updateVideo,
    getVideoById,
    addToGroceryList, // ← DataContext must expose this; see note below
  } = useData();

  const { showOriginal, toggleLanguage } = useLanguage();
  const { t } = useTranslation(['videoDetail', 'common', 'modals']);

  const [video, setVideo] = useState<any>(null);
  const [galleryThumbnail, setGalleryThumbnail] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedVideo, setEditedVideo] = useState<any>(null);
  const [recipeNote, setRecipeNote] = useState('');
  const [recipeNoteStatus, setRecipeNoteStatus] = useState<RecipeNoteStatus>('idle');
  const [lastSavedRecipeNote, setLastSavedRecipeNote] = useState('');
  const [localCookStatus, setLocalCookStatus] = useState<LocalCookStatus>({
    cookedCount: 0,
    lastCookedLabel: '',
  });
  const [servingScale, setServingScale] = useState(1);
  const richRecipeRef = useRef<any>(null);
  const recipeNoteLoadKeyRef = useRef<string | null>(null);
  const cookStatusVideoIdRef = useRef<string | null>(null);
  const [useMetric, setUseMetric] = useState(true);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  useScrollLock(
    isActionSheetOpen || isMoveModalOpen || isReportModalOpen || isDeleteConfirmOpen,
  );

  // Reset state whenever the user navigates to a different video
  useEffect(() => {
    setServingScale(1);
    setIsEditing(false);
    setRecipeNote('');
    setLastSavedRecipeNote('');
    setRecipeNoteStatus('idle');
    setLocalCookStatus({ cookedCount: 0, lastCookedLabel: '' });
    recipeNoteLoadKeyRef.current = null;
    cookStatusVideoIdRef.current = null;
  }, [id]);

  // Push ingredients into the shared GroceryList via DataContext

  const enrichVideo = useCallback(async () => {
    if (!id || !navigator.onLine) {
      setLoading(false);
      return;
    }
    try {
      const db = await fetchBackendAuthed(
        apiUrl(`api/reel/${encodeURIComponent(id)}?ts=${Date.now()}`),
      );
      if (!db) { setLoading(false); return; }

      const resultJsonUrl =
        db?.result_json_url ||
        db?.resultJsonUrl ||
        db?.gcs_result_json_url ||
        db?.result_json ||
        db?.gcs_urls?.result_json ||
        db?.gcs_urls?.result_json_url ||
        null;

      const gcs = resultJsonUrl ? await fetchGcsJson(resultJsonUrl) : null;
      const merged = mergeVideoPayload(db, gcs, galleryThumbnail);

      setVideo((prev: any) => ({
        ...(prev || {}),
        ...merged,
        id: merged.id || merged.process_id || db.id || db.process_id || id,
        process_id: merged.process_id || merged.id || db.process_id || db.id || id,
      }));
    } catch (err) {
      console.error('Enrichment error', err);
    } finally {
      setLoading(false);
    }
  }, [id, galleryThumbnail]);

  useEffect(() => {
    if (!id) return;
    const cached =
      (getVideoById(id) as any) ||
      videos.find((v: any) => v.id === id || v.process_id === id);

    if (!cached) { setLoading(true); return; }

    const thumb = cached.thumbnailUrl || cached.gcs_urls?.preview_thumbnail;
    if (thumb) setGalleryThumbnail(thumb);

    setVideo({
      ...cached,
      id: cached.id || cached.process_id,
      process_id: cached.process_id || cached.id,
    });

    const needsHydration =
      navigator.onLine && cachedLocationNeedsHydration(cached, thumb);
    setLoading(needsHydration);
  }, [id, videos, getVideoById]);

  const fetchedId = useRef<string | null>(null);
  useEffect(() => {
    if (id && fetchedId.current !== id) {
      fetchedId.current = id;
      enrichVideo();
    }
  }, [id, enrichVideo]);

  useEffect(() => {
    if (isEditing && video) {
      setEditedVideo(JSON.parse(JSON.stringify(video)));
    }
  }, [isEditing, video]);

  const handleEditField = (field: string, value: any) => {
    setEditedVideo((prev: any) => {
      if (!prev) return prev;
      const next = { ...prev };
      const summary = parseSummaryObject(next.summary);
      const langKey =
        showOriginal && summary.english && summary.original ? 'original' : 'english';
      summary[langKey] = { ...(summary[langKey] || {}) };

      if (field === 'title')   { next.title = value; next.summary_title = value; summary[langKey].title = value; }
      if (field === 'summary') { next.summary_text = value; summary[langKey].summary = value; }
      if (field === 'bullets') { next.bullets = value; summary[langKey].headlines = value; }
      if (field === 'category') { next.category = value; next.summary_category = value; }
      if (field === 'topic')   { next.topic = value; next.summary_topic = value; next.subCategory = value; }
      if (field === 'tags')    { next.tags = value; summary[langKey].hashtags = value; }

      next.summary = summary;
      return next;
    });
  };

  const currentVideoId = useMemo(
    () => video?.id || video?.process_id || id || '',
    [video?.id, video?.process_id, id],
  );

  useEffect(() => {
    if (!currentVideoId || !video || cookStatusVideoIdRef.current === currentVideoId) return;

    cookStatusVideoIdRef.current = currentVideoId;
    setLocalCookStatus(getInitialCookStatus(video));
  }, [currentVideoId, video]);

  const hasRecipeForNotes = useMemo(() => {
    if (!video) return false;
    const candidate = parseRecipePayload((video as any)?.recipe || (video as any)?.__raw?.recipe);
    return Boolean(candidate && hasUsableRecipeContent(candidate));
  }, [video]);

  useEffect(() => {
    if (!currentVideoId || !hasRecipeForNotes) return;
    if (recipeNoteLoadKeyRef.current === currentVideoId) return;

    let cancelled = false;
    recipeNoteLoadKeyRef.current = currentVideoId;
    setRecipeNoteStatus('loading');

    const loadRecipeNote = async () => {
      try {
        const token = getAuthToken();
        const res = await fetch(
          apiUrl(`api/reel/${encodeURIComponent(currentVideoId)}/notes`),
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            credentials: 'include',
            cache: 'no-store',
          }
        );

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }

        const nextNote = String(data?.noteText || '');

        if (!cancelled) {
          setRecipeNote(nextNote);
          setLastSavedRecipeNote(nextNote);
          setRecipeNoteStatus(nextNote ? 'saved' : 'idle');
        }
      } catch (err) {
        if (!cancelled) {
          setRecipeNoteStatus('error');
        }
      }
    };

    loadRecipeNote();

    return () => {
      cancelled = true;
    };
  }, [currentVideoId, hasRecipeForNotes]);

  useEffect(() => {
    if (!currentVideoId || !hasRecipeForNotes) return;
    if (recipeNoteLoadKeyRef.current !== currentVideoId) return;
    if (recipeNote === lastSavedRecipeNote) return;

    let cancelled = false;
    setRecipeNoteStatus('saving');

    const timer = window.setTimeout(async () => {
      try {
        const token = getAuthToken();
        const res = await fetch(
          apiUrl(`api/reel/${encodeURIComponent(currentVideoId)}/notes`),
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            credentials: 'include',
            body: JSON.stringify({ noteText: recipeNote }),
          }
        );

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }

        const savedNote = String(data?.noteText ?? recipeNote);

        if (!cancelled) {
          setLastSavedRecipeNote(savedNote);
          setRecipeNoteStatus('saved');
        }
      } catch (err) {
        if (!cancelled) {
          setRecipeNoteStatus('error');
        }
      }
    }, 800);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentVideoId, hasRecipeForNotes, recipeNote, lastSavedRecipeNote]);

  const handleMarkCookedLocal = () => {
    setLocalCookStatus((current) => ({
      cookedCount: current.cookedCount + 1,
      lastCookedLabel: getTodayCookedLabel(),
    }));
  };

  const handleResetCookStatusLocal = () => {
    setLocalCookStatus({
      cookedCount: 0,
      lastCookedLabel: '',
    });
  };

  const handleToggleFavorite = () => {
    if (currentVideoId) toggleFavorite(currentVideoId);
  };

  const handleArchive = () => {
    if (!currentVideoId) return;
    moveVideos([currentVideoId], 'archive');
    setIsActionSheetOpen(false);
  };

  const handleDelete = async () => {
    if (!currentVideoId) return;
    try { await deleteVideos([currentVideoId]); } catch (err) { console.error('Delete failed', err); }
    finally { setIsDeleteConfirmOpen(false); navigate('/gallery', { replace: true }); }
  };

  const handleSaveEdit = () => {
    if (editedVideo && currentVideoId && typeof updateVideo === 'function') {
      updateVideo(currentVideoId, editedVideo);
      setVideo(editedVideo);
    }
    setIsEditing(false);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: video?.title || 'Rekolekt', url: window.location.href }); } catch {}
    } else {
      await navigator.clipboard.writeText(window.location.href);
      alert(t('videoDetail:linkCopied', 'Link copied!'));
    }
  };

  const findFolderById = (targetId: string, list: any[]): any | null => {
    for (const f of list) {
      if (f.id === targetId) return f;
      if (f.subFolders?.length) {
        const found = findFolderById(targetId, f.subFolders);
        if (found) return found;
      }
    }
    return null;
  };

  const folderName = useMemo(() => {
    const fid = video?.folderId || video?.folderid || video?.folder_id;
    if (!fid || ['all', 'unsorted', 'default'].includes(fid)) return null;
    return findFolderById(fid, folders)?.name ?? null;
  }, [video, folders]);

  const viewModel = useMemo(() => {
    if (!video) return null;
    const source = isEditing && editedVideo ? editedVideo : video;
    return buildViewModel(source, showOriginal, galleryThumbnail);
  }, [video, editedVideo, isEditing, showOriginal, galleryThumbnail]);

  if (loading || !viewModel) return <Skeleton />;

  const toolsCategories = getToolsCategoriesForLanguage(viewModel.toolsList, showOriginal);
  const hasToolsList =
    Array.isArray(toolsCategories) &&
    toolsCategories.some((cat: any) => Array.isArray(cat?.items) && cat.items.length > 0);
  const hasBullets = Array.isArray(viewModel.bullets) && viewModel.bullets.length > 0;
  const structuredBadgeSubtype = isBadgeToolsSubtype(viewModel.structuredType)
    ? viewModel.structuredType
    : undefined;
  const derivedSubtype = deriveToolsSubtype(viewModel.toolsList);
  const safeDerivedSubtype = isBadgeToolsSubtype(derivedSubtype) ? derivedSubtype : 'picks';
  const recipeMetaChips = getRecipeMetaChips(viewModel.recipe, viewModel);

  const cleanMetadataValue = (value: any) => {
    const text = String(value || '').trim();
    if (!text || text.toLowerCase() === 'general') return '';
    return text;
  };

  const categoryCandidates = [
    (video as any)?.summary_category,
    (video as any)?.__raw?.summary_category,
    (viewModel as any)?.summary_category,
    (video as any)?.summary?.category,
    (video as any)?.__raw?.summary?.category,
    (viewModel as any)?.summary?.category,
  ];

  const topicCandidates = [
    (video as any)?.summary_topic,
    (video as any)?.__raw?.summary_topic,
    (viewModel as any)?.summary_topic,
    (video as any)?.summary?.topic,
    (video as any)?.summary?.theme,
    (video as any)?.__raw?.summary?.topic,
    (video as any)?.__raw?.summary?.theme,
    (viewModel as any)?.summary?.topic,
    (viewModel as any)?.summary?.theme,
  ];

  // Category should not be guessed. It appears only when persisted/fetched.
  const metadataCategory = categoryCandidates.map(cleanMetadataValue).find(Boolean) || '';

  // Topic may be empty, but the Topic block itself should still render.
  const metadataTopic = topicCandidates.map(cleanMetadataValue).find(Boolean) || '';

  const toolsSubtype = isToolsContentType(viewModel.contentType)
    ? structuredBadgeSubtype ?? safeDerivedSubtype
    : undefined;
  const showTypeBadge = false; // Recipe-only focus: hide content badge for now.

  const normalizedLocations: any[] = extractLocationPlaces(viewModel.location).map(
    (place: any, idx: number) => ({
      ...place,
      _vid: place?._vid || currentVideoId,
      _idx: typeof place?._idx === 'number' ? place._idx : idx,
    }),
  );

  const hasLocations = normalizedLocations.length > 0;
  const isLocationContent = viewModel.contentType === 'location' || hasLocations;
  const showToolsListCard =
    !isLocationContent &&
    hasToolsList &&
    (viewModel.isStructuredTools || !!viewModel.structuredType || !hasBullets);

  const recipeForCard = buildRecipeForCard(viewModel.recipe, (video as any)?.recipe);

  const currentInstructionCount = recipeInstructionCount(recipeForCard);
  const currentIngredientCount = recipeIngredientCount(recipeForCard);
  const storedInstructionCount = recipeInstructionCount(richRecipeRef.current);
  const storedIngredientCount = recipeIngredientCount(richRecipeRef.current);

  if (
    recipeForCard &&
    (
      currentInstructionCount > storedInstructionCount ||
      (
        currentInstructionCount === storedInstructionCount &&
        currentIngredientCount > storedIngredientCount
      )
    )
  ) {
    richRecipeRef.current = recipeForCard;
  }

  const stableRecipeForCard =
    richRecipeRef.current && recipeInstructionCount(richRecipeRef.current) > currentInstructionCount
      ? richRecipeRef.current
      : recipeForCard;

  const showRecipeCard = Boolean(stableRecipeForCard && hasUsableRecipeContent(stableRecipeForCard));
  const showFolderBadge = Boolean(folderName && !showRecipeCard);
  const hasRecipeSourceDetails =
    showRecipeCard && Boolean(viewModel.caption || viewModel.transcript || viewModel.originalUrl);

  const actionItems = (video
    ? [
        { icon: <IOSShareIcon />, label: t('videoDetail:share', 'Share'), onClick: handleShare },
        { icon: <Pencil />, label: t('videoDetail:editReel', 'Edit details'), onClick: () => setIsEditing(true) },
        {
          icon: <Heart />,
          label: video.isFavorite ? t('videoDetail:removeFromFavorites') : t('videoDetail:addToFavorites'),
          onClick: handleToggleFavorite,
          variant: video.isFavorite ? 'default' : 'primary',
        },
        {
          icon: <FolderInput />,
          label: t('videoDetail:moveToCollection', 'Move to Collection'),
          onClick: () => setIsMoveModalOpen(true),
        },
        { icon: <Archive />, label: t('videoDetail:archive', 'Archive'), onClick: handleArchive },
        {
          icon: <Trash2 />,
          label: t('videoDetail:deleteReel', 'Delete'),
          onClick: () => setIsDeleteConfirmOpen(true),
          variant: 'danger',
        },
        {
          icon: <AlertCircle />,
          label: t('videoDetail:reportIssue', 'Report issue'),
          onClick: () => setIsReportModalOpen(true),
        },
      ]
    : []) as unknown as ActionItem[];

  return (
    <div className="animate-fade-in relative z-0 px-0 pb-20 md:pb-6">
      <style>{HASHTAG_STYLE}</style>

      <div className="flex flex-col md:grid md:grid-cols-[1.5fr_1fr] md:gap-6 items-start">
        <div className="min-w-0 w-full flex flex-col">

          {/* Thumbnail */}
          <div className="relative z-0 w-full aspect-9/8 bg-black rounded-2xl overflow-hidden shadow-sm mb-5 group mt-[calc(env(safe-area-inset-top,0px)+0.75rem)] md:mt-0">
            {viewModel.thumbnailUrl && (
              <img
                src={viewModel.thumbnailUrl}
                alt={viewModel.title}
                className="w-full h-full object-cover opacity-90"
                loading="eager"
                decoding="async"
              />
            )}

            <div className="absolute top-4 left-4 right-4 flex justify-between z-20">
              <button
                onClick={() => navigate(-1)}
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center shadow-lg hover:bg-white/40 transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSaveEdit}
                      className="hidden md:flex h-10 px-4 rounded-full bg-emerald-500 text-white items-center justify-center shadow-lg font-bold text-sm gap-2"
                    >
                      <Save size={18} /> {t('common:save', 'Save')}
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center"
                    >
                      <X size={20} />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsActionSheetOpen(true)}
                    className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center hover:bg-white/40 transition-colors"
                  >
                    <EllipsisVertical size={18} />
                  </button>
                )}
              </div>
            </div>

            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between z-30 pointer-events-none">
              <div className="flex items-center gap-2 pointer-events-auto">
                {showFolderBadge && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-full shadow-lg">
                    <Folder size={12} className="text-primary-400" strokeWidth={2.5} />
                    <span className="text-[11px] font-bold text-white uppercase tracking-wide">
                      {folderName}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {viewModel.duration && viewModel.duration !== '0:00' && (
                  <div className="bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-medium text-white">
                    {viewModel.duration}
                  </div>
                )}
                {showTypeBadge && (
                  <ContentTypeBadge type={viewModel.contentType as any} toolsSubtype={toolsSubtype} />
                )}
                {hasLocations && !isLocationContent && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide uppercase bg-teal-50/90 text-teal-700 border-teal-200/80 backdrop-blur-sm">
                    <MapPin size={10} strokeWidth={2.5} aria-hidden="true" />
                    Places
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="mb-3">
            <EditableTitle
              title={viewModel.title}
              isEditMode={isEditing}
              value={viewModel.title}
              onChange={(val: string) => handleEditField('title', val)}
            />
          </div>

          {/* Author + date */}
          <div className="mb-6 flex items-center justify-between">
            <a
              href={viewModel.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 group/author"
            >
              <PlatformIconAuthor platform={viewModel.platform} />
              <span className="text-xs font-medium text-gray-500 truncate group-hover/author:text-gray-900 transition-colors">
                {viewModel.author.replace('@', '')}
              </span>
            </a>
            {viewModel.savedAt && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <span>{viewModel.savedAt}</span>
              </div>
            )}
          </div>

          {/* Metadata (mobile) */}
          {!showRecipeCard && (
          <MetadataPanel
            variant="mobile"
            category={metadataCategory}
            subCategory={metadataTopic}
            tags={viewModel.tags}
            isEditing={isEditing}
            onEditCategory={(v: string) => handleEditField('category', v)}
            onEditTopic={(v: string) => handleEditField('topic', v)}
            onEditStart={() => setIsEditing(true)}
          />
          )}

          {/* AI Summary */}
          {!showRecipeCard && (
            <div className="bg-primary-50 rounded-2xl p-5 md:p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-primary-700 font-bold text-sm uppercase tracking-wide">
                {t('videoDetail:aiSummary', 'AI Summary')}
              </h3>
              {viewModel.hasTranslation && !isEditing && (
                <button
                  onClick={(e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); toggleLanguage(); }}
                  className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm bg-primary-600 hover:bg-primary-700 text-white transition-colors"
                >
                  <Globe size={14} />
                  <span className="text-[11px] font-bold uppercase">
                    {showOriginal ? 'EN' : viewModel.languageCode}
                  </span>
                </button>
              )}
            </div>

            {isEditing ? (
              <textarea
                className="w-full text-gray-700 leading-relaxed mb-4 font-medium bg-white/50 border border-primary-200 rounded-xl p-3 min-h-25"
                value={viewModel.summary}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  handleEditField('summary', e.target.value)
                }
              />
            ) : (
              <div className="text-gray-700 text-sm md:text-base leading-relaxed mb-4 font-medium whitespace-pre-line">
                {viewModel.summary}
              </div>
            )}

            {false && showToolsListCard ? (
              <div className="mt-4 pt-4 border-t border-primary-100/50">
                <ToolsListCard toolsList={viewModel.toolsList ?? undefined} showOriginal={showOriginal} />
              </div>
            ) : hasBullets ? (
              <div className="space-y-3 mt-4 pt-4 border-t border-primary-100/50">
                {isEditing ? (
                  <EditableBullets
                    bullets={viewModel.bullets}
                    isEditMode={isEditing}
                    value={viewModel.bullets}
                    onChange={(val: any) => handleEditField('bullets', val)}
                  />
                ) : (
                  viewModel.bullets.map((bullet: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 text-gray-600 text-sm">
                      {bullet.emoji && (
                        <span className="text-base leading-none mt-0.5 shrink-0">{bullet.emoji}</span>
                      )}
                      <span className="leading-relaxed">
                        {bullet.headline && (
                          <span className="font-bold text-gray-900">{bullet.headline} </span>
                        )}
                        {bullet.text || bullet.description || ''}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ) : null}
            </div>
          )}

          {/* Recipe card */}
          {showRecipeCard && stableRecipeForCard && (
            <div className="mb-5">
              <RecipeDetailsCard
                recipe={stableRecipeForCard}
                recipeId={currentVideoId}
                recipeName={viewModel.title ?? "Recipe"}
                servingScale={servingScale}
                scaleQuantity={scaleQuantity}
                useMetric={useMetric}
                onToggleMetric={setUseMetric}
              />
            </div>
          )}

          {hasRecipeSourceDetails && (
            <div className="md:hidden">
              <Accordion
                icon={<AlignLeft size={16} />}
                label={t('videoDetail:sourceDetails', 'Source details')}
              >
                <SourceDetailsContent
                  caption={viewModel.caption}
                  transcript={viewModel.transcript}
                  originalUrl={viewModel.originalUrl}
                  platform={viewModel.platform}
                  t={t}
                />
              </Accordion>
            </div>
          )}

          {false && viewModel.workout && (
            <WorkoutCard workoutData={viewModel.workout} showOriginal={showOriginal} />
          )}

          {false && isLocationContent && normalizedLocations.length > 0 && (
            <div className="relative z-0 mb-5">
              <LocationCard location={normalizedLocations} processId={currentVideoId} />
            </div>
          )}

          {!showRecipeCard && viewModel.caption && (
            <Accordion icon={<AlignLeft size={16} />} label={t('videoDetail:caption', 'Caption')}>
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {viewModel.caption}
              </div>
            </Accordion>
          )}

          {!showRecipeCard && viewModel.transcript && (
            <div className="md:hidden">
              <Accordion
                icon={<CustomMessageSquareMoreIcon size={16} />}
                label={t('videoDetail:transcript', 'Transcript')}
              >
                <div className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap font-medium italic border-l-2 border-gray-100 pl-4">
                  {viewModel.transcript}
                </div>
              </Accordion>
            </div>
          )}

          {isEditing && (
            <div className="md:hidden mt-4 flex gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 py-3 bg-gray-200 rounded-xl text-sm font-bold text-gray-700"
              >
                {t('common:cancel', 'Cancel')}
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 py-3 bg-primary-600 rounded-xl text-sm font-bold text-white shadow-lg"
              >
                {t('common:saveChanges', 'Save Changes')}
              </button>
            </div>
          )}

          {!showRecipeCard && viewModel.originalUrl && (
            <OriginalLink
              url={viewModel.originalUrl}
              platform={viewModel.platform}
              t={t}
              className="md:hidden mt-4"
            />
          )}
        </div>

        {/* Desktop right column */}
        {showRecipeCard ? (
          <RecipeCookbookRail
            folderName={folderName}
            metaChips={recipeMetaChips}
            caption={viewModel.caption}
            transcript={viewModel.transcript}
            originalUrl={viewModel.originalUrl}
            platform={viewModel.platform}
            t={t}
            note={recipeNote}
            onNoteChange={setRecipeNote}
            noteStatus={recipeNoteStatus}
            cookStatus={localCookStatus}
            onMarkCooked={handleMarkCookedLocal}
            onResetCookStatus={handleResetCookStatusLocal}
          />
        ) : (
          <div className="hidden md:flex flex-col w-full gap-5 mt-0">
            <RecipeMetaPanel chips={recipeMetaChips} />
            <MetadataPanel
              variant="desktop"
              category={metadataCategory}
              subCategory={metadataTopic}
              tags={viewModel.tags}
              isEditing={isEditing}
              onEditCategory={(v: string) => handleEditField('category', v)}
              onEditTopic={(v: string) => handleEditField('topic', v)}
              onEditStart={() => setIsEditing(true)}
            />

            {viewModel.transcript && (
              <Accordion
                icon={<CustomMessageSquareMoreIcon size={16} />}
                label={t('videoDetail:transcript', 'Transcript')}
              >
                <div className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap font-medium italic border-l-2 border-gray-100 pl-4">
                  {viewModel.transcript}
                </div>
              </Accordion>
            )}

            {viewModel.originalUrl && (
              <OriginalLink url={viewModel.originalUrl} platform={viewModel.platform} t={t} />
            )}
          </div>
        )}
      </div>

      <ActionSheet
        isOpen={isActionSheetOpen}
        onClose={() => setIsActionSheetOpen(false)}
        actions={actionItems}
      />

      <MoveCollectionModalExt
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        videoIds={currentVideoId ? [currentVideoId] : []}
        onMove={(folderId: string) => {
          if (!currentVideoId) return;
          moveVideos([currentVideoId], folderId);
          setIsMoveModalOpen(false);
        }}
      />

      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title={t('modals:deleteReelTitle', 'Delete Reel')}
        message={t('modals:deleteReelMessage', 'Are you sure?')}
        confirmLabel={t('modals:confirmDelete', 'Delete')}
        cancelLabel={t('common:cancel', 'Cancel')}
        variant="danger"
      />

      <ReportModalExt
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        videoId={currentVideoId}
      />
    </div>
  );
};

export default VideoDetail;
