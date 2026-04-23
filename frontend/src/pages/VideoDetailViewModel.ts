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
  structure_type?: 'ranking' | 'tier' | 'verdict' | 'grouped' | string;
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

const firstDefined = <T,>(...values: T[]): T | undefined => {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
};

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeLocationPlace = (place: any): LocationPlace => {
  const lat = toNumberOrNull(place?.lat);
  const lng = toNumberOrNull(place?.lng);

  return {
    ...place,
    name: safe(place?.name),
    type: safe(place?.type || place?.place_type),
    place_type: safe(place?.place_type || place?.type),
    city: safe(place?.city) || undefined,
    region: safe(place?.region) || undefined,
    country: safe(place?.country) || undefined,
    address: safe(place?.address) || undefined,
    neighborhood: safe(place?.neighborhood) || undefined,
    description: safe(place?.description) || undefined,
    instagram: safe(place?.instagram || place?.instagram_username) || undefined,
    instagram_username: safe(place?.instagram_username || place?.instagram) || undefined,
    instagram_account_name: safe(place?.instagram_account_name) || undefined,
    postal_code: safe(place?.postal_code) || undefined,
    google_place_id: safe(place?.google_place_id) || undefined,
    maps_url: safe(place?.maps_url) || undefined,
    lat,
    lng,
  } as LocationPlace;
};

const looksLikeSinglePlace = (obj: any): boolean =>
  !!obj
  && typeof obj === 'object'
  && !Array.isArray(obj)
  && !!obj.name;

const normalizeLocationData = (rawLoc: any): LocationData | null => {
  const parsed = parseMaybeJson<any>(rawLoc, null);
  if (!parsed) return null;

  if (Array.isArray(parsed)) {
    return {
      places: parsed.map(normalizeLocationPlace),
    };
  }

  if (looksLikeSinglePlace(parsed)) {
    return {
      places: [normalizeLocationPlace(parsed)],
    };
  }

  if (typeof parsed === 'object') {
    const places = Array.isArray(parsed.places)
      ? parsed.places.map(normalizeLocationPlace)
      : Array.isArray(parsed.items)
        ? parsed.items.map(normalizeLocationPlace)
        : [];

    return {
      ...parsed,
      places,
      items: places,
    };
  }

  return null;
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

export const resolveInternalContentType = (v: any): string =>
  String(v?.content_type || '').toLowerCase();

export const isToolsContentType = (contentType: string): boolean =>
  contentType === 'products' || contentType === 'software' || contentType === 'finance';

export const PINNED_KEY = 'rekolektpinnedlocations';

export const getPinnedMap = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(PINNED_KEY) || '{}'); } catch { return {}; }
};

export const setPinnedMap = (map: Record<string, boolean>) => {
  try { localStorage.setItem(PINNED_KEY, JSON.stringify(map)); } catch {}
};

export const mergeVideoPayload = (db: any, gcs: any, fallbackThumb?: string) => {
  const merged = { ...(gcs || {}), ...(db || {}), raw: db, gcs };

  merged.id = firstDefined(db?.id, db?.process_id, gcs?.id, gcs?.process_id);
  merged.process_id = firstDefined(db?.process_id, db?.id, gcs?.process_id, gcs?.id);

  // Fresh DB must win for mutable fields.
  merged.summary = firstDefined(db?.summary, gcs?.summary, merged.summary);
  merged.tools_list = firstDefined(db?.tools_list, gcs?.tools_list, merged.tools_list);
  merged.structure_analysis = firstDefined(db?.structure_analysis, gcs?.structure_analysis, merged.structure_analysis);
  merged.location = firstDefined(db?.location, gcs?.location, merged.location);
  merged.recipe = firstDefined(db?.recipe, gcs?.recipe, merged.recipe);
  merged.workout = firstDefined(db?.workout, gcs?.workout, merged.workout);
  merged.caption = firstDefined(db?.caption, gcs?.caption, merged.caption);
  merged.transcription = firstDefined(db?.transcription, gcs?.transcription, merged.transcription);
  merged.content_type = firstDefined(db?.content_type, gcs?.content_type, merged.content_type);
  merged.summary_title = firstDefined(db?.summary_title, gcs?.summary_title, merged.summary_title);
  merged.summary_category = firstDefined(db?.summary_category, gcs?.summary_category, merged.summary_category);
  merged.summary_topic = firstDefined(db?.summary_topic, gcs?.summary_topic, merged.summary_topic);
  merged.detected_language = firstDefined(db?.detected_language, gcs?.detected_language, merged.detected_language);
  merged.list_subtype = firstDefined(db?.list_subtype, gcs?.list_subtype, merged.list_subtype);
  merged.list_type = firstDefined(db?.list_type, gcs?.list_type, merged.list_type);
  merged.is_list = firstDefined(db?.is_list, gcs?.is_list, merged.is_list);
  merged.list_count = firstDefined(db?.list_count, gcs?.list_count, merged.list_count);
  merged.list_summary = firstDefined(db?.list_summary, gcs?.list_summary, merged.list_summary);

  merged.gcs_urls = firstDefined(db?.gcs_urls, gcs?.gcs_urls, merged.gcs_urls) || {};
  merged.thumbnailUrl =
    firstNonEmpty(
      db?.thumbnailUrl,
      db?.gcs_urls?.preview_thumbnail,
      gcs?.thumbnailUrl,
      gcs?.gcs_urls?.preview_thumbnail,
      fallbackThumb,
    ) || undefined;

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
  const locationData = normalizeLocationData(v.location);

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

  const rawContentType = resolveInternalContentType(v);
  const contentType = rawContentType === 'location'
    ? 'location'
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