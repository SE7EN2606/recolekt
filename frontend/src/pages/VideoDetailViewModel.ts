// src/pages/VideoDetailViewModel.ts
import { resolveContentType } from '../components/ContentTypeBadge';
import {
  fmt, safe, inferLang, detectPlatform,
} from '../utils/videoDetailUtils';
import { getCategory, getTopic } from '../utils/videoUtils';
import { LocationPlace } from '../components/LocationCard';
import { ToolsList } from '../components/ToolsListCard';

export interface LocationData {
  places?: LocationPlace[];
  items?: LocationPlace[];
  country?: string;
  title?: string;
}

export interface StructureAnalysis {
  mode?: 'structured' | 'bookmark' | string;
  structure_type?: 'ranking' | 'tier' | 'verdict' | 'grouped' | 'none' | string;
  confidence?: number;
  reasons?: string[];
  counts?: Record<string, any>;
  list_subtype?: string;
  is_ranked?: boolean;
}

export const parseMaybeJson = <T,>(value: unknown, fallback: T): T => {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  if (typeof value === 'object') return value as T;
  return fallback;
};

export const parseSummaryObject = (value: unknown): any => {
  const parsed = parseMaybeJson<any>(value, {});
  return parsed && typeof parsed === 'object' ? parsed : {};
};

export const firstNonEmpty = (...values: unknown[]): string => {
  for (const v of values) {
    const s = safe(v);
    if (s) return s;
  }
  return '';
};

export const normalizeToolsList = (toolsList: unknown): ToolsList | null => {
  const tl = parseMaybeJson<any>(toolsList, null);
  if (!tl || typeof tl !== 'object') return null;
  if (tl.en || tl.original || tl.english || tl.categories) return tl as ToolsList;
  return null;
};

export const getToolsCategoriesForLanguage = (
  toolsList: ToolsList | null | undefined,
  showOriginal: boolean,
): any[] => {
  const tl = toolsList as any;
  if (!tl) return [];
  if (showOriginal) {
    return tl?.original?.categories ?? tl?.en?.categories ?? tl?.english?.categories ?? tl?.categories ?? [];
  }
  return tl?.en?.categories ?? tl?.english?.categories ?? tl?.original?.categories ?? tl?.categories ?? [];
};

export const getAnyToolsCategories = (toolsList: ToolsList | null | undefined): any[] =>
  getToolsCategoriesForLanguage(toolsList, false);

export const hasToolsItems = (toolsList: ToolsList | null | undefined): boolean => {
  const cats = getAnyToolsCategories(toolsList);
  return Array.isArray(cats) && cats.some((cat: any) => Array.isArray(cat?.items) && cat.items.length > 0);
};

export const isStructuredToolsType = (
  value: unknown,
): value is 'ranking' | 'tier' | 'verdict' | 'grouped' =>
  value === 'ranking' || value === 'tier' || value === 'verdict' || value === 'grouped';

export const isBadgeToolsSubtype = (
  value: unknown,
): value is 'software' | 'lifestyle' | 'gear' | 'food' | 'ranking' | 'tier' | 'verdict' | 'grouped' | 'picks' =>
  value === 'software' || value === 'lifestyle' || value === 'gear'
  || value === 'food' || value === 'ranking' || value === 'tier'
  || value === 'verdict' || value === 'grouped' || value === 'picks';

// Reads debug.content_type ("tools") when the public content_type is "products"
export const resolveInternalContentType = (v: any): string => {
  const debugType = String(v?.debug?.content_type || '').toLowerCase();
  if (debugType === 'tools') return 'tools';
  return String(v?.content_type || '').toLowerCase();
};

// Whether this content type should show a ToolsListCard
export const isToolsContentType = (contentType: string): boolean =>
  contentType === 'tools' || contentType === 'products';

export const PINNED_KEY = 'rekolektpinnedlocations';

export const getPinnedMap = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(PINNED_KEY) || '{}'); } catch { return {}; }
};

export const setPinnedMap = (map: Record<string, boolean>) => {
  try { localStorage.setItem(PINNED_KEY, JSON.stringify(map)); } catch {}
};

