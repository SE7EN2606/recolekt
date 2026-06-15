import { resolveContentType } from '../components/ContentTypeBadge';
import {
  fmt, safe, inferLang, detectPlatform,
} from '../utils/videoDetailUtils';
import { getCategory, getTopic } from '../utils/videoUtils';
import type { LocationPlace } from '../utils/locationCardUtils';
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

export const parseJsonRecursively = (value: unknown, depth = 0): unknown => {
  if (depth > 3 || typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!/^[{[]/.test(trimmed)) return value;

  try {
    const parsed = JSON.parse(trimmed);
    return parseJsonRecursively(parsed, depth + 1);
  } catch {
    return value;
  }
};

export const isJsonShapedString = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!/^[{[]/.test(trimmed)) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
};

export const isUsableDisplayText = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === '[object Object]') return false;
  if (isJsonShapedString(trimmed)) return false;
  return true;
};

const valueAtPath = (value: any, path: string): unknown => {
  if (!value || typeof value !== 'object') return undefined;
  return path.split('.').reduce<unknown>((current: any, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return current[key];
  }, value);
};

export const extractLocalizedText = (
  value: unknown,
  field: 'title' | 'summary',
  showOriginal: boolean,
): string => {
  const parsed = parseJsonRecursively(value);
  const preferred = showOriginal ? 'original' : 'english';
  const fallback = showOriginal ? 'english' : 'original';
  const fieldPaths =
    field === 'title'
      ? [
          `${preferred}.title`,
          `${fallback}.title`,
          'title',
          `summary.${preferred}.title`,
          `summary.${fallback}.title`,
          'summary.title',
        ]
      : [
          `${preferred}.summary`,
          `${fallback}.summary`,
          'summary',
          'text',
          `summary.${preferred}.summary`,
          `summary.${fallback}.summary`,
          'summary.text',
        ];

  if (isUsableDisplayText(parsed)) return parsed.trim();
  if (!parsed || typeof parsed !== 'object') return '';

  for (const path of fieldPaths) {
    const candidate = parseJsonRecursively(valueAtPath(parsed, path));
    if (isUsableDisplayText(candidate)) return candidate.trim();
  }

  return '';
};

const displayFallbackFromCaption = (caption: unknown): string => {
  if (!isUsableDisplayText(caption)) return '';
  return caption.trim().split('\n')[0]?.substring(0, 80).trim() || '';
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

const localizedRecipeBranch = (recipe: any, key: 'english' | 'original'): any => {
  const parsed = parseJsonRecursively(recipe);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const candidate = parseJsonRecursively((parsed as any)[key]);
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : null;
};

export const selectLocalizedRecipe = (recipe: unknown, showOriginal: boolean): any => {
  let parsed = parseJsonRecursively(recipe);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as any).recipe) {
    parsed = parseJsonRecursively((parsed as any).recipe);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const english = localizedRecipeBranch(parsed, 'english');
  const original = localizedRecipeBranch(parsed, 'original');

  if (showOriginal && original) return original;
  if (english) return english;
  if (original) return original;
  return parsed;
};

export const hasUsableLocalizedRecipeBranch = (recipe: unknown, key: 'english' | 'original'): boolean => {
  const branch = localizedRecipeBranch(recipe, key);
  if (!branch) return false;
  return [
    branch.ingredients,
    branch.instructions,
    branch.steps,
    branch.directions,
    branch.method,
    branch.ingredient_sections,
    branch.ingredients_sections,
    branch.instruction_sections,
    branch.instructions_sections,
  ].some((value) => Array.isArray(value) && value.length > 0);
};

export const hasBilingualRecipeContent = (recipe: unknown): boolean =>
  hasUsableLocalizedRecipeBranch(recipe, 'english') &&
  hasUsableLocalizedRecipeBranch(recipe, 'original');

const normalizedComparisonText = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

const firstRecipeIngredientName = (recipe: any): string => {
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  const first = ingredients[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object') {
    return first.item || first.name || first.label || '';
  }
  return '';
};

const firstRecipeInstructionText = (recipe: any): string => {
  const instructions = Array.isArray(recipe?.instructions)
    ? recipe.instructions
    : Array.isArray(recipe?.steps)
      ? recipe.steps
      : Array.isArray(recipe?.directions)
        ? recipe.directions
        : [];
  const first = instructions[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object') {
    return first.instruction || first.text || first.step || first.description || first.body || '';
  }
  return '';
};

