import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Trash2, Heart, FolderInput, AlertCircle, X,
  EllipsisVertical, AlignLeft, Pencil, Save, Globe, Folder, Archive,
  MapPin, ShoppingBasket, RefreshCw, Loader2, Clock3, Flame, Timer, ChevronDown, Sparkles,
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
import { apiGet } from '../lib/apiClient';
import {
  getPerfStepTime,
  getPerfTimelineRows,
  getSlowestPerfApiCall,
  isPerfModeEnabled,
  markPerfStep,
  measurePerfDuration,
  startPerfSession,
} from '../lib/perf';
import { useScrollLock } from '../utils/useScrollLock';
import { fetchGcsJson, HASHTAG_STYLE } from '../utils/videoDetailUtils';
import { scaleQuantity } from '../utils/videoUtils';
import { CustomMessageSquareMoreIcon, IOSShareIcon, PlatformIconAuthor } from '../components/CustomIcons';
import {
  buildRecipeForCard,
  hasUsableRecipeContent,
  recipeIngredientCount,
  recipeInstructionCount,
} from '../features/recipe-core/recipePayload';
import RecipeCookbookRail, {
  RecipeMobileStateSection,
  RecipeMetaChip,
  SourceDetailsContent,
} from '../features/recipe-detail/RecipeCookbookRail';
import useRecipeCookState from '../features/recipe-cook-state/useRecipeCookState';
import useRecipeNotes from '../features/recipe-notes/useRecipeNotes';
import useShoppingRecipeStatus from '../features/shopping/useShoppingRecipeStatus';
import { readShoppingPreferences } from '../features/shopping/shoppingPreferences';
import {
  mergeVideoPayload,
  buildViewModel,
  getToolsCategoriesForLanguage,
  isBadgeToolsSubtype,
  isToolsContentType,
  parseSummaryObject,
  selectLocalizedRecipe,
} from './VideoDetailViewModel';
import {
  FACEBOOK_ACCESS_ERROR_MESSAGE,
  buildTerminalProcessingVideo,
  isFacebookAccessError,
} from './videoDetailTerminalState';

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

const PERF_SESSION_NAME = 'VideoDetail';

function useDesktopRecipeDetailLayout() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const handleChange = () => setIsDesktop(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isDesktop;
}

function ReelErrorState({
  message,
  onBack,
}: {
  message: string;
  onBack: () => void;
}) {
  return (
    <div className="animate-fade-in relative z-0 flex min-h-[55vh] items-center justify-center px-4 pb-20 md:pb-6">
      <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white/85 p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
          <AlertCircle size={22} aria-hidden="true" />
        </div>
        <p className="text-base font-bold leading-relaxed text-gray-900">
          {message}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary-600 px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        >
          Go back to Gallery
        </button>
      </div>
    </div>
  );
}