export const mergeVideoPayload = (db: any, gcs: any, fallbackThumb?: string) => {
  const merged = { ...(db || {}), ...(gcs || {}), raw: db, gcs: gcs };

  merged.id = merged.id || merged.process_id || db?.id || db?.process_id;
  merged.process_id = merged.process_id || db?.process_id || merged.id;
  merged.summary = merged.summary ?? gcs?.summary ?? db?.summary;
  merged.tools_list = merged.tools_list ?? gcs?.tools_list ?? db?.tools_list;
  merged.structure_analysis = merged.structure_analysis ?? gcs?.structure_analysis ?? db?.structure_analysis;
  merged.location = merged.location ?? gcs?.location ?? db?.location;
  merged.recipe = merged.recipe ?? gcs?.recipe ?? db?.recipe;
  merged.workout = merged.workout ?? gcs?.workout ?? db?.workout;
  merged.caption = merged.caption ?? gcs?.caption ?? db?.caption;
  merged.transcription = merged.transcription ?? gcs?.transcription ?? db?.transcription;
  merged.content_type = merged.content_type ?? gcs?.content_type ?? db?.content_type;
  merged.summary_title = merged.summary_title ?? gcs?.summary_title ?? db?.summary_title;
  merged.summary_category = merged.summary_category ?? gcs?.summary_category ?? db?.summary_category;
  merged.summary_topic = merged.summary_topic ?? gcs?.summary_topic ?? db?.summary_topic;
  merged.detected_language = merged.detected_language ?? gcs?.detected_language ?? db?.detected_language;
  merged.list_subtype = merged.list_subtype ?? gcs?.list_subtype ?? db?.list_subtype;
  merged.list_type = merged.list_type ?? gcs?.list_type ?? db?.list_type;
  merged.is_list = merged.is_list ?? gcs?.is_list ?? db?.is_list;
  merged.list_count = merged.list_count ?? gcs?.list_count ?? db?.list_count;
  merged.list_summary = merged.list_summary ?? gcs?.list_summary ?? db?.list_summary;
  merged.thumbnailUrl =
    merged.thumbnailUrl
    || merged.gcs_urls?.preview_thumbnail
    || db?.gcs_urls?.preview_thumbnail
    || gcs?.gcs_urls?.preview_thumbnail
    || fallbackThumb;

  return merged;
};