export const recipeBranchesMeaningfullyDifferent = (recipe: unknown): boolean => {
  const english = localizedRecipeBranch(recipe, 'english');
  const original = localizedRecipeBranch(recipe, 'original');
  if (!english || !original) return false;
  if (!hasUsableLocalizedRecipeBranch(recipe, 'english') || !hasUsableLocalizedRecipeBranch(recipe, 'original')) {
    return false;
  }

  const englishSignature = [
    english.title || english.name,
    firstRecipeIngredientName(english),
    firstRecipeInstructionText(english),
  ].map(normalizedComparisonText);

  const originalSignature = [
    original.title || original.name,
    firstRecipeIngredientName(original),
    firstRecipeInstructionText(original),
  ].map(normalizedComparisonText);

  return englishSignature.some((value, index) => value && originalSignature[index] && value !== originalSignature[index]);
};

const PLACEHOLDER_HEADLINE = 'key detail';
const PLACEHOLDER_DESCRIPTION = 'a concrete detail shown in the clip.';

const normalizePlaceholderText = (value: unknown): string =>
  String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

export const isPlaceholderHeadline = (bullet: any): boolean => {
  const headline = normalizePlaceholderText(
    typeof bullet === 'string' ? bullet : bullet?.headline || bullet?.title || bullet?.text,
  );
  const description = normalizePlaceholderText(
    typeof bullet === 'string' ? '' : bullet?.description || bullet?.text || bullet?.body,
  );
  return headline === PLACEHOLDER_HEADLINE || description === PLACEHOLDER_DESCRIPTION;
};

export const filterDisplayHeadlines = (bullets: any[]): any[] => {
  if (!Array.isArray(bullets) || bullets.length === 0) return [];
  return bullets.filter((bullet) => !isPlaceholderHeadline(bullet));
};

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const extractRawLocationPlaces = (location: any): any[] => {
  const parsed = parseMaybeJson<any>(location, null);
  if (!parsed) return [];

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (Array.isArray(parsed.places)) {
    return parsed.places;
  }

  if (Array.isArray(parsed.items)) {
    return parsed.items;
  }

  if (Array.isArray(parsed.location)) {
    return parsed.location;
  }

  if (parsed.location && typeof parsed.location === 'object') {
    return [parsed.location];
  }

  if (parsed.name) {
    return [parsed];
  }

  return [];
};

const locationQualityScore = (location: any): number => {
  const places = extractRawLocationPlaces(location);
  if (!places.length) return 0;

  return places.reduce((score, place) => {
    const lat = toNumberOrNull(place?.lat);
    const lng = toNumberOrNull(place?.lng);

    return score +
      1 +
      (lat !== null && lng !== null ? 10 : 0) +
      (safe(place?.city) ? 2 : 0) +
      (safe(place?.region) ? 2 : 0) +
      (safe(place?.country) ? 2 : 0) +
      (safe(place?.photo_url) ? 5 : 0) +
      (safe(place?.google_place_id) ? 4 : 0) +
      (toNumberOrNull(place?.rating ?? place?.google_rating) !== null ? 3 : 0) +
      (toNumberOrNull(place?.user_ratings_total ?? place?.review_count) !== null ? 2 : 0);
  }, 0);
};

