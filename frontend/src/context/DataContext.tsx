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

export type AddVideoResult = {
  clientTempId: string;
  processId: string;
  status: string;
  sourceUrl: string;
  createdAt: string;
  previewUrl?: string | null;
};

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
  refreshVideos: () => Promise<void>;
  refreshFolders: () => Promise<void>;
  getVideoById: (id: string) => Video | undefined;
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
      const url = joinUrl(API_BASE, `${SAVED_REELS_PATH}?page=1&per_page=100&view=list&t=${now}`);

      const response = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();

        const loadedVideos: Video[] = (data?.reels || []).map((r: any) => {
          const summary = normalizeSummary(r.summary);
          const status = String(r.status || '');
          const isDone = status === 'done' || status === 'completed';
          const isFailed = status === 'failed' || status === 'error';

          let finalCategory = summary?.category || 'General';
          if (!isDone && !isFailed) finalCategory = 'Processing';
          if (isFailed) finalCategory = 'Failed';

          let displayTitle = 'Processing...';
          if (isDone) {
            if (summary?.english?.title) {
              displayTitle = summary.english.title;
            } else if (typeof summary?.title === 'string' && summary.title !== 'Processing...') {
              displayTitle = summary.title;
            } else if (r.summary_title && typeof r.summary_title === 'string') {
              displayTitle = r.summary_title;
            } else if (r.caption) {
              displayTitle = r.caption.slice(0, 50) || 'Untitled';
            } else {
              displayTitle = 'Untitled';
            }
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
            sourceUrl.includes('facebook.com') || sourceUrl.includes('fb.com')
              ? 'facebook'
              : sourceUrl.includes('tiktok.com')
                ? 'tiktok'
                : sourceUrl.includes('youtube.com') || sourceUrl.includes('youtu.be')
                  ? 'youtube'
                  : 'instagram';

          return {
            id: r.id,
            title: displayTitle,
            author: r.author_name || r.author || 'Unknown',
            platform,
            thumbnailUrl: r.gcs_urls?.preview_thumbnail || '',
            duration: r.duration || '',
            savedAt: r.created_at,
            category: finalCategory,
            topic: summary?.topic || summary?.theme || '',
            tags: summary?.hashtags || [],
            summary,
            transcript: transcriptText,
            transcription: r.transcription,
            originalUrl: sourceUrl,
            isFavorite: r.is_favorite,
            folderId: normalizedFolderId,
            content_type: normalizeContentType(r.content_type),
            recipe: r.recipe,
            tools_list: r.tools_list,
            workout: r.workout,
            location: r.location,
            status: r.status,
            errorMessage: r.error_message || null,
            __raw: r,
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
                prev.content_type !== v.content_type
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

      const cleanUrl = (url || '').trim().split('?')[0];
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

      if (response.status === 409) throw new Error('This video has already been saved.');
      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        throw new Error('Not authenticated. Please log in again.');
      }

      let result: any = null;
      try {
        result = await response.json();
      } catch {}

      if (!response.ok) throw new Error(result?.error || 'Failed to import video.');

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
      refreshVideos,
      refreshFolders,
      getVideoById,
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
      refreshVideos,
      refreshFolders,
      getVideoById,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within a DataProvider');
  return ctx;
};