export const buildViewModel = (
  v: any,
  showOriginal: boolean,
  galleryThumbnail: string | undefined,
) => {
  const summaryObj = parseSummaryObject(v.summary);
  const englishData = summaryObj.english || {};
  const originalData = summaryObj.original || {};

  const contentIsDifferent =
    Object.keys(englishData).length > 0 &&
    Object.keys(originalData).length > 0 &&
    (originalData.title !== englishData.title || originalData.summary !== englishData.summary);

  const langBlock =
    showOriginal && Object.keys(originalData).length > 0
      ? originalData
      : Object.keys(englishData).length > 0
        ? englishData
        : summaryObj;

  const ext = v.detected_language?.toLowerCase();
  const trans = v.transcription?.detected_language?.toLowerCase();
  let langCode = 'EN';
  if (ext && ext !== 'unknown' && ext !== 'en') langCode = ext.toUpperCase();
  else if (trans && trans !== 'unknown' && trans !== 'en') langCode = trans.toUpperCase();
  else if (contentIsDifferent) langCode = inferLang(`${originalData.title || ''} ${originalData.summary || ''}`);

  let recipeData = parseMaybeJson<any>(v.recipe, null);
  if (recipeData?.recipe) recipeData = recipeData.recipe;
  const activeRecipe =
    recipeData && Object.keys(recipeData).length > 0
      ? showOriginal && recipeData.original ? recipeData.original : recipeData.english || recipeData
      : null;

  let workoutData = parseMaybeJson<any>(v.workout, null);
  if (workoutData && Object.keys(workoutData).length === 0) workoutData = null;

  const toolsList = normalizeToolsList(v.tools_list);

  let locationData: LocationData | null = null;
  const rawLoc = parseMaybeJson<any>(v.location, null);
  if (Array.isArray(rawLoc)) {
    locationData = { places: rawLoc.map((p: any) => ({ ...p, region: p.region ?? p.city ?? undefined })) };
  } else if (rawLoc && typeof rawLoc === 'object') {
    locationData = rawLoc as LocationData;
  }

  let transcript = '';
  if (v.transcription) {
    const raw =
      v.transcription.transcript ||
      v.transcription.text ||
      (typeof v.transcription === 'string' ? v.transcription : '');
    transcript =
      typeof raw === 'string' && raw.trim().startsWith('{')
        ? (() => { try { return JSON.parse(raw).transcript || raw; } catch { return raw; } })()
        : typeof raw === 'string' ? raw : '';
  } else if (v.transcript) {
    transcript = typeof v.transcript === 'string' ? v.transcript : v.transcript.text || '';
  }

  const bullets: any[] =
    Array.isArray(langBlock.headlines)
      ? langBlock.headlines
      : Array.isArray(v.summary_bullets)
        ? v.summary_bullets
        : Array.isArray(v.bullets)
          ? v.bullets
          : [];

  const rawDate = v.savedAt || v.createdat || v.created_at;
  const savedAt = rawDate
    ? (() => {
        try {
          return new Date(rawDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch { return safe(rawDate); }
      })()
    : '';

  const sourceUrl = safe(v.source_url || v.originalUrl);

  // Prefer debug.content_type ("tools") over public content_type ("products")
  const internalRawType = resolveInternalContentType(v);
  const rawContentType = internalRawType || String(v.content_type || '').toLowerCase();
  const contentType = rawContentType === 'location'
    ? 'places'
    : resolveContentType(rawContentType);

  const structureAnalysis = parseMaybeJson<StructureAnalysis | null>(v.structure_analysis, null);
  const subtypeFromStructure =
    structureAnalysis?.mode === 'structured' && isStructuredToolsType(structureAnalysis?.structure_type)
      ? structureAnalysis.structure_type
      : undefined;

  const subtypeFromLegacy =
    typeof v.list_subtype === 'string' && isStructuredToolsType(v.list_subtype)
      ? v.list_subtype
      : typeof (toolsList as any)?.list_subtype === 'string' && isStructuredToolsType((toolsList as any)?.list_subtype)
        ? (toolsList as any).list_subtype
        : undefined;

  const structuredType = subtypeFromStructure ?? subtypeFromLegacy;
  const toolsItemsPresent = hasToolsItems(toolsList);

  // Cast to string to avoid TS union overlap errors — contentType may come back as a
  // narrowed literal union from resolveContentType, but "tools"/"products" are valid runtime values.
  const contentTypeStr = contentType as string;

  const isStructuredTools =
    isToolsContentType(contentTypeStr) &&
    toolsItemsPresent &&
    ((structureAnalysis?.mode === 'structured' && !!structuredType) || !!structuredType);

  const resolvedTitle = firstNonEmpty(
    langBlock.title,
    summaryObj.title,
    v.summary_title,
    v.title,
    typeof v.caption === 'string' ? v.caption.split('\n')[0]?.substring(0, 56) : undefined,
  ) || 'Saved Reel';

  const resolvedSummary = firstNonEmpty(
    langBlock.summary,
    summaryObj.summary,
    v.summary_text,
    v.list_summary,
  );

  return {
    id: v.id || v.process_id,
    title: resolvedTitle,
    author: safe(v.author_name || v.author) || 'Unknown',
    category: safe(v.summary_category || v.category || getCategory(v)),
    subCategory: safe(v.summary_topic || v.subCategory || v.topic || getTopic(v)),
    summary: resolvedSummary,
    bullets,
    tags: Array.isArray(langBlock.hashtags) ? langBlock.hashtags : Array.isArray(v.tags) ? v.tags : [],
    transcript: transcript.trim(),
    caption: (typeof v.caption === 'string' ? v.caption : v.caption?.text || '').trim(),
    recipe: activeRecipe,
    workout: workoutData,
    toolsList,
    location: locationData,
    contentType: contentTypeStr,
    structureAnalysis,
    structuredType,
    isStructuredTools,
    thumbnailUrl: safe(v.thumbnailUrl || v.gcs_urls?.preview_thumbnail || v.preview) || galleryThumbnail,
    originalUrl: sourceUrl,
    platform: detectPlatform(sourceUrl),
    savedAt,
    hasTranslation: contentIsDifferent,
    languageCode: langCode,
    duration: fmt(v.duration || v.duration_seconds),
  };
};