const mergeLocationPlaces = (primaryLocation: any, secondaryLocation: any): any => {
  const primaryPlaces = extractRawLocationPlaces(primaryLocation);
  const secondaryPlaces = extractRawLocationPlaces(secondaryLocation);

  if (!primaryPlaces.length) return secondaryLocation ?? primaryLocation ?? null;
  if (!secondaryPlaces.length) return primaryLocation ?? secondaryLocation ?? null;

  const secondaryByKey = new Map<string, any>();

  secondaryPlaces.forEach((place: any, idx: number) => {
    const name = safe(place?.name || place?.google_name).toLowerCase();
    const rank = place?.rank != null ? String(place.rank) : String(idx + 1);

    if (name) secondaryByKey.set(`name:${name}`, place);
    secondaryByKey.set(`rank:${rank}`, place);
    secondaryByKey.set(`idx:${idx}`, place);
  });

  const mergedPlaces = primaryPlaces.map((place: any, idx: number) => {
    const name = safe(place?.name || place?.google_name).toLowerCase();
    const rank = place?.rank != null ? String(place.rank) : String(idx + 1);

    const fallback =
      (name && secondaryByKey.get(`name:${name}`)) ||
      secondaryByKey.get(`rank:${rank}`) ||
      secondaryByKey.get(`idx:${idx}`) ||
      null;

    if (!fallback) return place;

    return {
      ...fallback,
      ...place,
      name: safe(place?.name) || safe(fallback?.name) || safe(place?.google_name) || safe(fallback?.google_name),
      google_name: safe(place?.google_name) || safe(fallback?.google_name) || undefined,
      type: safe(place?.type || place?.place_type) || safe(fallback?.type || fallback?.place_type) || undefined,
      place_type: safe(place?.place_type || place?.type) || safe(fallback?.place_type || fallback?.type) || undefined,
      city: safe(place?.city) || safe(fallback?.city) || undefined,
      region: safe(place?.region) || safe(fallback?.region) || undefined,
      country: safe(place?.country) || safe(fallback?.country) || undefined,
      address: safe(place?.address) || safe(fallback?.address) || undefined,
      neighborhood: safe(place?.neighborhood) || safe(fallback?.neighborhood) || undefined,
      postal_code: safe(place?.postal_code) || safe(fallback?.postal_code) || undefined,
      description: safe(place?.description) || safe(fallback?.description) || undefined,
      instagram_username: safe(place?.instagram_username || place?.instagram) || safe(fallback?.instagram_username || fallback?.instagram) || undefined,
      instagram_account_name: safe(place?.instagram_account_name) || safe(fallback?.instagram_account_name) || undefined,
      google_place_id: safe(place?.google_place_id) || safe(fallback?.google_place_id) || undefined,
      maps_url: safe(place?.maps_url) || safe(fallback?.maps_url) || undefined,
      photo_url: safe(place?.photo_url) || safe(fallback?.photo_url) || undefined,
      rating: firstDefined(place?.rating, fallback?.rating, place?.google_rating, fallback?.google_rating) ?? undefined,
      google_rating: firstDefined(place?.google_rating, fallback?.google_rating, place?.rating, fallback?.rating) ?? undefined,
      user_ratings_total: firstDefined(place?.user_ratings_total, fallback?.user_ratings_total, place?.review_count, fallback?.review_count) ?? undefined,
      review_count: firstDefined(place?.review_count, fallback?.review_count, place?.user_ratings_total, fallback?.user_ratings_total) ?? undefined,
      price_level: firstDefined(place?.price_level, fallback?.price_level) ?? undefined,
      lat: firstDefined(place?.lat, fallback?.lat) ?? null,
      lng: firstDefined(place?.lng, fallback?.lng) ?? null,
      is_saved: firstDefined(place?.is_saved, fallback?.is_saved, place?.isSaved, fallback?.isSaved, place?.saved, fallback?.saved, place?.is_bookmarked, fallback?.is_bookmarked) ?? undefined,
      isSaved: firstDefined(place?.isSaved, fallback?.isSaved, place?.is_saved, fallback?.is_saved, place?.saved, fallback?.saved, place?.is_bookmarked, fallback?.is_bookmarked) ?? undefined,
      saved: firstDefined(place?.saved, fallback?.saved, place?.is_saved, fallback?.is_saved, place?.isSaved, fallback?.isSaved, place?.is_bookmarked, fallback?.is_bookmarked) ?? undefined,
      is_bookmarked: firstDefined(place?.is_bookmarked, fallback?.is_bookmarked, place?.is_saved, fallback?.is_saved, place?.isSaved, fallback?.isSaved, place?.saved, fallback?.saved) ?? undefined,
    };
  });

  const primaryObj =
    primaryLocation && !Array.isArray(primaryLocation) && typeof primaryLocation === 'object'
      ? primaryLocation
      : {};

  const secondaryObj =
    secondaryLocation && !Array.isArray(secondaryLocation) && typeof secondaryLocation === 'object'
      ? secondaryLocation
      : {};

  return {
    ...secondaryObj,
    ...primaryObj,
    country: safe(primaryObj?.country) || safe(secondaryObj?.country) || undefined,
    title: safe(primaryObj?.title) || safe(secondaryObj?.title) || undefined,
    places: mergedPlaces,
    items: mergedPlaces,
  };
};

const chooseMergedLocation = (dbLocation: any, gcsLocation: any, fallbackLocation: any): any => {
  const dbScore = locationQualityScore(dbLocation);
  const gcsScore = locationQualityScore(gcsLocation);

  if (dbScore === 0 && gcsScore === 0) {
    return firstDefined(dbLocation, gcsLocation, fallbackLocation);
  }

  if (dbScore >= gcsScore) {
    return mergeLocationPlaces(dbLocation, gcsLocation);
  }

  return mergeLocationPlaces(gcsLocation, dbLocation);
};

