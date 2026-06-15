import { API_BASE } from '../utils/api';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { Video, Folder } from '../types';
import { useAuth, getAuthHeaders } from './AuthContext';

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface LocationPlace {
  id?: string;
  name: string;
  type?: string;
  place_type?: string;
  city?: string;
  region?: string;
  country?: string;
  address?: string;
  neighborhood?: string;
  postal_code?: string;
  description?: string;
  instagram?: string;
  instagram_username?: string;
  instagram_account_name?: string;
  google_place_id?: string;
  maps_url?: string;
  emoji?: string;
  rank?: number;
  lat?: number | null;
  lng?: number | null;
  _vid?: string;
  _idx?: number;
}

// Grocery list item — matches what GroceryList.tsx and RecipeDetailsCard expect
export interface GroceryItem {
  id: string;
  name: string;
  quantity?: string;
  unit?: string;
  emoji?: string;
  recipeTitle?: string;
  checked: boolean;
  have?: boolean; // true = user already has this at home (pantry exclusion)
}

export type AddVideoResult = {
  clientTempId: string;
  processId: string;
  status: string;
  sourceUrl: string;
  createdAt: string;
  previewUrl?: string | null;
};

export type DuplicateReelResponse = {
  duplicate: true;
  code: 'duplicate_reel';
  message: string;
  existingReelId?: string;
  existingReelUrl?: string;
  canonicalKey?: string | null;
  originalUrl?: string | null;
  canonicalUrl?: string | null;
  sourceUrl?: string | null;
  title?: string | null;
  status?: string | null;
};

export class DuplicateReelError extends Error {
  duplicate: DuplicateReelResponse;

  constructor(duplicate: DuplicateReelResponse) {
    super(duplicate.message || 'Already saved');
    this.name = 'DuplicateReelError';
    this.duplicate = duplicate;
  }
}

interface DataContextType {
  videos: Video[];
  folders: Folder[];
  isLoading: boolean;
  savedPlaces: LocationPlace[];
  toggleSavedPlace: (place: LocationPlace) => Promise<void>;
  addFolder: (name: string, parentId?: string | null) => Promise<void>;
  updateFolder: (id: string, name: string, parentId?: string | null) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  toggleFavorite: (videoId: string) => Promise<void>;
  moveVideos: (videoIds: string[], targetFolderId: string) => Promise<void>;
  updateVideo: (id: string, updates: any) => Promise<void>;
  deleteVideos: (videoIds: string[]) => Promise<void>;
  addVideo: (url: string, forceRetry?: boolean) => Promise<AddVideoResult>;
  refreshVideo: (videoId: string) => Promise<void>;
  hydrateVideo: (videoId: string, hydrated: any) => void;
  refreshVideos: () => Promise<void>;
  refreshFolders: () => Promise<void>;
  getVideoById: (id: string) => Video | undefined;
  // Grocery list
  groceryList: GroceryItem[];
  addToGroceryList: (items: GroceryItem[]) => void;
  toggleGroceryItem: (id: string) => void;
  toggleGroceryHave: (id: string) => void;
  clearGroceryList: () => void;
  removeFromGroceryList: (ids: string[]) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const SAVED_REELS_PATH = '/api/saved_reels';
const SAVED_PLACES_PATH = '/api/saved-places';
const SAVED_PLACES_TIMEOUT_MS = 10000;

let globalLastFetchTime = 0;
let isFetchingGlobal = false;

function joinUrl(base: string, path: string) {
  const p = String(path || '').replace(/^\/+/, '');
  if (!base) return `/${p}`;
  const b = String(base || '').replace(/\/+$/, '');
  return `${b}/${p}`;
}

function makeCacheKey(user: any) {
  return user?.id ? `reels_cache_${user.id}` : null;
}

function makeSavedPlacesCacheKey(userId: string | number | null | undefined) {
  return userId ? `saved_places_cache_${userId}` : null;
}

function makeGroceryCacheKey(userId: string | number | null | undefined) {
  return userId ? `grocery_list_${userId}` : null;
}

function normalizeContentType(raw: unknown): string {
  const ct = String(raw || '').trim().toLowerCase();

  if (!ct || ct === 'generic' || ct === 'summary') return 'general';
  if (ct === 'tools') return 'products';
  if (ct === 'places') return 'location';

  if (
    [
      'recipe',
      'workout',
      'location',
      'products',
      'software',
      'finance',
      'general',
    ].includes(ct)
  ) {
    return ct;
  }

  return 'general';
}

function normalizeSummary(summaryRaw: unknown): any {
  let summary = summaryRaw ?? {};

  if (typeof summary === 'string') {
    try {
      summary = JSON.parse(summary);
    } catch {
      summary = {};
    }
  }

  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return {};
  }