function ReelPendingState() {
  return (
    <section className="animate-fade-in mb-5 mt-[calc(env(safe-area-inset-top,0px)+0.75rem)] overflow-hidden rounded-[26px] border border-white/75 bg-white/90 shadow-[0_8px_28px_rgba(15,23,42,0.08)] backdrop-blur-sm md:mt-0">
      <div className="px-4 py-5 md:px-6 md:py-6">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
            <Loader2 size={20} aria-hidden="true" className="animate-spin" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-primary-600/70">
              Saved Reel
            </p>
            <h2 className="mt-1 text-[22px] font-bold tracking-tight text-slate-950">
              Loading saved reel…
            </h2>
            <p className="mt-2 max-w-[48ch] text-sm font-medium leading-6 text-slate-500">
              Pulling the final recipe detail before we render the page.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

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

function getHeroRecipeMetaChips(chips: RecipeMetaChip[]) {
  const preferredOrder = ['Cuisine', 'Topic', 'Style', 'Method'];
  return preferredOrder
    .map((label) => chips.find((chip) => chip.label === label))
    .filter((chip): chip is RecipeMetaChip => Boolean(chip?.value));
}

function getRecipeCardMetaItems(recipe: any) {
  const read = (...values: any[]) =>
    values
      .map((value) => String(value || '').trim())
      .find((value) => value && value.toLowerCase() !== 'general') || '—';

  return [
    { label: 'Yield', value: read(recipe?.servings, recipe?.yield, recipe?.portions) },
    { label: 'Prep', value: read(recipe?.prep_time, recipe?.prepTime) },
    { label: 'Cook', value: read(recipe?.cook_time, recipe?.cookTime) },
    { label: 'Total', value: read(recipe?.total_time, recipe?.totalTime) },
    { label: 'Cuisine', value: read(recipe?.cuisine, recipe?.cuisine_type) },
    { label: 'Style', value: read(recipe?.style, recipe?.recipe_style) },
    { label: 'Method', value: read(recipe?.cooking_style, recipe?.cooking_method, recipe?.method) },
  ];
}

function getEnglishSummaryContent(video: any) {
  const summary = parseSummaryObject(video?.summary);
  const english = summary?.english && typeof summary.english === 'object' ? summary.english : summary;
  const summaryText = String(english?.summary || english?.text || '').trim();
  const headlines = Array.isArray(english?.headlines)
    ? english.headlines
        .map((item: any) => ({
          emoji: String(item?.emoji || '').trim(),
          headline: String(item?.headline || item?.title || '').trim(),
          text: String(item?.text || item?.description || '').trim(),
        }))
        .filter((item: any) => item.headline || item.text)
    : [];

  return { summaryText, headlines };
}

function RecipeAiSummaryCard({
  summaryText,
  headlines,
}: {
  summaryText?: string;
  headlines: any[];
}) {
  const [summaryHighlightsOpen, setSummaryHighlightsOpen] = useState(false);

  return (
    <section className="mb-5">
      <div className="overflow-hidden rounded-[26px] border border-primary-100/70 bg-[linear-gradient(180deg,rgba(250,245,255,0.98),rgba(245,243,255,0.92))] shadow-[0_4px_18px_rgba(15,23,42,0.06)] backdrop-blur-sm">
        <div className="px-4 py-4 md:px-5 md:py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/85 text-primary-600 ring-1 ring-primary-100/80 shadow-[0_2px_8px_rgba(124,58,237,0.08)]">
              <Sparkles size={18} aria-hidden="true" />
            </span>
            <div>
              <div className="text-[11px] font-black uppercase tracking-widest text-primary-700/70">
                AI Summary
              </div>
              <div className="mt-1 text-[18px] font-bold tracking-tight text-gray-900">
                Quick read before you cook
              </div>
            </div>
          </div>

          <div className="mt-4 max-w-[72ch]">
            {summaryText && (
              <p className="text-[15px] font-medium leading-7 text-gray-700">
                {summaryText}
              </p>
            )}
          </div>
        </div>

        {headlines.length > 0 && summaryHighlightsOpen && (
          <div className="border-t border-primary-100/70 px-4 pb-4 pt-4 md:px-5 md:pb-5">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Key Highlights
            </h4>
            <div className="mt-3 flex flex-col gap-2.5">
              {headlines.map((item: any, index: number) => (
                <div
                  key={`${item.headline || item.text}-${index}`}
                  className="flex min-w-0 gap-3 rounded-2xl bg-white/78 px-4 py-3 ring-1 ring-primary-100/80"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-base leading-none">
                    {item.emoji || '•'}
                  </span>
                  <div className="min-w-0">
                    {item.headline && (
                      <div className="text-sm font-bold leading-snug text-gray-900">
                        {item.headline}
                      </div>
                    )}
                    {item.text && (
                      <div className="mt-1 text-sm font-medium leading-relaxed text-gray-600">
                        {item.text}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {headlines.length > 0 && (
          <div className="px-4 pb-4 md:px-5 md:pb-5">
            <button
              type="button"
              onClick={() => setSummaryHighlightsOpen((value) => !value)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary-100 bg-primary-50/70 py-3 text-sm font-bold text-primary-700 transition-colors hover:bg-primary-100"
            >
              {summaryHighlightsOpen ? 'Hide highlights' : 'See highlights'}
              <ChevronDown
                size={16}
                className={`transition-transform duration-200 ${summaryHighlightsOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>
        )}
      </div>
    </section>
  );
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
        <div className="flex-1 bg-orange-50 border border-orange-100 rounded-xl p-4 flex flex-col items-center justify-center gap-1">
          <span className="text-[10px] font-semibold text-orange-700 text-center">
            Cuisine
          </span>
          <div className="text-sm font-bold text-orange-950 leading-snug text-center">
            {cuisineStyle}
          </div>
        </div>
      )}

      {method && (
        <div className="flex-1 bg-rose-50 border border-rose-100 rounded-xl p-4 flex flex-col items-center justify-center gap-1">
          <span className="text-[10px] font-semibold text-rose-700 text-center">
            Method
          </span>
          <div className="text-sm font-bold text-rose-950 leading-snug text-center">
            {method}
          </div>
        </div>
      )}
    </div>
  );
}

export const VideoDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    videos,
    folders,
    deleteVideos,
    moveVideos,
    toggleFavorite,
    updateVideo,
    refreshVideo,
    hydrateVideo,
    getVideoById,
  } = useData();

  const { showOriginal, toggleLanguage } = useLanguage();
  const { t } = useTranslation(['videoDetail', 'common', 'modals']);
  const isDesktopRecipeDetailLayout = useDesktopRecipeDetailLayout();

  const [video, setVideo] = useState<any>(null);
  const [galleryThumbnail, setGalleryThumbnail] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedVideo, setEditedVideo] = useState<any>(null);
  const [servingScale, setServingScale] = useState(1);
  const [noteFocusSignal, setNoteFocusSignal] = useState(0);
  const richRecipeRef = useRef<any>(null);
  const [useMetric, setUseMetric] = useState(() => {
    const p = readShoppingPreferences();
    return p.unitPreference === 'metric';
  });

  const [temperatureUnit, setTemperatureUnit] = useState<'celsius' | 'fahrenheit'>(() => {
    const p = readShoppingPreferences();
    return p.temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
  });
  const [recipeConversion, setRecipeConversion] = useState<'do_not_convert' | 'smart' | 'always'>(() => {
    const p = readShoppingPreferences();
    return p.recipeConversion === 'always' || p.recipeConversion === 'smart' ? p.recipeConversion : 'do_not_convert';
  });
  const [volumePreference, setVolumePreference] = useState<'metric' | 'us'>(() => {
    const p = readShoppingPreferences();
    return p.volumePreference === 'us' ? 'us' : 'metric';
  });
  const [rounding, setRounding] = useState<'rounded' | 'exact'>(() => {
    const p = readShoppingPreferences();
    return p.rounding === 'exact' ? 'exact' : 'rounded';
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const p = (e as CustomEvent).detail || readShoppingPreferences();
      setUseMetric(p.unitPreference === 'metric');
      setTemperatureUnit(p.temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius');
      setRecipeConversion(p.recipeConversion === 'always' || p.recipeConversion === 'smart' ? p.recipeConversion : 'do_not_convert');
      setVolumePreference(p.volumePreference === 'us' ? 'us' : 'metric');
      setRounding(p.rounding === 'exact' ? 'exact' : 'rounded');
    };
    window.addEventListener('recolekt:shopping-preferences-changed', handler);
    return () => window.removeEventListener('recolekt:shopping-preferences-changed', handler);
  }, []);
  const [cookModeOpenSignal, setCookModeOpenSignal] = useState(0);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isRefreshingVideo, setIsRefreshingVideo] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [detailErrorMessage, setDetailErrorMessage] = useState('');
  const [detailHydrationSettled, setDetailHydrationSettled] = useState(false);
  const detailHydratedRef = useRef(false);
  const lastStableVideoRef = useRef<any>(null);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const refreshRunRef = useRef(0);
  const perfEnabled = isPerfModeEnabled();
  const perfTimelinePrintedRef = useRef(false);
  const perfSummaryPrintedRef = useRef(false);
  const perfSpanMarksRef = useRef<Record<string, string>>({});
  const perfBrowserMetricsRef = useRef<{
    fcpMs: number | null;
    lcpMs: number | null;
    cls: number;
  }>({ fcpMs: null, lcpMs: null, cls: 0 });
  const posterImageRef = useRef<HTMLImageElement | null>(null);

  const startPerfSpan = useCallback((key: string, step: string) => {
    if (!perfEnabled) return;
    const startMark = `recolekt:${PERF_SESSION_NAME}:${key}:start`;
    perfSpanMarksRef.current[key] = startMark;
    try {
      performance.mark(startMark);
    } catch {
      // Ignore unsupported mark failures.
    }
    markPerfStep(step);
  }, [perfEnabled]);

  const endPerfSpan = useCallback((key: string, step: string) => {
    if (!perfEnabled) return;
    const startMark = perfSpanMarksRef.current[key];
    const endMark = `recolekt:${PERF_SESSION_NAME}:${key}:end`;
    let durationMs: number | undefined;

    try {
      performance.mark(endMark);
      if (startMark) {
        const measured = measurePerfDuration(
          startMark,
          endMark,
          `recolekt:${PERF_SESSION_NAME}:${key}:measure:${performance.now()}`
        );
        if (measured !== null) {
          durationMs = measured;
        }
      }
    } catch {
      durationMs = undefined;
    }

    markPerfStep(step, durationMs !== undefined ? { durationMs } : {});
  }, [perfEnabled]);

  useScrollLock(
    isActionSheetOpen || isMoveModalOpen || isReportModalOpen || isDeleteConfirmOpen,
  );

  // Reset state whenever the user navigates to a different video
  useEffect(() => {
    perfTimelinePrintedRef.current = false;
    perfSummaryPrintedRef.current = false;
    perfSpanMarksRef.current = {};
    perfBrowserMetricsRef.current = { fcpMs: null, lcpMs: null, cls: 0 };
    if (perfEnabled) {
      startPerfSession(PERF_SESSION_NAME);
      markPerfStep('VideoDetail component mounted');
    }
    setServingScale(1);
    setIsEditing(false);
    detailHydratedRef.current = false;
    lastStableVideoRef.current = null;
    refreshAbortRef.current?.abort();
    refreshAbortRef.current = null;
    refreshRunRef.current += 1;
    setIsRefreshingVideo(false);
    setRefreshMessage('');
    setRefreshError('');
    setDetailErrorMessage('');
    setDetailHydrationSettled(false);
  }, [id, perfEnabled]);

  useEffect(() => {
    return () => {
      refreshAbortRef.current?.abort();
      refreshRunRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (perfEnabled && id) {
      markPerfStep('route/video id resolved');
    }
  }, [id, perfEnabled]);

  useEffect(() => {
    if (!perfEnabled || typeof PerformanceObserver === 'undefined') return;

    const cleanups: Array<() => void> = [];

    try {
      const paintObserver = new PerformanceObserver((entryList) => {
        entryList.getEntries().forEach((entry) => {
          if (entry.name !== 'first-contentful-paint') return;
          if (perfBrowserMetricsRef.current.fcpMs !== null) return;
          perfBrowserMetricsRef.current.fcpMs = Math.round(entry.startTime * 10) / 10;
          console.log(`[perf] FCP ${perfBrowserMetricsRef.current.fcpMs}ms`);
        });
      });
      paintObserver.observe({ type: 'paint', buffered: true });
      cleanups.push(() => paintObserver.disconnect());
    } catch {
      // Ignore unsupported observer types.
    }

    try {
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (!lastEntry) return;
        perfBrowserMetricsRef.current.lcpMs = Math.round(lastEntry.startTime * 10) / 10;
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      const flushLcp = () => {
        if (perfBrowserMetricsRef.current.lcpMs !== null) {
          console.log(`[perf] LCP ${perfBrowserMetricsRef.current.lcpMs}ms`);
        }
      };
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          flushLcp();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      cleanups.push(() => {
        flushLcp();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        lcpObserver.disconnect();
      });
    } catch {
      // Ignore unsupported observer types.
    }

    try {
      const clsObserver = new PerformanceObserver((entryList) => {
        entryList.getEntries().forEach((entry) => {
          const layoutShiftEntry = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
          if (layoutShiftEntry.hadRecentInput) return;
          perfBrowserMetricsRef.current.cls += layoutShiftEntry.value || 0;
        });
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
      cleanups.push(() => {
        clsObserver.disconnect();
        if (perfBrowserMetricsRef.current.cls > 0) {
          console.log(`[perf] CLS ${Math.round(perfBrowserMetricsRef.current.cls * 1000) / 1000}`);
        }
      });
    } catch {
      // Ignore unsupported observer types.
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [id, perfEnabled]);

  const fetchHydratedVideo = useCallback(async (signal?: AbortSignal) => {
    if (!id) return null;
    startPerfSpan('main-video-fetch', 'main video/reel fetch started');
    const db = await apiGet<any>(
      `api/reel/${encodeURIComponent(id)}`,
      { signal }
    );
    endPerfSpan('main-video-fetch', 'main video/reel fetch completed');
    if (!db) return null;

    startPerfSpan('recipe-resolution', 'recipe resolution started');
    const resultJsonUrl =
      db?.result_json_url ||
      db?.resultJsonUrl ||
      db?.gcs_result_json_url ||
      db?.result_json ||
      db?.gcs_urls?.result_json ||
      db?.gcs_urls?.result_json_url ||
      null;

    const gcs = resultJsonUrl ? await fetchGcsJson(resultJsonUrl) : null;
    endPerfSpan('recipe-resolution', 'recipe resolution completed');
    return {
      detail: db,
      resultJson: gcs,
      video: mergeVideoPayload(db, gcs, galleryThumbnail),
    };
  }, [endPerfSpan, galleryThumbnail, id, startPerfSpan]);

  const enrichVideo = useCallback(async () => {
    if (!id || !navigator.onLine) {
      setDetailHydrationSettled(true);
      setLoading(false);
      return;
    }
    try {
      const hydrated = await fetchHydratedVideo();
      const merged = hydrated?.video;
      if (!merged) { setLoading(false); return; }
      const mergedStatus = String(merged.status || '').toLowerCase();

      setVideo((prev: any) => ({
        ...(prev || {}),
        ...merged,
        id: merged.id || merged.process_id || id,
        process_id: merged.process_id || merged.id || id,
      }));
      detailHydratedRef.current = true;
      if (mergedStatus === 'processing') {
        setIsRefreshingVideo(true);
        setRefreshMessage('Recolekt is updating this page. Please wait a moment.');
      } else if (mergedStatus === 'done' || mergedStatus === 'completed') {
        lastStableVideoRef.current = {
          ...merged,
          id: merged.id || merged.process_id || id,
          process_id: merged.process_id || merged.id || id,
        };
      }
    } catch (err) {
      console.error('Enrichment error', err);
      if ((err as any)?.status === 404) {
        setDetailErrorMessage(
          'This saved reel no longer exists. It may have been deleted or replaced during refresh. Go back to Gallery.',
        );
        setIsRefreshingVideo(false);
        setRefreshMessage('');
        setRefreshError('');
      }
    } finally {
      setDetailHydrationSettled(true);
      setLoading(false);
    }
  }, [id, fetchHydratedVideo]);

  useEffect(() => {
    if (!id) return;
    const cached =
      (getVideoById(id) as any) ||
      videos.find((v: any) => v.id === id || v.process_id === id);

    if (!cached) { setLoading(true); return; }

    const thumb = cached.thumbnailUrl || cached.gcs_urls?.preview_thumbnail;
    if (thumb) setGalleryThumbnail(thumb);

    const cachedStatus = String(cached.status || '').toLowerCase();
    const cacheRow = {
      ...cached,
      id: cached.id || cached.process_id,
      process_id: cached.process_id || cached.id,
    };

    if (!detailHydratedRef.current) {
      setVideo(cacheRow);
    } else {
      setVideo((prev: any) => {
        if (!prev) return cacheRow;
        const prevStatus = String(prev.status || '').toLowerCase();
        const cachedStatusValue = String(cached.status || '').toLowerCase();
        const cacheHasTerminalStatus =
          ['done', 'completed', 'error', 'failed', 'failure'].includes(cachedStatusValue);
        const shouldAcceptCacheStatus =
          prevStatus === 'processing' && cacheHasTerminalStatus;
        return {
          ...prev,
          isFavorite: cached.isFavorite ?? (cached as any).is_favorite ?? prev.isFavorite,
          is_favorite: (cached as any).is_favorite ?? cached.isFavorite ?? prev.is_favorite,
          folderId: cached.folderId ?? (cached as any).folder_id ?? prev.folderId,
          folder_id: (cached as any).folder_id ?? cached.folderId ?? prev.folder_id,
          status: shouldAcceptCacheStatus ? cached.status : prev.status,
          error_message: shouldAcceptCacheStatus
            ? ((cached as any).error_message ?? (cached as any).errorMessage ?? prev.error_message)
            : prev.error_message,
          errorMessage: shouldAcceptCacheStatus
            ? ((cached as any).errorMessage ?? (cached as any).error_message ?? prev.errorMessage)
            : prev.errorMessage,
          category: cached.category ?? prev.category,
          thumbnailUrl: cached.thumbnailUrl ?? prev.thumbnailUrl,
          updated_at: shouldAcceptCacheStatus ? ((cached as any).updated_at ?? prev.updated_at) : prev.updated_at,
          recipeUserState: (cached as any).recipeUserState ?? (cached as any).recipe_user_state ?? prev.recipeUserState,
          recipe_user_state: (cached as any).recipe_user_state ?? (cached as any).recipeUserState ?? prev.recipe_user_state,
        };
      });
    }

    if (!detailHydratedRef.current && cachedStatus === 'processing') {
      setIsRefreshingVideo(true);
      setRefreshMessage('Recolekt is updating this page. Please wait a moment.');
    }

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

  const applyTerminalProcessingPayload = useCallback((
    detail: any,
    merged: any,
    fallbackId: string,
  ) => {
    const terminalVideo = buildTerminalProcessingVideo({
      detail,
      merged,
      stable: lastStableVideoRef.current,
      fallbackId,
    });

    setVideo(terminalVideo);
    hydrateVideo(fallbackId, terminalVideo);
    detailHydratedRef.current = true;
    setIsRefreshingVideo(false);
    setRefreshMessage('');
    refreshAbortRef.current = null;

    if (isFacebookAccessError(terminalVideo)) {
      setRefreshError('');
      setDetailErrorMessage(FACEBOOK_ACCESS_ERROR_MESSAGE);
    } else {
      setDetailErrorMessage('');
      setRefreshError(terminalVideo.errorMessage || 'Refresh failed.');
    }

    return terminalVideo;
  }, [hydrateVideo]);

  useEffect(() => {
    const status = String(video?.status || '').toLowerCase();
    if (!id || status !== 'processing') return;
    if (!navigator.onLine) return;

    setIsRefreshingVideo(true);
    setRefreshMessage('Recolekt is updating this page. Please wait a moment.');

    const controller = new AbortController();
    refreshAbortRef.current?.abort();
    refreshAbortRef.current = controller;
    const runId = refreshRunRef.current + 1;
    refreshRunRef.current = runId;
    const startedAt = Date.now();
    let timer: number | null = null;

    const poll = async () => {
      if (controller.signal.aborted || refreshRunRef.current !== runId) return;
      try {
        const hydrated = await fetchHydratedVideo(controller.signal);
        const detail = hydrated?.detail;
        const merged = hydrated?.video;
        const nextStatus = String(detail?.status || '').toLowerCase();

        if (nextStatus === 'done' || nextStatus === 'completed') {
          const completed = {
            ...merged,
            id: merged.id || merged.process_id || id,
            process_id: merged.process_id || merged.id || id,
          };
          setVideo(completed);
          hydrateVideo(id, completed);
          lastStableVideoRef.current = completed;
          detailHydratedRef.current = true;
          setIsRefreshingVideo(false);
          setRefreshMessage('');
          setRefreshError('');
          refreshAbortRef.current = null;
          return;
        }

        if (['error', 'failed', 'failure'].includes(nextStatus)) {
          applyTerminalProcessingPayload(detail, merged, id);
          return;
        }

        if (Date.now() - startedAt > 3 * 60 * 1000) {
          throw new Error('Refresh is taking longer than expected. Please try again.');
        }

        timer = window.setTimeout(poll, 2500);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('Processing poll failed', err);
        setRefreshError(err instanceof Error ? err.message : 'Refresh failed.');
        setRefreshMessage('');
        setIsRefreshingVideo(false);
      }
    };

    timer = window.setTimeout(poll, 2500);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      controller.abort();
    };
  }, [id, video?.status, fetchHydratedVideo, applyTerminalProcessingPayload, hydrateVideo]);

  useEffect(() => {
    if (!isFacebookAccessError(video)) return;
    setIsRefreshingVideo(false);
    setRefreshMessage('');
    setRefreshError('');
    setDetailErrorMessage(FACEBOOK_ACCESS_ERROR_MESSAGE);
  }, [video]);

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

  const handleToggleFavorite = () => {
    if (currentVideoId) toggleFavorite(currentVideoId);
  };

  const handleArchive = () => {
    if (!currentVideoId) return;
    moveVideos([currentVideoId], 'archive');
    setIsActionSheetOpen(false);
  };

  const handleRefreshVideo = async () => {
    if (!currentVideoId || !viewModel.originalUrl || isRefreshingVideo) return;
    setIsActionSheetOpen(false);
    setIsRefreshingVideo(true);
    setRefreshMessage('Recolekt is updating this page. Please wait a moment.');
    setRefreshError('');
    setDetailErrorMessage('');
    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    const runId = refreshRunRef.current + 1;
    refreshRunRef.current = runId;

    try {
      await refreshVideo(currentVideoId);
      setVideo((prev: any) =>
        prev ? { ...prev, status: 'processing', category: 'Processing', errorMessage: null } : prev,
      );

      const startedAt = Date.now();
      const timeoutMs = 3 * 60 * 1000;
      while (!controller.signal.aborted && refreshRunRef.current === runId) {
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
        if (controller.signal.aborted || refreshRunRef.current !== runId) return;

        const hydrated = await fetchHydratedVideo(controller.signal);
        const detail = hydrated?.detail;
        const merged = hydrated?.video;
        const status = String(detail?.status || '').toLowerCase();

        if (status === 'done' || status === 'completed') {
          const completed = {
            ...merged,
            id: merged.id || merged.process_id || currentVideoId,
            process_id: merged.process_id || merged.id || currentVideoId,
          };
          setVideo(completed);
          hydrateVideo(currentVideoId, completed);
          lastStableVideoRef.current = completed;
          detailHydratedRef.current = true;
          setIsRefreshingVideo(false);
          setRefreshMessage('');
          setRefreshError('');
          refreshAbortRef.current = null;
          return;
        }

        if (['error', 'failed', 'failure'].includes(status)) {
          applyTerminalProcessingPayload(detail, merged, currentVideoId);
          return;
        }

        if (Date.now() - startedAt > timeoutMs) {
          throw new Error('Refresh is taking longer than expected. Please try again.');
        }
      }
    } catch (err) {
      console.error('Refresh video failed', err);
      setRefreshError(err instanceof Error ? err.message : 'Refresh failed.');
      setIsRefreshingVideo(false);
      setRefreshMessage('');
    }
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
    const source =
      isEditing && editedVideo
        ? editedVideo
        : String(video?.status || '').toLowerCase() === 'processing' && lastStableVideoRef.current
          ? { ...lastStableVideoRef.current, status: video.status, updated_at: video.updated_at }
      : video;
    return buildViewModel(source, showOriginal, galleryThumbnail);
  }, [video, editedVideo, isEditing, showOriginal, galleryThumbnail]);

  useEffect(() => {
    if (perfEnabled && viewModel) {
      markPerfStep('viewModel ready');
    }
  }, [perfEnabled, viewModel]);

  const localizedVideoRecipe = selectLocalizedRecipe((video as any)?.recipe, showOriginal);
  const recipeForCard = buildRecipeForCard(viewModel?.recipe || localizedVideoRecipe, localizedVideoRecipe || (video as any)?.recipe, [
    selectLocalizedRecipe((video as any)?.gcs?.recipe, showOriginal),
    selectLocalizedRecipe((video as any)?.raw?.recipe, showOriginal),
    selectLocalizedRecipe((video as any)?.__raw?.recipe, showOriginal),
    (video as any)?.gcs?.recipe,
    (video as any)?.raw?.recipe,
    (video as any)?.__raw?.recipe,
  ]);
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

  const currentStatus = String(video?.status || '').toLowerCase();
  const stableRecipeForCard =
    currentStatus === 'processing' && richRecipeRef.current && recipeInstructionCount(richRecipeRef.current) > currentInstructionCount
      ? richRecipeRef.current
      : recipeForCard;

  const rawContentType = String(
    (video as any)?.content_type ||
    (video as any)?.contentType ||
    (video as any)?.__raw?.content_type ||
    ''
  ).toLowerCase();
  const recipeContentAvailable = [
    stableRecipeForCard,
    recipeForCard,
    viewModel?.recipe,
    (video as any)?.recipe,
    richRecipeRef.current,
  ].some(hasUsableRecipeContent);
  const showRecipeCard = Boolean(
    recipeContentAvailable ||
    (rawContentType === 'recipe' && stableRecipeForCard)
  );
  const isLikelyRecipeContent = Boolean(
    recipeContentAvailable ||
    stableRecipeForCard ||
    recipeForCard ||
    rawContentType === 'recipe' ||
    String(viewModel?.contentType || '').toLowerCase() === 'recipe'
  );
  const recipeResolutionPending =
    !showRecipeCard &&
    !detailHydrationSettled &&
    navigator.onLine;
  const isDetailPresentationReady =
    !recipeResolutionPending || !isLikelyRecipeContent;
  const showNonRecipeFallback = !showRecipeCard && !recipeResolutionPending;

  useEffect(() => {
    if (perfEnabled && showRecipeCard) {
      markPerfStep('showRecipeCard became true');
    }
  }, [perfEnabled, showRecipeCard]);

  useEffect(() => {
    if (!perfEnabled || loading || !viewModel || !isDetailPresentationReady) return;

    markPerfStep('final detail body allowed to render');
    if (!perfTimelinePrintedRef.current) {
      perfTimelinePrintedRef.current = true;
      console.log('[perf] VideoDetail timeline');
      console.table(getPerfTimelineRows());
    }
  }, [isDetailPresentationReady, loading, perfEnabled, viewModel]);

  const posterLoadedMs = getPerfStepTime('first image/poster loaded');
  const recipeCardRenderedMs = getPerfStepTime('RecipeDetailsCard first rendered');
  const rightRailRenderedMs = getPerfStepTime('RecipeCookbookRail first rendered');
  const nutritionRenderedMs = getPerfStepTime('NutritionCard first rendered');

  useEffect(() => {
    if (!perfEnabled || !viewModel?.thumbnailUrl) return;
    const poster = posterImageRef.current;
    if (poster && poster.complete && poster.naturalWidth > 0) {
      markPerfStep('first image/poster loaded');
    }
  }, [perfEnabled, viewModel?.thumbnailUrl]);

  useEffect(() => {
    if (!perfEnabled || perfSummaryPrintedRef.current) return;
    if (!viewModel || loading || !isDetailPresentationReady) return;

    const posterReady = !viewModel.thumbnailUrl || posterLoadedMs !== null;
    const recipeCardReady = !showRecipeCard || recipeCardRenderedMs !== null;
    const rightRailReady = !showRecipeCard || !isDesktopRecipeDetailLayout || rightRailRenderedMs !== null;
    const nutritionReady = !showRecipeCard || currentIngredientCount === 0 || nutritionRenderedMs !== null;

    if (!posterReady || !recipeCardReady || !rightRailReady || !nutritionReady) return;

    perfSummaryPrintedRef.current = true;
    markPerfStep('final page ready');
    const slowestApiCall = getSlowestPerfApiCall();

    console.log('[perf] VideoDetail summary');
    console.table([{
      totalTimeMountToFinalDetailBodyMs: getPerfStepTime('final detail body allowed to render'),
      slowestApiRequest: slowestApiCall ? `${slowestApiCall.method} ${slowestApiCall.path}` : null,
      slowestApiDurationMs: slowestApiCall?.durationMs ?? null,
      timeUntilPosterImageLoadedMs: posterLoadedMs,
      timeUntilRightRailRenderedMs: rightRailRenderedMs,
      timeUntilRecipeCardRenderedMs: recipeCardRenderedMs,
    }]);
  }, [
    currentIngredientCount,
    isDesktopRecipeDetailLayout,
    isDetailPresentationReady,
    loading,
    nutritionRenderedMs,
    perfEnabled,
    posterLoadedMs,
    recipeCardRenderedMs,
    rightRailRenderedMs,
    showRecipeCard,
    viewModel,
  ]);

  const {
    note: recipeNote,
    setNote: setRecipeNote,
    status: recipeNoteStatus,
    saveNote: saveRecipeNote,
    deleteNote: deleteRecipeNote,
  } = useRecipeNotes(currentVideoId, showRecipeCard);

  const openRecipeNotes = useCallback(() => {
    setNoteFocusSignal((value) => value + 1);
  }, []);

  const {
    cookStatus,
    status: cookStatusStatus,
    markCooked,
    resetCookState,
  } = useRecipeCookState(currentVideoId, showRecipeCard);
  const cookStatusLoading = cookStatusStatus === 'loading';

  const {
    inShoppingList,
    loading: shoppingLoading,
    saving: shoppingSaving,
    addRecipe: addRecipeToShoppingList,
    removeRecipe: removeRecipeFromShoppingList,
  } = useShoppingRecipeStatus(currentVideoId, showRecipeCard);

  const pageErrorMessage =
    detailErrorMessage ||
    (isFacebookAccessError(video) ? FACEBOOK_ACCESS_ERROR_MESSAGE : '');

  if (pageErrorMessage) {
    return (
      <ReelErrorState
        message={pageErrorMessage}
        onBack={() => navigate('/gallery')}
      />
    );
  }

  if (loading || !viewModel) return <Skeleton />;
  if (!isDetailPresentationReady) {
    return (
      <div className="animate-fade-in relative z-0 px-0 pb-20 md:pb-6">
        <div className="flex w-full flex-col items-start md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-5">
          <div className="min-w-0 w-full flex flex-col">
            <ReelPendingState />
          </div>
          {isDesktopRecipeDetailLayout ? (
            <aside className="hidden w-full md:block" aria-hidden="true" />
          ) : null}
        </div>
      </div>
    );
  }

  const toolsCategories = getToolsCategoriesForLanguage(viewModel.toolsList, showOriginal);
  const hasToolsList =
    Array.isArray(toolsCategories) &&
    toolsCategories.some((cat: any) => Array.isArray(cat?.items) && cat.items.length > 0);
  const hasBullets = Array.isArray(viewModel.bullets) && viewModel.bullets.length > 0;
  const englishSummaryContent = getEnglishSummaryContent(video);
  const hasEnglishSummaryContent =
    Boolean(englishSummaryContent.summaryText) || englishSummaryContent.headlines.length > 0;
  const structuredBadgeSubtype = isBadgeToolsSubtype(viewModel.structuredType)
    ? viewModel.structuredType
    : undefined;
  const derivedSubtype = deriveToolsSubtype(viewModel.toolsList);
  const safeDerivedSubtype = isBadgeToolsSubtype(derivedSubtype) ? derivedSubtype : 'picks';
  const recipeMetaChips = getRecipeMetaChips(stableRecipeForCard || viewModel.recipe, viewModel);
  const heroRecipeMetaChips = getHeroRecipeMetaChips(recipeMetaChips);
  const recipeCardMetaItems = getRecipeCardMetaItems(stableRecipeForCard || viewModel.recipe);

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

  const showFolderBadge = Boolean(folderName && !showRecipeCard);
  const hasRecipeSourceDetails =
    showRecipeCard && Boolean(viewModel.caption || viewModel.transcript || viewModel.originalUrl || viewModel.tags?.length);
  const recipeDetailMetaItems = ['Cuisine', 'Style', 'Method'].map((label) => ({
    label,
    value: recipeCardMetaItems.find((item) => item.label === label)?.value || '—',
  }));
  const primaryRecipeStatItems = [
    { label: 'Prep', sourceLabel: 'Prep' },
    { label: 'Cook', sourceLabel: 'Cook' },
    { label: 'Total', sourceLabel: 'Total' },
  ].map((item) => {
    const raw = recipeCardMetaItems.find((metaItem) => metaItem.label === item.sourceLabel)?.value || '—';
    const value = /^\d+$/.test(raw.trim()) ? `${raw.trim()} min` : raw;
    return { label: item.label, value };
  });
  const statIconByLabel: Record<string, React.ReactNode> = {
    Prep: <Clock3 size={18} aria-hidden="true" />,
    Cook: <Flame size={18} aria-hidden="true" />,
    Total: <Timer size={18} aria-hidden="true" />,
  };

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
        ...(viewModel.originalUrl ? [{
          icon: isRefreshingVideo ? <Loader2 className="animate-spin" /> : <RefreshCw />,
          label: isRefreshingVideo ? 'Updating video…' : 'Refresh video',
          onClick: isRefreshingVideo ? () => {} : handleRefreshVideo,
        }] : []),
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

  const cameFromCookbook = (location.state as any)?.from === 'cookbook';
  const hasRecipeNote = recipeNote.trim().length > 0;
  const returnStateItems = [
    cookStatus.hasActiveSession ? 'Resume cooking' : '',
    cookStatus.cookedCount > 0
      ? `Cooked ${cookStatus.cookedCount}x${cookStatus.lastCookedLabel ? ` · last ${cookStatus.lastCookedLabel}` : ''}`
      : '',
    hasRecipeNote ? 'Note saved' : '',
  ].filter(Boolean);
  const showReturnState = showRecipeCard && !cookStatusLoading && returnStateItems.length > 0;
  const recipeMemoryLine = cookStatus.hasActiveSession
    ? 'Your place is saved for this recipe.'
    : cookStatus.cookedCount > 0 && hasRecipeNote
      ? 'You have a cooking note waiting for next time.'
      : cookStatus.cookedCount > 0
        ? 'A recipe you have already brought to the table.'
        : hasRecipeNote
          ? 'Your note is ready for next time.'
          : '';
  const mobileShoppingAction = showRecipeCard ? (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => inShoppingList
          ? removeRecipeFromShoppingList()
          : addRecipeToShoppingList(null)}
        disabled={shoppingLoading || shoppingSaving}
        className="flex w-full items-center gap-3 rounded-xl border border-emerald-100 bg-white p-3.5 text-left text-emerald-950 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-emerald-50/60 hover:shadow-md active:translate-y-px active:bg-emerald-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <ShoppingBasket size={19} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-emerald-950">
            {shoppingSaving
              ? 'Updating shopping list...'
              : inShoppingList
                ? 'In your shopping plan'
                : 'Add ingredients to shopping list'}
          </span>
          <span className="mt-0.5 block text-xs font-medium text-emerald-800/75">
            {inShoppingList
              ? 'Tap to remove it from groceries.'
              : 'Plan groceries for this recipe.'}
          </span>
        </span>
      </button>
    </div>
  ) : null;
  const desktopQuickActions = showRecipeCard ? (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setIsMoveModalOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-left transition-colors hover:border-amber-100 hover:bg-amber-50/40"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-amber-100 text-amber-700 ring-1 ring-amber-200/70">
          <FolderInput size={16} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">Collection</span>
          <span className="block text-[12px] text-slate-400">Move or organize</span>
        </span>
      </button>
      <button
        type="button"
        onClick={handleShare}
        className="flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-left transition-colors hover:border-primary-100 hover:bg-primary-50/40"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-primary-50 text-primary-600 ring-1 ring-primary-100">
          <IOSShareIcon size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">Share</span>
          <span className="block text-[12px] text-slate-400">Send the recipe out</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-left transition-colors hover:border-rose-100 hover:bg-rose-50/40"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-rose-100 text-rose-600 ring-1 ring-rose-200/70">
          <Pencil size={16} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">Edit details</span>
          <span className="block text-[12px] text-slate-400">Adjust the saved recipe</span>
        </span>
      </button>
    </div>
  ) : null;
  return (
    <div className="animate-fade-in relative z-0 px-0 pb-20 md:pb-6">
      <style>{HASHTAG_STYLE}</style>

      <div className="flex w-full flex-col items-start md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-5">
        <div className="min-w-0 w-full flex flex-col">
          {(refreshMessage || refreshError) && (
            <div
              className={`mb-4 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                refreshError
                  ? 'border-red-100 bg-red-50 text-red-700'
                  : 'border-primary-100 bg-primary-50 text-primary-800'
              }`}
            >
              {refreshError ? (
                <AlertCircle size={18} aria-hidden="true" className="shrink-0" />
              ) : (
                <Loader2 size={18} aria-hidden="true" className="shrink-0 animate-spin" />
              )}
              <span>{refreshError || refreshMessage}</span>
            </div>
          )}

          {/* Thumbnail */}
          {showRecipeCard && cameFromCookbook && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="mb-3 inline-flex w-fit items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-gray-600 ring-1 ring-gray-200 transition-colors hover:bg-white"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Back to Cookbook
            </button>
          )}

          <div
            className={
              showRecipeCard
                ? 'mb-5 mt-[calc(env(safe-area-inset-top,0px)+0.75rem)] overflow-hidden rounded-[26px] border border-white/75 bg-white/90 backdrop-blur-sm shadow-[0_4px_18px_rgba(15,23,42,0.06)] md:mt-0'
                : ''
            }
          >
          <div className={`relative z-0 w-full aspect-5/4 bg-black overflow-hidden group ${
            showRecipeCard ? 'mb-0 rounded-none' : 'mb-5 mt-[calc(env(safe-area-inset-top,0px)+0.75rem)] rounded-2xl shadow-sm md:mt-0'
          }`}>
            {viewModel.thumbnailUrl && (
              <img
                ref={posterImageRef}
                src={viewModel.thumbnailUrl}
                alt={viewModel.title}
                className="w-full h-full object-cover opacity-90 motion-safe:transition-transform motion-safe:duration-500 md:group-hover:scale-[1.015]"
                loading="eager"
                decoding="async"
                onLoad={() => {
                  if (perfEnabled) {
                    markPerfStep('first image/poster loaded');
                  }
                }}
              />
            )}

            <div
              className="absolute safe-top-offset left-4 right-4 flex justify-between z-20 md:top-4"
              style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
            >
              <button
                onClick={() => navigate(-1)}
                className="w-11 h-11 rounded-full bg-white/25 backdrop-blur-md border border-white/40 text-white flex items-center justify-center shadow-sm hover:bg-white/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 md:w-10 md:h-10"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSaveEdit}
                      className="hidden md:flex h-10 px-4 rounded-full border border-white/50 bg-white/90 text-gray-800 items-center justify-center shadow-sm font-bold text-sm gap-2 transition-colors hover:bg-white"
                    >
                      <Save size={18} /> {t('common:save', 'Save')}
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="w-11 h-11 rounded-full bg-white/25 backdrop-blur-md border border-white/40 text-white flex items-center justify-center transition-colors hover:bg-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 md:w-10 md:h-10"
                    >
                      <X size={20} />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsActionSheetOpen(true)}
                    className="w-11 h-11 rounded-full bg-white/25 backdrop-blur-md border border-white/40 text-white flex items-center justify-center hover:bg-white/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 md:w-9 md:h-9"
                  >
                    <EllipsisVertical size={18} />
                  </button>
                )}
              </div>
            </div>

            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between z-30 pointer-events-none">
              <div className="flex items-center gap-2 pointer-events-auto">
                {showFolderBadge && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-full shadow-sm">
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

          {showRecipeCard ? (
            <div className="px-4 pb-5 pt-5 md:px-6 md:pb-6 md:pt-6">
              <div className="flex items-start justify-between gap-3">
                <EditableTitle
                  title={viewModel.title}
                  isEditMode={isEditing}
                  value={viewModel.title}
                  onChange={(val: string) => handleEditField('title', val)}
                />
                {viewModel.hasTranslation && !isEditing && (
                  <button
                    type="button"
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); toggleLanguage(); }}
                    className="mt-1 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                    aria-label={showOriginal ? 'Show English' : `Show ${viewModel.languageCode}`}
                  >
                    <Globe size={14} aria-hidden="true" />
                    <span className="text-[11px] font-bold uppercase">
                      {showOriginal ? 'EN' : viewModel.languageCode}
                    </span>
                  </button>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <a
                  href={viewModel.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-0 items-center gap-2 group/author rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                >
                  <PlatformIconAuthor platform={viewModel.platform} />
                  <span className="truncate text-sm font-medium text-gray-600 transition-colors group-hover/author:text-gray-900">
                    {viewModel.author.replace('@', '')}
                  </span>
                </a>
                {viewModel.savedAt && (
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 sm:justify-end">
                    <Save size={13} aria-hidden="true" className="shrink-0 text-gray-400" />
                    <span>{viewModel.savedAt}</span>
                  </div>
                )}
              </div>

              {heroRecipeMetaChips.length > 0 && (
                <div className="mt-[18px] grid grid-cols-1 gap-[10px] border-t border-slate-100 pt-[18px] sm:grid-cols-2 lg:grid-cols-4">
                  {heroRecipeMetaChips.map((chip) => (
                    <div
                      key={`${chip.label}-${chip.value}`}
                      className="flex flex-col items-center justify-center gap-[5px] rounded-[12px] bg-slate-100 px-[10px] py-[14px] text-center"
                    >
                      <div className="text-[10px] font-bold uppercase tracking-[0.07em] text-slate-400">
                        {chip.label}
                      </div>
                      <div className="text-[14.5px] font-bold leading-snug text-slate-950">
                        {chip.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mb-3">
                <div className="flex items-start justify-between gap-3">
                  <EditableTitle
                    title={viewModel.title}
                    isEditMode={isEditing}
                    value={viewModel.title}
                    onChange={(val: string) => handleEditField('title', val)}
                  />
                </div>
              </div>
              <div className="mb-6 flex items-center justify-between">
                <a
                  href={viewModel.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 group/author rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                >
                  <PlatformIconAuthor platform={viewModel.platform} />
                  <span className="truncate text-xs font-medium text-gray-600 transition-colors group-hover/author:text-gray-900">
                    {viewModel.author.replace('@', '')}
                  </span>
                </a>
                {viewModel.savedAt && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <Save size={13} aria-hidden="true" className="shrink-0 text-gray-500" />
                    <span>{viewModel.savedAt}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Metadata (mobile) */}
          {showNonRecipeFallback && (
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
          {showNonRecipeFallback && (
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

          </div>

          {showRecipeCard && hasEnglishSummaryContent && (
            <RecipeAiSummaryCard
              summaryText={englishSummaryContent.summaryText}
              headlines={englishSummaryContent.headlines}
            />
          )}

          {/* Recipe card */}
          {showRecipeCard && stableRecipeForCard && (
            <section className="mb-5">
              <RecipeDetailsCard
                recipe={stableRecipeForCard}
                recipeId={currentVideoId}
                recipeName={viewModel.title ?? "Recipe"}
                servingScale={servingScale}
                onServingScaleChange={setServingScale}
                scaleQuantity={scaleQuantity}
                useMetric={useMetric}
                onToggleMetric={setUseMetric}
                temperatureUnit={temperatureUnit}
                recipeConversion={recipeConversion}
                volumePreference={volumePreference}
                rounding={rounding}
                onMarkCooked={markCooked}
                onAddCookingNote={openRecipeNotes}
                    cookStatusLoading={cookStatusLoading}
                openCookModeSignal={cookModeOpenSignal}
                secondaryAction={mobileShoppingAction}
                showStartCookingButton={!isDesktopRecipeDetailLayout}
                embedded={false}
                headerContent={(
                  <div className="grid grid-cols-3">
                    {primaryRecipeStatItems.map((item, index) => (
                      <div
                        key={item.label}
                        className="relative flex min-w-0 flex-col items-center gap-[5px] px-3 py-[13px] text-center"
                      >
                        {index < primaryRecipeStatItems.length - 1 && (
                          <span className="pointer-events-none absolute right-0 top-1/2 h-10 w-px -translate-y-1/2 bg-slate-100" />
                        )}
                        <div className="text-secondary-600 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:stroke-[1.9]">
                          {statIconByLabel[item.label]}
                        </div>
                        <div className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
                          {item.label}
                        </div>
                        <div className="truncate text-[18px] font-extrabold tabular-nums text-slate-950" title={item.value}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              />
            </section>
          )}

          {showRecipeCard && (recipeMetaChips.length > 0 || (viewModel.tags?.length > 0)) && (
            <section className="mb-5">
              <p className="mb-2.5 ml-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">More details</p>
              <div className="overflow-hidden rounded-[24px] border border-white/75 bg-white/90 shadow-[0_4px_18px_rgba(15,23,42,0.06)] backdrop-blur-sm">
                {viewModel.tags?.length > 0 && (
                  <details className="group border-b border-slate-100 last:border-b-0">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                      <span className="text-[14.5px] font-bold text-slate-700">Tags &amp; hashtags</span>
                      <ChevronDown size={16} className="text-slate-300 transition-transform duration-200 group-open:rotate-180" />
                    </summary>
                    <div className="flex flex-wrap gap-1.5 border-t border-slate-100 bg-white px-4 pb-4 pt-3">
                      {(viewModel.tags as string[]).map((tag: string) => (
                        <span key={tag} className="rounded-full bg-slate-100 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600">
                          {tag.startsWith('#') ? tag : `#${tag}`}
                        </span>
                      ))}
                    </div>
                  </details>
                )}
                {recipeMetaChips.length > 0 && (
                  <details className="group border-b border-slate-100 last:border-b-0">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[14.5px] font-bold text-slate-700">AI extraction details</span>
                        <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-bold text-primary-600">AI extracted</span>
                      </div>
                      <ChevronDown size={16} className="shrink-0 text-slate-300 transition-transform duration-200 group-open:rotate-180" />
                    </summary>
                    <div className="flex flex-wrap gap-1.5 border-t border-slate-100 bg-white px-4 pb-4 pt-3">
                      {recipeMetaChips.map((chip) => (
                        <span key={`details-${chip.label}-${chip.value}`} className="rounded-full bg-slate-100 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600">
                          {chip.label}: {chip.value}
                        </span>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </section>
          )}

          {showRecipeCard && viewModel.originalUrl && (
            <div className="md:hidden mb-4">
              <OriginalLink
                url={viewModel.originalUrl}
                platform={viewModel.platform}
                t={t}
              />
            </div>
          )}

          {showRecipeCard && !isDesktopRecipeDetailLayout && (
            <RecipeMobileStateSection
              note={recipeNote}
              onNoteChange={setRecipeNote}
              onNoteSave={saveRecipeNote}
              onNoteDelete={deleteRecipeNote}
              noteFocusSignal={noteFocusSignal}
              noteStatus={recipeNoteStatus}
              cookStatus={cookStatus}
              cookStatusLoading={cookStatusLoading}
              onMarkCooked={markCooked}
              onResetCookStatus={resetCookState}
              originalUrl={viewModel.originalUrl}
              platform={viewModel.platform}
              t={t}
            />
          )}

          {hasRecipeSourceDetails && (
            <div className="md:hidden">
              <Accordion
                key={currentVideoId}
                icon={<AlignLeft size={16} />}
                label={t('videoDetail:sourceDetails', 'Source details')}
              >
                <SourceDetailsContent
                  caption={viewModel.caption}
                  transcript={viewModel.transcript}
                  originalUrl={viewModel.originalUrl}
                  platform={viewModel.platform}
                  t={t}
                  showOriginalLink={false}
                  tags={viewModel.tags}
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

          {showNonRecipeFallback && viewModel.caption && (
            <Accordion icon={<AlignLeft size={16} />} label={t('videoDetail:caption', 'Caption')}>
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {viewModel.caption}
              </div>
            </Accordion>
          )}

          {showNonRecipeFallback && viewModel.transcript && (
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
                className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-800 shadow-sm transition-colors hover:bg-gray-50"
              >
                {t('common:saveChanges', 'Save Changes')}
              </button>
            </div>
          )}

          {showNonRecipeFallback && viewModel.originalUrl && (
            <OriginalLink
              url={viewModel.originalUrl}
              platform={viewModel.platform}
              t={t}
              className="md:hidden mt-4"
            />
          )}
        </div>

        {/* Desktop right column */}
        {showRecipeCard && isDesktopRecipeDetailLayout ? (
          <RecipeCookbookRail
            key={currentVideoId}
            folderName={folderName}
            metaChips={recipeMetaChips}
            caption={viewModel.caption}
            transcript={viewModel.transcript}
            originalUrl={viewModel.originalUrl}
            platform={viewModel.platform}
            t={t}
            note={recipeNote}
            onNoteChange={setRecipeNote}
            onNoteSave={saveRecipeNote}
            onNoteDelete={deleteRecipeNote}
            noteFocusSignal={noteFocusSignal}
            noteStatus={recipeNoteStatus}
            cookStatus={cookStatus}
            cookStatusLoading={cookStatusLoading}
            onMarkCooked={markCooked}
            onResetCookStatus={resetCookState}
            shoppingPlanned={inShoppingList}
            shoppingLoading={shoppingLoading}
            shoppingSaving={shoppingSaving}
            onStartCooking={() => setCookModeOpenSignal((value) => value + 1)}
            onAddToShoppingList={() => addRecipeToShoppingList(null)}
            onRemoveFromShoppingList={() => removeRecipeFromShoppingList()}
            quickActions={desktopQuickActions}
            memoryLine={recipeMemoryLine || undefined}
            memoryItems={returnStateItems}
          />
        ) : showNonRecipeFallback ? (
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
        ) : null}
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