const normalizeLocationPlace = (place: any, fallbackCountry?: string): LocationPlace => {
  const lat = toNumberOrNull(place?.lat);
  const lng = toNumberOrNull(place?.lng);
  const rating = toNumberOrNull(place?.rating ?? place?.google_rating);
  const googleRating = toNumberOrNull(place?.google_rating ?? place?.rating);
  const userRatingsTotal = toNumberOrNull(place?.user_ratings_total ?? place?.review_count);
  const reviewCount = toNumberOrNull(place?.review_count ?? place?.user_ratings_total);
  const priceLevel = toNumberOrNull(place?.price_level);

  return {
    ...place,
    rank: place?.rank,
    name: safe(place?.name) || safe(place?.google_name),
    google_name: safe(place?.google_name) || undefined,
    type: safe(place?.type || place?.place_type) || undefined,
    place_type: safe(place?.place_type || place?.type) || undefined,
    city: safe(place?.city) || undefined,
    region: safe(place?.region) || undefined,
    country: safe(place?.country) || safe(fallbackCountry) || undefined,
    address: safe(place?.address) || undefined,
    neighborhood: safe(place?.neighborhood) || undefined,
    description: safe(place?.description) || undefined,
    instagram_username: safe(place?.instagram_username || place?.instagram) || undefined,
    instagram_account_name: safe(place?.instagram_account_name) || undefined,
    postal_code: safe(place?.postal_code) || undefined,
    google_place_id: safe(place?.google_place_id) || undefined,
    maps_url: safe(place?.maps_url) || undefined,
    photo_url: safe(place?.photo_url) || undefined,
    rating,
    google_rating: googleRating,
    user_ratings_total: userRatingsTotal,
    review_count: reviewCount,
    price_level: priceLevel,
    lat,
    lng,
    is_saved: firstDefined(place?.is_saved, place?.isSaved, place?.saved, place?.is_bookmarked) ?? undefined,
    isSaved: firstDefined(place?.isSaved, place?.is_saved, place?.saved, place?.is_bookmarked) ?? undefined,
    saved: firstDefined(place?.saved, place?.is_saved, place?.isSaved, place?.is_bookmarked) ?? undefined,
    is_bookmarked: firstDefined(place?.is_bookmarked, place?.is_saved, place?.isSaved, place?.saved) ?? undefined,
  } as LocationPlace;
};

const looksLikeSinglePlace = (obj: any): boolean =>
  !!obj
  && typeof obj === 'object'
  && !Array.isArray(obj)
  && !!(obj.name || obj.google_name);