  return summary;
}

function isJsonDocumentString(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!text || !/^[{[]/.test(text)) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function usableDisplayText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || text === '[object Object]' || isJsonDocumentString(text)) return '';
  return text;
}

function parseJsonDocument(value: unknown): unknown {
  if (typeof value !== 'string' || !isJsonDocumentString(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractDisplayTitle(...values: unknown[]): string {
  const paths = [
    ['english', 'title'],
    ['original', 'title'],
    ['title'],
    ['summary', 'english', 'title'],
    ['summary', 'original', 'title'],
  ];

  for (const value of values) {
    const parsed = parseJsonDocument(value);
    const direct = usableDisplayText(parsed);
    if (direct) return direct;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    for (const path of paths) {
      let current: any = parsed;
      for (const key of path) {
        if (!current || typeof current !== 'object') {
          current = null;
          break;
        }
        current = current[key];
      }
      const text = usableDisplayText(parseJsonDocument(current));
      if (text) return text;
    }
  }

  return '';
}

function normalizeRecipeUserState(raw: any) {
  const source = raw?.recipe_user_state ?? raw?.recipeUserState ?? raw ?? {};
  const cookCount = Number(source?.cookCount ?? source?.cook_count ?? 0);

  return {
    cookCount: Number.isFinite(cookCount) && cookCount > 0 ? cookCount : 0,
    lastCookedAt: source?.lastCookedAt ?? source?.last_cooked_at ?? null,
    hasActiveSession: Boolean(source?.hasActiveSession ?? source?.has_active_session),
    activeSessionId: source?.activeSessionId ?? source?.active_session_id ?? null,
    hasNote: Boolean(source?.hasNote ?? source?.has_note),
    noteUpdatedAt: source?.noteUpdatedAt ?? source?.note_updated_at ?? null,
  };
}

function stripRawForCache(videos: any[]): any[] {
  return (videos || []).map((v) => {
    const { __raw, ...rest } = v || {};
    return rest;
  });
}

function getToken(): string {
  try {
    return (window as any).__REKOLEKT_TOKEN__ ?? localStorage.getItem('auth_token') ?? '';
  } catch {
    return '';
  }
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizePlaceIndex(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getSavedPlaceKey(place: Partial<LocationPlace>): string {
  const vid = String(place._vid || '').trim();
  const idx = normalizePlaceIndex(place._idx);
  if (vid && idx != null) return `${vid}:${idx}`;

  return [
    String(place.id || '').trim().toLowerCase(),
    String(place.name || '').trim().toLowerCase(),
    String(place.city || '').trim().toLowerCase(),
    String(place.country || '').trim().toLowerCase(),
  ].join('|');
}

function normalizeSavedPlaceRow(row: any): LocationPlace {
  const rawIdx =
    row?.place_index ??
    row?._idx ??
    row?.idx ??
    row?.position;

  return {
    id: row?.id != null ? String(row.id) : undefined,
    name: String(row?.name || '').trim(),
    type: row?.type ?? row?.place_type ?? undefined,
    place_type: row?.place_type ?? row?.type ?? undefined,
    city: row?.city ?? undefined,
    region: row?.region ?? undefined,
    country: row?.country ?? undefined,
    address: row?.address ?? undefined,
    neighborhood: row?.neighborhood ?? undefined,
    postal_code: row?.postal_code ?? undefined,
    description: row?.description ?? undefined,
    instagram: row?.instagram ?? row?.instagram_username ?? undefined,
    instagram_username: row?.instagram_username ?? row?.instagram ?? undefined,
    instagram_account_name: row?.instagram_account_name ?? undefined,
    lat: toNumberOrNull(row?.lat),
    lng: toNumberOrNull(row?.lng),
    rank: row?.rank ?? undefined,
    _vid: row?.video_id ? String(row.video_id) : row?._vid ? String(row._vid) : undefined,
    _idx: normalizePlaceIndex(rawIdx) ?? undefined,
  };
}

function normalizeSavedPlacesPayload(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.places)) return data.places;
  if (Array.isArray(data?.saved_places)) return data.saved_places;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = SAVED_PLACES_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

/* ── Provider ────────────────────────────────────────────────────────────── */

const formatVideoDuration = (value: any, fallbackSeconds?: any): string => {
  const raw = value ?? fallbackSeconds;

  if (raw === null || raw === undefined || raw === '') return '';

  const str = String(raw).trim();

  if (/^\d+:\d{2}$/.test(str)) return str;

  const secs = Number(str);
  if (!Number.isFinite(secs) || secs <= 0) return '';

  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);

  return `${m}:${String(s).padStart(2, '0')}`;
};

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id ? String(user.id) : '';

  const [_videos, _setVideos] = useState<Video[]>(() => {
    if (user?.id) {
      const cacheKey = `reels_cache_${user.id}`;
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed)
            ? parsed.map((v: any) => ({
                ...v,
                content_type: normalizeContentType(v?.content_type),
                duration: formatVideoDuration(v?.duration, v?.duration_seconds),
                recipeUserState: v?.recipeUserState
                  ? normalizeRecipeUserState(v.recipeUserState)
                  : v?.recipe_user_state
                    ? normalizeRecipeUserState(v.recipe_user_state)
                    : null,
              }))
            : [];
        } catch {
          return [];
        }
      }
    }
    return [];
  });

  const setVideos = useCallback((updater: React.SetStateAction<Video[]>) => {
    _setVideos((prev) => {
      const next = typeof updater === 'function' ? (updater as any)(prev) : updater;

      try {
        const cacheKey = userId ? `reels_cache_${userId}` : null;
        if (cacheKey) {
          localStorage.setItem(cacheKey, JSON.stringify(stripRawForCache(next)));
        }
      } catch {}

      return next;
    });
  }, [userId]);

  const [folders, setFolders] = useState<Folder[]>(() => {
    try {
      const saved = localStorage.getItem('custom_folders');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState<LocationPlace[]>([]);

  // ── Grocery list state (persisted to localStorage per user) ──────────────
  const [groceryList, setGroceryList] = useState<GroceryItem[]>(() => {
    if (user?.id) {
      try {
        const raw = localStorage.getItem(`grocery_list_${user.id}`);
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return [];
  });

  // Persist grocery list whenever it changes
  useEffect(() => {
    if (!userId) return;
    try {
      localStorage.setItem(`grocery_list_${userId}`, JSON.stringify(groceryList));
    } catch {}
  }, [groceryList, userId]);

  // Load grocery list from localStorage when the user changes
  useEffect(() => {
    if (!userId) {
      setGroceryList([]);
      return;
    }
    try {
      const raw = localStorage.getItem(`grocery_list_${userId}`);
      setGroceryList(raw ? JSON.parse(raw) : []);
    } catch {
      setGroceryList([]);
    }
  }, [userId]);

  const addToGroceryList = useCallback((items: GroceryItem[]) => {
    setGroceryList((prev) => {
      const existingIds = new Set(prev.map((i) => i.id));
      const fresh = items.filter((i) => !existingIds.has(i.id));
      return [...prev, ...fresh];
    });
  }, []);

  const removeFromGroceryList = useCallback((ids: string[]) => {
    const toRemove = new Set(ids);
    setGroceryList(prev => prev.filter(i => !toRemove.has(i.id)));
  }, []);

  const toggleGroceryItem = useCallback((id: string) => {
    setGroceryList((prev) =>
      prev.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)),
    );
  }, []);

  const toggleGroceryHave = useCallback((id: string) => {
    setGroceryList((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, have: !i.have, checked: false } : i,
      ),
    );
  }, []);

  const clearGroceryList = useCallback(() => {
    setGroceryList([]);
  }, []);
  // ────────────────────────────────────────────────────────────────────────

  const savedPlacesLoadedRef = useRef(false);
  const savedPlacesUserRef = useRef<string | null>(null);
  const savedPlacesRef = useRef<LocationPlace[]>([]);

  useEffect(() => {
    savedPlacesRef.current = savedPlaces;
  }, [savedPlaces]);

  const videosRef = useRef<Video[]>([]);
  videosRef.current = _videos;

  useEffect(() => {
    try {
      localStorage.setItem('custom_folders', JSON.stringify(folders));
    } catch {}
  }, [folders]);

  useEffect(() => {
    if (!userId) {
      setVideos([]);
      setSavedPlaces([]);
      savedPlacesRef.current = [];
      savedPlacesLoadedRef.current = false;
      savedPlacesUserRef.current = null;

      try {
        const saved = localStorage.getItem('custom_folders');
        setFolders(saved ? JSON.parse(saved) : []);
      } catch {
        setFolders([]);
      }

      return;
    }

    const cacheKey = makeCacheKey({ id: userId });
    if (cacheKey) {
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setVideos(
              parsed.map((v: any) => ({
                ...v,
                content_type: normalizeContentType(v?.content_type),
                duration: formatVideoDuration(v?.duration, v?.duration_seconds),
                recipeUserState: v?.recipeUserState
                  ? normalizeRecipeUserState(v.recipeUserState)
                  : v?.recipe_user_state
                    ? normalizeRecipeUserState(v.recipe_user_state)
                    : null,
              })),
            );
          }
        }
      } catch {}
    }

    if (savedPlacesUserRef.current !== userId) {
      savedPlacesUserRef.current = userId;
      savedPlacesLoadedRef.current = false;

      const placesCacheKey = makeSavedPlacesCacheKey(userId);
      if (placesCacheKey) {
        try {
          const rawPlaces = localStorage.getItem(placesCacheKey);
          if (rawPlaces) {
            const parsedPlaces = JSON.parse(rawPlaces);
            if (Array.isArray(parsedPlaces)) {
              setSavedPlaces(parsedPlaces.map(normalizeSavedPlaceRow));
            }
          } else {
            setSavedPlaces([]);
          }
        } catch {
          setSavedPlaces([]);
        }
      }
    }
  }, [userId, setVideos]);

  useEffect(() => {
    if (!userId || savedPlacesLoadedRef.current) return;

    savedPlacesLoadedRef.current = true;

    let cancelled = false;
    let retryTimer: number | null = null;

    const loadSavedPlaces = async (attempt = 0) => {
      if (!navigator.onLine) return;

      const token = getToken();
      const headers = {
        ...getAuthHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      try {
        const response = await fetchWithTimeout(joinUrl(API_BASE, SAVED_PLACES_PATH), {
          method: 'GET',
          headers,
          credentials: 'include',
          cache: 'no-store',
        });

        if (cancelled) return;

        if (response.status === 401) {
          localStorage.removeItem('auth_token');
          setSavedPlaces([]);
          return;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json().catch(() => []);
        const rows = normalizeSavedPlacesPayload(data);
        const normalized = rows.map(normalizeSavedPlaceRow);

        setSavedPlaces(normalized);

        const cacheKey = makeSavedPlacesCacheKey(userId);
        if (cacheKey) {
          try {
            localStorage.setItem(cacheKey, JSON.stringify(normalized));
          } catch {}
        }
      } catch (err) {
        if (cancelled) return;

        if (attempt === 0 && navigator.onLine) {
          retryTimer = window.setTimeout(() => {
            loadSavedPlaces(1);
          }, 900);
          return;
        }

        console.warn('Failed to load saved places:', err);
      }
    };

    loadSavedPlaces();

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [userId]);

  const toggleSavedPlace = useCallback(
    async (place: LocationPlace) => {
      const videoId = String(place._vid || '').trim();
      const placeIndex = normalizePlaceIndex(place._idx);

      if (!videoId || placeIndex == null) {
        console.warn('toggleSavedPlace: place missing _vid or _idx', place);
        return;
      }

      const normalizedPlace: LocationPlace = {
        ...place,
        _vid: videoId,
        _idx: placeIndex,
        lat: toNumberOrNull(place.lat),
        lng: toNumberOrNull(place.lng),
        type: place.type ?? place.place_type ?? undefined,
        place_type: place.place_type ?? place.type ?? undefined,
        instagram: place.instagram ?? place.instagram_username ?? undefined,
        instagram_username: place.instagram_username ?? place.instagram ?? undefined,
      };

      const targetKey = getSavedPlaceKey(normalizedPlace);
      const wasSaved = savedPlacesRef.current.some((p) => getSavedPlaceKey(p) === targetKey);

      setSavedPlaces((prev) =>
        wasSaved
          ? prev.filter((p) => getSavedPlaceKey(p) !== targetKey)
          : [...prev, normalizedPlace],
      );

      const token = getToken();

      try {
        const res = await fetch(joinUrl(API_BASE, SAVED_PLACES_PATH), {
          method: wasSaved ? 'DELETE' : 'POST',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify(
            wasSaved
              ? {
                  video_id: videoId,
                  place_index: placeIndex,
                }
              : {
                  video_id: videoId,
                  place_index: placeIndex,
                  name: normalizedPlace.name,
                  type: normalizedPlace.type ?? null,
                  city: normalizedPlace.city ?? null,
                  region: normalizedPlace.region ?? null,
                  country: normalizedPlace.country ?? null,
                  address: normalizedPlace.address ?? null,
                  neighborhood: normalizedPlace.neighborhood ?? null,
                  postal_code: normalizedPlace.postal_code ?? null,
                  description: normalizedPlace.description ?? null,
                  instagram: normalizedPlace.instagram ?? null,
                  instagram_username: normalizedPlace.instagram_username ?? null,
                  instagram_account_name: normalizedPlace.instagram_account_name ?? null,
                  lat: normalizedPlace.lat ?? null,
                  lng: normalizedPlace.lng ?? null,
                  rank: normalizedPlace.rank ?? null,
                },
          ),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        if (!wasSaved) {
          const data = await res.json().catch(() => null);
          if (data && typeof data === 'object') {
            const savedRow = normalizeSavedPlaceRow({
              ...normalizedPlace,
              ...data,
              video_id: videoId,
              place_index: placeIndex,
            });

            setSavedPlaces((prev) => {
              const next = prev.filter((p) => getSavedPlaceKey(p) !== targetKey);
              return [...next, savedRow];
            });
          }
        }

        const cacheKey = makeSavedPlacesCacheKey(userId);
        if (cacheKey) {
          window.setTimeout(() => {
            try {
              localStorage.setItem(
                cacheKey,
                JSON.stringify(savedPlacesRef.current),
              );
            } catch {}
          }, 0);
        }
      } catch (err) {
        console.error('toggleSavedPlace failed:', err);

        setSavedPlaces((prev) =>
          wasSaved
            ? [...prev, normalizedPlace]
            : prev.filter((p) => getSavedPlaceKey(p) !== targetKey),
        );
      }
    },
    [userId],
  );

  const fetchVideos = useCallback(async () => {
    if (!userId) return;

    if (!navigator.onLine) {
      console.log('Offline: Skipping fetchVideos');
      setIsLoading(false);
      return;
    }

    const now = Date.now();
    if (now - globalLastFetchTime < 2000 || isFetchingGlobal) return;

    globalLastFetchTime = now;
    isFetchingGlobal = true;
    setIsLoading(true);

    try {
      const url = joinUrl(API_BASE, `${SAVED_REELS_PATH}?page=1&per_page=500&view=list&t=${now}`);

      const response = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();

        const loadedVideos: Video[] = (data?.reels || []).map((r: any) => {
          const summary = normalizeSummary(r.summary);

          const hydratedSummary = {
            ...(summary || {}),
            category: r.summary_category || summary?.category || '',
            topic: r.summary_topic || summary?.topic || summary?.theme || '',
          };

          const status = String(r.status || '');
          const isDone = status === 'done' || status === 'completed';
          const isFailed = status === 'failed' || status === 'error';

          let finalCategory = hydratedSummary.category || '';
          if (!isDone && !isFailed) finalCategory = 'Processing';
          if (isFailed) finalCategory = 'Failed';

          let displayTitle = 'Processing...';
          if (isDone) {
            displayTitle =
              extractDisplayTitle(summary, r.summary_title, r.title) ||
              'Untitled';
          } else if (isFailed) {
            displayTitle = 'Processing Failed';
          }

          const transcriptText =
            (typeof r.transcription === 'string' ? r.transcription : '') ||
            r.transcription?.transcript ||
            r.transcript ||
            '';

          const rawFolderId = r.folder_id || 'unsorted';
          const normalizedFolderId =
            rawFolderId === 'default' || rawFolderId === 'all' ? 'unsorted' : rawFolderId;

          const sourceUrl = String(r.source_url || '');
          const platform =
            r.platform ||
            (sourceUrl.includes('facebook.com') || sourceUrl.includes('fb.com')
              ? 'facebook'
              : sourceUrl.includes('tiktok.com')
                ? 'tiktok'
                : sourceUrl.includes('youtube.com') || sourceUrl.includes('youtu.be')
                  ? 'youtube'
                  : 'instagram');

          return {
            id: r.id,
            title: displayTitle,
            author: r.author_name || r.author || 'Unknown',
            platform,
            thumbnailUrl: r.thumbnailUrl || r.thumbnail_url || '',
            duration: formatVideoDuration(r.duration, r.duration_seconds),
            savedAt: r.created_at,
            updated_at: r.updated_at,
            category: finalCategory,
            topic: hydratedSummary.topic || '',
            subCategory: hydratedSummary.topic || '',
            tags: hydratedSummary.hashtags || [],
            summary: hydratedSummary,
            summary_category: r.summary_category || hydratedSummary.category || '',
            summary_topic: r.summary_topic || hydratedSummary.topic || '',
            summary_title: extractDisplayTitle(r.summary_title, summary) || displayTitle,
            transcript: transcriptText,
            transcription: null,
            originalUrl: sourceUrl,
            sourceUrl,
            isFavorite: r.is_favorite,
            folderId: normalizedFolderId,
            content_type: normalizeContentType(r.content_type),
            list_subtype: r.list_subtype,
            recipe: null,
            tools_list: null,
            workout: null,
            location: null,
            status: r.status,
            errorMessage: r.error_message || null,
            recipeUserState: normalizeRecipeUserState(r.recipe_user_state),
            recipe_user_state: normalizeRecipeUserState(r.recipe_user_state),
          } as any as Video;
        });

        setVideos((prevVideos) => {
          const loadedById = new Map(loadedVideos.map((v: any) => [v.id, v]));
          const loadedByUrl = new Map(loadedVideos.map((v: any) => [v.originalUrl, v]));

          const optimisticOnly = (prevVideos || []).filter((v: any) => {
            if (!v?.id) return false;
            if (v.category !== 'Processing') return false;
            if (loadedById.has(v.id)) return false;
            if (v.originalUrl && loadedByUrl.has(v.originalUrl)) return false;
            return true;
          });

          const finalVideos = [...optimisticOnly, ...loadedVideos];

          const uniqueById = new Map<string, Video>();
          for (const v of finalVideos as any[]) {
            if (v?.id) uniqueById.set(v.id, v);
          }

          const result = Array.from(uniqueById.values());

          let changed = prevVideos.length !== result.length;
          if (!changed) {
            const prevById = new Map<string, any>(prevVideos.map((v) => [v.id, v]));
            for (const v of result as any[]) {
              const prev = prevById.get(v.id) as any;
              if (
                !prev ||
                prev.status !== v.status ||
                prev.category !== v.category ||
                prev.folderId !== v.folderId ||
                prev.thumbnailUrl !== v.thumbnailUrl ||
                prev.content_type !== v.content_type ||
                JSON.stringify((prev as any).recipeUserState || null) !== JSON.stringify((v as any).recipeUserState || null)
              ) {
                changed = true;
                break;
              }
            }
          }

          if (!changed) return prevVideos;
          return result;
        });

        return;
      }

      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        return;
      }

      console.error('fetchVideos failed:', response.status, response.statusText);
    } catch (err) {
      console.error('fetchVideos error:', err);
    } finally {
      isFetchingGlobal = false;
      setIsLoading(false);
    }
  }, [userId, setVideos]);

  const refreshFolders = useCallback(async () => {
    if (!userId) return;
    if (!navigator.onLine) return;

    try {
      const response = await fetch(joinUrl(API_BASE, '/api/folders'), {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (!response.ok) return;

      const data = await response.json();
      setFolders(data?.folders || []);
    } catch (error) {
      console.error('Failed to refresh folders', error);
    }
  }, [userId]);

  const initRef = useRef(false);

  useEffect(() => {
    if (!userId) {
      initRef.current = false;
      return;
    }

    if (!initRef.current) {
      initRef.current = true;
      refreshFolders();
      globalLastFetchTime = 0;
      fetchVideos();
    }
  }, [userId, refreshFolders, fetchVideos]);

  useEffect(() => {
    if (!userId) return;

    const interval = window.setInterval(() => {
      const currentVideos = videosRef.current;
      const hasProcessing = currentVideos.some((v: any) => v?.category === 'Processing');

      if (hasProcessing && !isFetchingGlobal) {
        fetchVideos();
      }
    }, 10000);

    return () => window.clearInterval(interval);
  }, [userId, fetchVideos]);

  const addVideo = useCallback(
    async (url: string, forceRetry: boolean = false): Promise<AddVideoResult> => {
      if (!navigator.onLine) throw new Error('You are offline.');

      const cleanUrl = (url || '').trim();
      const currentVideos = videosRef.current;
      const existing = currentVideos.find((v: any) => v.originalUrl === cleanUrl);

      if (!forceRetry && existing && existing.status === 'done') {
        throw new Error('already been saved');
      }

      const payload = { url: cleanUrl, force_retry: forceRetry ? 'true' : 'false' };

      const response = await fetch(joinUrl(API_BASE, '/api/summarize'), {
        method: 'POST',
        body: JSON.stringify(payload),
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      });

      let result: any = null;
      try {
        result = await response.json();
      } catch {}

      if (result?.duplicate && result?.code === 'duplicate_reel') {
        throw new DuplicateReelError(result as DuplicateReelResponse);
      }

      if (response.status === 409) throw new Error('This video has already been saved.');
      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        throw new Error('Not authenticated. Please log in again.');
      }

      if (!response.ok) {
        const message =
          result?.message ||
          (result?.error === 'extraction_limit_reached'
            ? "Lots of people are using Recolekt right now. Please try again in a few hours."
            : null) ||
          (result?.error === 'unsupported_platform'
            ? 'Only Instagram, Facebook, YouTube, and TikTok URLs are supported.'
            : null) ||
          'Failed to import video.';

        throw new Error(message);
      }

      if (
        result?.status === 'done' ||
        result?.status === 'completed' ||
        (result?.message && result.message.toLowerCase().includes('already exists'))
      ) {
        throw new Error('already been saved');
      }

      const createdAt = new Date().toISOString();
      const videoId =
        result?.reel_id || `temp_${cleanUrl.split('/').pop()}_${Date.now()}`;

      const platform =
        cleanUrl.includes('facebook.com') || cleanUrl.includes('fb.com')
          ? 'facebook'
          : cleanUrl.includes('tiktok.com')
            ? 'tiktok'
            : cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')
              ? 'youtube'
              : 'instagram';

      const newVideo: any = {
        id: videoId,
        title: 'Processing...',
        author: result?.author_name || 'Unknown',
        platform,
        thumbnailUrl: result?.preview_url ?? '',
        duration: '',
        savedAt: createdAt,
        category: 'Processing',
        tags: [],
        summary: {},
        transcript: '',
        transcription: null,
        originalUrl: cleanUrl,
        isFavorite: false,
        folderId: 'unsorted',
        status: 'processing',
        errorMessage: null,
        content_type: 'general',
      };

      setVideos((prev) => [
        newVideo,
        ...(prev || []).filter((v: any) => v.originalUrl !== cleanUrl),
      ]);

      window.setTimeout(() => {
        globalLastFetchTime = 0;
        fetchVideos();
      }, 5000);

      return {
        clientTempId: `temp_${Date.now()}`,
        processId: videoId,
        status: 'processing',
        sourceUrl: cleanUrl,
        createdAt,
        previewUrl: result?.preview_url ?? null,
      };
    },
    [fetchVideos, setVideos],
  );

  const moveVideos = useCallback(
    async (videoIds: string[], targetFolderId: string) => {
      setVideos((prev) =>
        prev.map((v: any) =>
          videoIds.includes(v.id) ? { ...v, folderId: targetFolderId } : v,
        ),
      );

      if (!navigator.onLine) return;

      try {
        await Promise.all(
          videoIds.map(async (id) => {
            const url = joinUrl(API_BASE, `/api/update/${encodeURIComponent(String(id))}`);
            await fetch(url, {
              method: 'PUT',
              credentials: 'include',
              headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
              body: JSON.stringify({ folder_id: targetFolderId }),
            });
          }),
        );
      } catch (error) {
        console.error('Failed to save move to DB:', error);
        fetchVideos();
      }
    },
    [setVideos, fetchVideos],
  );

  const toggleFavorite = useCallback(
    async (videoId: string) => {
      const video = videosRef.current.find((v) => v.id === videoId);
      if (!video) return;

      const newFav = !video.isFavorite;

      setVideos((prev) =>
        prev.map((v: any) => (v.id === videoId ? { ...v, isFavorite: newFav } : v)),
      );

      if (!navigator.onLine) return;

      try {
        const url = joinUrl(API_BASE, `/api/update/${encodeURIComponent(String(videoId))}`);
        await fetch(url, {
          method: 'PUT',
          credentials: 'include',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_favorite: newFav }),
        });
      } catch {
        fetchVideos();
      }
    },
    [setVideos, fetchVideos],
  );

  const updateVideo = useCallback(
    async (id: string, updates: any) => {
      const normalizedUpdates = {
        ...updates,
        ...(updates?.content_type ? { content_type: normalizeContentType(updates.content_type) } : {}),
      };

      setVideos((prev) =>
        prev.map((v) => (v.id === id ? { ...v, ...normalizedUpdates } : v)),
      );

      if (!navigator.onLine) return;

      try {
        const url = joinUrl(API_BASE, `/api/update/${encodeURIComponent(String(id))}`);
        await fetch(url, {
          method: 'PUT',
          credentials: 'include',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
      } catch {
        fetchVideos();
      }
    },
    [setVideos, fetchVideos],
  );

  const deleteVideos = useCallback(
    async (videoIds: string[]): Promise<void> => {
      if (!videoIds?.length) return;

      setVideos((prev) => {
        const idsToDelete = new Set(videoIds);
        return (prev || []).filter((v: any) => !idsToDelete.has(v.id));
      });

      if (!navigator.onLine) return;

      try {
        await Promise.all(
          videoIds.map(async (id) => {
            const url = joinUrl(API_BASE, `/api/reel/${encodeURIComponent(String(id))}`);
            await fetch(url, {
              method: 'DELETE',
              credentials: 'include',
              headers: getAuthHeaders(),
            });
          }),
        );
      } catch {
        fetchVideos();
      }
    },
    [setVideos, fetchVideos],
  );

  const refreshVideo = useCallback(
    async (videoId: string): Promise<void> => {
      if (!videoId) throw new Error('Missing video id.');
      if (!navigator.onLine) throw new Error('You are offline.');

      setVideos((prev) =>
        prev.map((v: any) =>
          v.id === videoId
            ? { ...v, status: 'processing', category: 'Processing', errorMessage: null }
            : v,
        ),
      );

      const res = await fetch(joinUrl(API_BASE, `/api/reels/${encodeURIComponent(String(videoId))}/refresh`), {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      });

      let payload: any = null;
      try {
        payload = await res.json();
      } catch {}

      if (res.status === 401) {
        localStorage.removeItem('auth_token');
        throw new Error('Not authenticated. Please log in again.');
      }

      if (!res.ok) {
        fetchVideos();
        throw new Error(payload?.message || payload?.error || 'Failed to refresh video.');
      }

      window.setTimeout(() => {
        globalLastFetchTime = 0;
        fetchVideos();
      }, 1000);
    },
    [setVideos, fetchVideos],
  );

  const hydrateVideo = useCallback((videoId: string, hydrated: any) => {
    if (!videoId || !hydrated) return;

    setVideos((prev) => {
      const existingIndex = (prev || []).findIndex(
        (v: any) => v.id === videoId || v.process_id === videoId || v.processId === videoId,
      );

      if (existingIndex < 0) return prev;

      const next = [...prev];
      const existing: any = next[existingIndex];
      next[existingIndex] = {
        ...existing,
        ...hydrated,
        id: existing.id || hydrated.id || hydrated.process_id || videoId,
        process_id: hydrated.process_id || hydrated.id || existing.process_id || videoId,
        isFavorite: hydrated.isFavorite ?? hydrated.is_favorite ?? existing.isFavorite,
        folderId: hydrated.folderId ?? hydrated.folder_id ?? existing.folderId,
        thumbnailUrl: hydrated.thumbnailUrl ?? existing.thumbnailUrl,
        recipeUserState: hydrated.recipeUserState ?? hydrated.recipe_user_state ?? existing.recipeUserState,
        recipe_user_state: hydrated.recipe_user_state ?? hydrated.recipeUserState ?? existing.recipe_user_state,
      } as any;

      return next as Video[];
    });
  }, [setVideos]);

  const addFolder = useCallback(
    async (name: string, parentId: string | null = null) => {
      if (!navigator.onLine) throw new Error('Offline');

      const res = await fetch(joinUrl(API_BASE, '/api/folders'), {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parent_id: parentId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create folder');
      }

      await refreshFolders();
    },
    [refreshFolders],
  );

  const updateFolder = useCallback(
    async (id: string, name: string, parentId?: string | null) => {
      if (!navigator.onLine) throw new Error('Offline');

      const body: any = { name };
      if (parentId !== undefined) body.parent_id = parentId;

      const res = await fetch(joinUrl(API_BASE, `/api/folders/${id}`), {
        method: 'PUT',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update folder');
      }

      await refreshFolders();
    },
    [refreshFolders],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      setVideos((prev) =>
        prev.map((v: any) => (v.folderId === id ? { ...v, folderId: 'unsorted' } : v)),
      );

      if (!navigator.onLine) return;

      try {
        const res = await fetch(joinUrl(API_BASE, `/api/folders/${id}`), {
          method: 'DELETE',
          credentials: 'include',
          headers: getAuthHeaders(),
        });

        if (res.ok) {
          await refreshFolders();
          fetchVideos();
        } else {
          fetchVideos();
          await refreshFolders();
        }
      } catch (error) {
        console.error('Folder deletion failed:', error);
        fetchVideos();
        await refreshFolders();
      }
    },
    [refreshFolders, fetchVideos, setVideos],
  );

  const refreshVideos = useCallback(async () => {
    fetchVideos();
  }, [fetchVideos]);

  const getVideoById = useCallback((id: string): Video | undefined => {
    if (!id) return undefined;

    const vids = videosRef.current || [];

    return (
      vids.find((v) => v.id === id) ||
      vids.find(
        (v) => (v as any).processId === id || (v as any).process_id === id,
      )
    );
  }, []);

  const value = useMemo<DataContextType>(
    () => ({
      videos: _videos,
      folders,
      isLoading,
      savedPlaces,
      toggleSavedPlace,
      addFolder,
      updateFolder,
      deleteFolder,
      toggleFavorite,
      moveVideos,
      updateVideo,
      deleteVideos,
      addVideo,
      refreshVideo,
      hydrateVideo,
      refreshVideos,
      refreshFolders,
      getVideoById,
      // Grocery list
      groceryList,
      addToGroceryList,
      toggleGroceryItem,
      toggleGroceryHave,
      clearGroceryList,
      removeFromGroceryList,
    }),
    [
      _videos,
      folders,
      isLoading,
      savedPlaces,
      toggleSavedPlace,
      addFolder,
      updateFolder,
      deleteFolder,
      toggleFavorite,
      moveVideos,
      updateVideo,
      deleteVideos,
      addVideo,
      refreshVideo,
      hydrateVideo,
      refreshVideos,
      refreshFolders,
      getVideoById,
      groceryList,
      addToGroceryList,
      toggleGroceryItem,
      toggleGroceryHave,
      clearGroceryList,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within a DataProvider');
  return ctx;
};