const normalizeLocationData = (rawLoc: any): LocationData | null => {
  const parsed = parseMaybeJson<any>(rawLoc, null);
  if (!parsed) return null;

  if (Array.isArray(parsed)) {
    return {
      places: parsed.map((place) => normalizeLocationPlace(place)),
      items: parsed.map((place) => normalizeLocationPlace(place)),
    };
  }

  if (looksLikeSinglePlace(parsed)) {
    const place = normalizeLocationPlace(parsed, parsed.country);

    return {
      country: safe(parsed.country) || undefined,
      title: safe(parsed.title) || undefined,
      places: [place],
      items: [place],
    };
  }

  if (typeof parsed === 'object') {
    const fallbackCountry = safe(parsed.country) || undefined;

    const places = Array.isArray(parsed.places)
      ? parsed.places.map((place: any) => normalizeLocationPlace(place, fallbackCountry))
      : Array.isArray(parsed.items)
        ? parsed.items.map((place: any) => normalizeLocationPlace(place, fallbackCountry))
        : Array.isArray(parsed.location)
          ? parsed.location.map((place: any) => normalizeLocationPlace(place, fallbackCountry))
          : [];

    return {
      ...parsed,
      country: fallbackCountry,
      title: safe(parsed.title) || undefined,
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
  String(v?.content_type || v?.contentType || '').toLowerCase();

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

  merged.summary = firstDefined(db?.summary, gcs?.summary, merged.summary);
  merged.tools_list = firstDefined(db?.tools_list, gcs?.tools_list, merged.tools_list);
  merged.structure_analysis = firstDefined(db?.structure_analysis, gcs?.structure_analysis, merged.structure_analysis);
  merged.location = chooseMergedLocation(db?.location, gcs?.location, merged.location);
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
  merged.status = firstDefined(db?.status, gcs?.status, merged.status);
  merged.error_message = firstDefined(db?.error_message, db?.errorMessage, gcs?.error_message, gcs?.errorMessage, merged.error_message);
  merged.errorMessage = merged.error_message;
  merged.updated_at = firstDefined(db?.updated_at, db?.updatedAt, gcs?.updated_at, gcs?.updatedAt, merged.updated_at);
  merged.thumbnailUrl =
    firstNonEmpty(
      db?.thumbnailUrl,
      db?.gcs_urls?.preview_thumbnail,
      gcs?.thumbnailUrl,
      gcs?.gcs_urls?.preview_thumbnail,
      fallbackThumb,
    ) || undefined;

  const normalizedTitle = extractLocalizedText(
    {
      english: parseSummaryObject(merged.summary)?.english,
      original: parseSummaryObject(merged.summary)?.original,
      title: merged.summary_title || merged.title,
      summary: merged.summary,
    },
    'title',
    false,
  );

  if (normalizedTitle) {
    merged.summary_title = normalizedTitle;
    merged.title = normalizedTitle;
  }

  return merged;
};

export const buildViewModel = (
  v: any,
  showOriginal: boolean,
  galleryThumbnail: string | undefined,
) => {
  const rawContentType = resolveInternalContentType(v);
  const isRecipeContent = rawContentType === 'recipe';
  const summaryObj = parseSummaryObject(v.summary);
  const englishData = summaryObj.english || {};
  const originalData = summaryObj.original || {};

  let recipeData = parseMaybeJson<any>(v.recipe, null);
  if (recipeData?.recipe) recipeData = recipeData.recipe;
  const recipeHasUsableEnglish = hasUsableLocalizedRecipeBranch(recipeData, 'english');
  const recipeHasUsableOriginal = hasUsableLocalizedRecipeBranch(recipeData, 'original');
  const forceOriginalRecipeLanguage =
    isRecipeContent && recipeHasUsableOriginal && !recipeHasUsableEnglish;
  const useOriginalLanguage = showOriginal || forceOriginalRecipeLanguage;

  const langBlock =
    useOriginalLanguage && Object.keys(originalData).length > 0
      ? originalData
      : Object.keys(englishData).length > 0
        ? englishData
        : summaryObj;

  const ext = v.detected_language?.toLowerCase();
  const trans = v.transcription?.detected_language?.toLowerCase();
  const recipeEnglish = recipeData?.english;
  const recipeOriginal = recipeData?.original;
  const recipeIsBilingual =
    recipeEnglish &&
    recipeOriginal &&
    typeof recipeEnglish === 'object' &&
    typeof recipeOriginal === 'object' &&
    recipeBranchesMeaningfullyDifferent(recipeData);
  const summaryIsDifferent =
    Object.keys(englishData).length > 0 &&
    Object.keys(originalData).length > 0 &&
    (originalData.title !== englishData.title || originalData.summary !== englishData.summary);
  const contentIsDifferent = isRecipeContent
    ? Boolean(recipeIsBilingual)
    : summaryIsDifferent;

  let langCode = 'EN';
  if (ext && ext !== 'unknown' && ext !== 'en') langCode = ext.toUpperCase();
  else if (trans && trans !== 'unknown' && trans !== 'en') langCode = trans.toUpperCase();
  else if (contentIsDifferent) langCode = inferLang(`${originalData.title || ''} ${originalData.summary || ''}`);

  const activeRecipe = selectLocalizedRecipe(recipeData, useOriginalLanguage);

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

  const bullets: any[] = filterDisplayHeadlines(
    Array.isArray(langBlock.headlines)
      ? langBlock.headlines
      : Array.isArray(v.summary_bullets)
        ? v.summary_bullets
        : Array.isArray(v.bullets)
          ? v.bullets
          : [],
  );

  const rawDate = v.savedAt || v.createdat || v.created_at;
  const savedAt = rawDate
    ? (() => {
        try {
          return new Date(rawDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch { return safe(rawDate); }
      })()
    : '';

  const sourceUrl = safe(v.source_url || v.originalUrl);

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

  const resolvedTitle =
    extractLocalizedText(summaryObj, 'title', useOriginalLanguage) ||
    extractLocalizedText(v.summary_title, 'title', useOriginalLanguage) ||
    extractLocalizedText(v.title, 'title', useOriginalLanguage) ||
    displayFallbackFromCaption(v.caption) ||
    'Saved Reel';

  const resolvedSummary =
    extractLocalizedText(summaryObj, 'summary', useOriginalLanguage) ||
    extractLocalizedText(v.summary_text, 'summary', useOriginalLanguage) ||
    extractLocalizedText(v.list_summary, 'summary', useOriginalLanguage);

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
