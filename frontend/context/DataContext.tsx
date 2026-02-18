import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { Video, Folder } from '../types';
import { useAuth, getAuthHeaders } from './AuthContext';

interface User {
  id: string;
  name: string;
  email: string;
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

  addFolder: (name: string, parentId?: string | null) => void;
  updateFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;

  toggleFavorite: (videoId: string) => void;
  moveVideos: (videoIds: string[], targetFolderId: string) => void;

  deleteVideos: (videoIds: string[]) => Promise<void>;
  addVideo: (url: string) => Promise<AddVideoResult>;

  refreshVideos: () => Promise<void>;
  refreshFolders: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const RAW_API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:5001';

const API_BASE = String(RAW_API_BASE).replace(/\/+$/, '');
const isDev = Boolean((import.meta as any).env?.DEV);

const LAST_CACHE_KEY_STORAGE = 'reels_cache_last_key';
const CUSTOM_FOLDERS_STORAGE = 'custom_folders';

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  return `${b}/${p}`;
}

function makeCacheKey(user: User | null | undefined) {
  return user ? `reels_cache_${user.id}` : null;
}

function stripRawForCache(videos: any[]): any[] {
  return (videos || []).map((v) => {
    const { __raw, ...rest } = v || {};
    return rest;
  });
}

type FetchVideosOptions = {
  perPage?: number;
  silent?: boolean;
};

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [videos, setVideos] = useState<Video[]>([]);
  const [folders, setFolders] = useState<Folder[]>(() => {
    const saved = localStorage.getItem(CUSTOM_FOLDERS_STORAGE);
    return saved ? JSON.parse(saved) : [];
  });

  // Keep the old flag (some UI relies on it), but we only set it true when *any* cache is used.
  const [hydratedFromCache, setHydratedFromCache] = useState(false);

  // Loading is now only for true cold-start (no cache + no videos).
  const [isLoading, setIsLoading] = useState(false);

  const fetchInFlightRef = useRef(false);
  const pendingFetchRef = useRef<FetchVideosOptions | null>(null);

  // 1) Instant “pre-auth” hydration from the last cache key (near-instant paint)
  useEffect(() => {
    try {
      const lastKey = localStorage.getItem(LAST_CACHE_KEY_STORAGE);
      if (!lastKey) return;

      const raw = localStorage.getItem(lastKey);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (isDev) console.log('⚡ Instant hydrate from last cache:', parsed.length, lastKey);
        setVideos(parsed);
        setHydratedFromCache(true);
      }
    } catch (e) {
      if (isDev) console.warn('⚠️ Failed pre-auth cache hydrate:', e);
    }
  }, []);

  // Persist folders
  useEffect(() => {
    localStorage.setItem(CUSTOM_FOLDERS_STORAGE, JSON.stringify(folders));
  }, [folders]);

  // 2) Hydrate from the *current user* cache as soon as we know user
  useEffect(() => {
    if (!user) return;

    const cacheKey = makeCacheKey(user as any);
    if (!cacheKey) return;

    try {
      localStorage.setItem(LAST_CACHE_KEY_STORAGE, cacheKey);

      const raw = localStorage.getItem(cacheKey);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (isDev) console.log('💾 Hydrating videos from user cache:', parsed.length);
        setVideos(parsed);
        setHydratedFromCache(true);
      }
    } catch (e) {
      console.error('❌ Failed to read reels cache:', e);
    }
  }, [user]);

  const mapBackendReelToVideo = (r: any): Video => {
    const summary = r.summary || {};
    const isDone = r.status === 'done' || r.status === 'completed';
    const isFailed = r.status === 'failed';

    let finalCategory = summary.category || 'General';
    if (!isDone && !isFailed) finalCategory = 'Processing';
    else if (isFailed) finalCategory = 'Failed';

    let displayTitle = 'Processing...';
    if (isDone) {
      if (typeof summary.title === 'object' && summary.title?.english) {
        displayTitle = summary.title.english;
      } else if (typeof summary.title === 'string' && summary.title !== 'Processing...') {
        displayTitle = summary.title;
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

    const mapped: any = {
      id: r.id,
      title: displayTitle,
      author: r.author_name || r.author || 'Instagram User',
      platform: 'instagram',
      thumbnailUrl: r.gcs_urls?.preview_thumbnail || '',
      duration: r.duration || '',
      savedAt: r.created_at,
      category: finalCategory,
      tags: summary.hashtags || [],
      summary,
      transcript: transcriptText,
      transcription: r.transcription,
      originalUrl: r.source_url,
      isFavorite: r.is_favorite,
      folderId: r.folder_id || 'default',
      content_type: r.content_type,
      recipe: r.recipe,
      workout: r.workout,
      status: r.status,
      errorMessage: r.error_message || null,
      __raw: r,
    };

    return mapped as Video;
  };

  const writeUserCache = (next: Video[]) => {
    if (!user) return;
    try {
      const cacheKey = makeCacheKey(user as any);
      if (!cacheKey) return;

      localStorage.setItem(LAST_CACHE_KEY_STORAGE, cacheKey);
      localStorage.setItem(cacheKey, JSON.stringify(stripRawForCache(next as any)));
    } catch (e) {
      console.error('❌ Failed to write reels cache:', e);
    }
  };

  const fetchVideos = async (opts: FetchVideosOptions = {}): Promise<void> => {
    if (!user) return;

    // If in flight, queue the latest request (so "fast then full" works)
    if (fetchInFlightRef.current) {
      pendingFetchRef.current = opts;
      return;
    }

    fetchInFlightRef.current = true;

    const perPage = typeof opts.perPage === 'number' ? opts.perPage : 100;
    const silent = Boolean(opts.silent);

    const shouldBlockUI =
      !silent && videos.length === 0 && !hydratedFromCache;

    if (shouldBlockUI) setIsLoading(true);

    try {
      const url = joinUrl(
        API_BASE,
        `/api/saved_reels?page=1&per_page=${encodeURIComponent(String(perPage))}&view=list`,
      );

      const response = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
        headers: {
          ...getAuthHeaders(),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const loadedVideos: Video[] = (data.reels || []).map(mapBackendReelToVideo);

        setVideos((prevVideos) => {
          const loadedByUrl = new Map(loadedVideos.map((v) => [v.originalUrl, v]));
          const loadedById = new Map(loadedVideos.map((v) => [v.id, v]));

          const loadedByShortcode = new Map<string, Video>();
          loadedVideos.forEach((v) => {
            const shortcode = String(v.id || '').split('--')[0].split('_')[0];
            if (shortcode && !loadedByShortcode.has(shortcode)) loadedByShortcode.set(shortcode, v);
          });

          // Keep optimistic Processing items not yet returned
          const seenIds = new Set<string>();
          const optimisticOnly = prevVideos.filter((v) => {
            if (!v?.id) return false;
            if (seenIds.has(v.id)) return false;
            seenIds.add(v.id);

            if (v.category !== 'Processing') return false;

            const shortcode = String(v.id || '').split('--')[0].split('_')[0];
            if (loadedById.has(v.id)) return false;
            if (v.originalUrl && loadedByUrl.has(v.originalUrl)) return false;
            if (shortcode && loadedByShortcode.has(shortcode)) return false;

            return true;
          });

          const finalVideos = [...optimisticOnly, ...loadedVideos];
          const uniqueById = new Map(finalVideos.map((v) => [v.id, v]));
          const result = Array.from(uniqueById.values());

          writeUserCache(result);
          return result;
        });
      } else if (response.status === 401) {
        localStorage.removeItem('auth_token');
      }
    } catch (e) {
      console.error('❌ Failed to load gallery:', e);
    } finally {
      if (shouldBlockUI) setIsLoading(false);
      fetchInFlightRef.current = false;

      // Run queued request (latest wins)
      if (pendingFetchRef.current) {
        const next = pendingFetchRef.current;
        pendingFetchRef.current = null;
        void fetchVideos(next);
      }
    }
  };

  const refreshFolders = async (): Promise<void> => {
    if (!user) return;

    try {
      const url = joinUrl(API_BASE, '/api/folders');
      const response = await fetch(url, {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('auth_token');
          throw new Error('Authentication required');
        }
        throw new Error(`Failed to fetch folders: ${response.status}`);
      }

      const data = await response.json();
      const fetchedFolders: Folder[] = data.folders || [];

      setFolders((prevFolders) => {
        const merged = [...prevFolders];
        fetchedFolders.forEach((backendFolder) => {
          const exists = merged.find((f) => f.id === backendFolder.id);
          if (!exists) merged.push(backendFolder);
        });
        return merged;
      });
    } catch (e) {
      console.error('❌ DataContext: Error fetching folders:', e);
    }
  };

  const cleanupStuckReels = async (): Promise<void> => {
    if (!user) return;
    try {
      const url = joinUrl(API_BASE, '/api/cleanup/stuck-reels');
      await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      // no refetch here; keep startup path minimal
    } catch (e) {
      if (isDev) console.warn('⚠️ cleanupStuckReels failed:', e);
    }
  };

  // 3) Make initial load “fast-first”, then “full” in background
  useEffect(() => {
    if (!user) return;

    refreshFolders();
    cleanupStuckReels();

    // Fast list first (smaller payload)
    void fetchVideos({ perPage: 25, silent: videos.length > 0 || hydratedFromCache });

    // Then full refresh in background
    window.setTimeout(() => {
      void fetchVideos({ perPage: 100, silent: true });
    }, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Refresh while processing reels exist (background)
  useEffect(() => {
    if (!user) return;

    const interval = window.setInterval(() => {
      const hasProcessing = videos.some((v) => v.category === 'Processing');
      if (hasProcessing) {
        void fetchVideos({ perPage: 100, silent: true });
      }
    }, 10000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, videos]);

  const addVideo = async (url: string): Promise<AddVideoResult> => {
    if (!user) throw new Error('Not authenticated');

    const cleanUrl = url.trim().split('?')[0];
    const existingVideo = videos.find((v) => v.originalUrl === cleanUrl);

    if (existingVideo) {
      return {
        clientTempId: existingVideo.id,
        processId: existingVideo.id,
        status: existingVideo.category === 'Processing' ? 'processing' : 'done',
        sourceUrl: cleanUrl,
        createdAt: existingVideo.savedAt,
        previewUrl: existingVideo.thumbnailUrl,
      };
    }

    const formData = new FormData();
    formData.append('url', cleanUrl);

    const response = await fetch(joinUrl(API_BASE, '/api/summarize'), {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: getAuthHeaders(),
    });

    if (response.status === 409) throw new Error('This video has already been saved.');
    if (response.status === 401) {
      localStorage.removeItem('auth_token');
      throw new Error('Not authenticated');
    }

    let result: any = null;
    try {
      result = await response.json();
    } catch {
      // ignore
    }

    if (!response.ok) {
      throw new Error(result?.error || 'Failed to import video.');
    }

    const createdAt = new Date().toISOString();
    const videoId =
      result?.reel_id || `temp_${cleanUrl.split('/').pop()}_${Date.now()}`;

    const newVideo: Video = {
      id: videoId,
      title: 'Processing...',
      author: result?.author_name || 'Instagram User',
      platform: 'instagram',
      thumbnailUrl: result?.preview_url ?? '',
      duration: '',
      savedAt: createdAt,
      category: 'Processing',
      tags: [],
      summary: {},
      transcript: '',
      originalUrl: cleanUrl,
      isFavorite: false,
      folderId: 'default',
      status: 'processing',
    };

    setVideos((prev) => {
      const filtered = prev.filter((v) => v.originalUrl !== cleanUrl);
      const merged = [newVideo, ...filtered];
      writeUserCache(merged);
      return merged;
    });

    window.setTimeout(() => void fetchVideos({ perPage: 100, silent: true }), 2000);

    return {
      clientTempId: `temp_${Date.now()}`,
      processId: videoId,
      status: 'processing',
      sourceUrl: cleanUrl,
      createdAt,
      previewUrl: result?.preview_url,
    };
  };

  const deleteVideos = async (videoIds: string[]): Promise<void> => {
    if (!user) throw new Error('Not authenticated');
    if (!videoIds.length) return;

    const before = videos;

    // Optimistic
    setVideos((prev) => {
      const idsToDelete = new Set(videoIds);
      const filtered = prev.filter((v: any) => {
        const raw = v.__raw || {};
        const processId = raw.process_id;
        const matchById = idsToDelete.has(v.id);
        const matchByProcessId = processId && idsToDelete.has(processId);
        return !(matchById || matchByProcessId);
      });
      writeUserCache(filtered);
      return filtered;
    });

    try {
      await Promise.all(
        videoIds.map(async (videoId) => {
          const encodedId = encodeURIComponent(videoId);
          const url = joinUrl(API_BASE, `/api/reel/${encodedId}`);

          const response = await fetch(url, {
            method: 'DELETE',
            credentials: 'include',
            headers: getAuthHeaders(),
          });

          if (response.status === 401) {
            localStorage.removeItem('auth_token');
            throw new Error('Not authenticated');
          }

          if (response.status === 404) return;
          if (!response.ok) throw new Error(`Delete failed for ${videoId}: ${response.status}`);
        }),
      );

      await fetchVideos({ perPage: 100, silent: true });
    } catch (e) {
      setVideos(before);
      writeUserCache(before);
      await fetchVideos({ perPage: 100, silent: true });
      throw e;
    }
  };

  const addFolder = (name: string, parentId: string | null = null) => {
    const newFolder: Folder = { id: Date.now().toString(), name, subFolders: [] };

    if (parentId) {
      const addToParent = (list: Folder[]): Folder[] =>
        list.map((f) => {
          if (f.id === parentId) {
            return { ...f, subFolders: [...(f.subFolders || []), newFolder] };
          }
          if (f.subFolders) return { ...f, subFolders: addToParent(f.subFolders) };
          return f;
        });

      setFolders((prev) => addToParent(prev));
    } else {
      setFolders((prev) => [...prev, newFolder]);
    }
  };

  const updateFolder = (id: string, name: string) => {
    const updateRecursive = (list: Folder[]): Folder[] =>
      list.map((f) => {
        if (f.id === id) return { ...f, name };
        if (f.subFolders) return { ...f, subFolders: updateRecursive(f.subFolders) };
        return f;
      });

    setFolders((prev) => updateRecursive(prev));
  };

  const deleteFolder = (id: string) => {
    const deleteRecursive = (list: Folder[]): Folder[] =>
      list
        .filter((f) => f.id !== id)
        .map((f) => ({
          ...f,
          subFolders: f.subFolders ? deleteRecursive(f.subFolders) : [],
        }));

    setFolders((prev) => deleteRecursive(prev));
  };

  const toggleFavorite = (videoId: string) => {
    setVideos((prev) =>
      prev.map((v) => (v.id === videoId ? { ...v, isFavorite: !v.isFavorite } : v)),
    );
  };

  const moveVideos = (videoIds: string[], targetFolderId: string) => {
    setVideos((prev) =>
      prev.map((v) => (videoIds.includes(v.id) ? { ...v, folderId: targetFolderId } : v)),
    );
  };

  const value = useMemo<DataContextType>(
    () => ({
      videos,
      folders,
      isLoading,
      addFolder,
      updateFolder,
      deleteFolder,
      toggleFavorite,
      moveVideos,
      deleteVideos,
      addVideo,
      refreshVideos: () => fetchVideos({ perPage: 100, silent: false }),
      refreshFolders,
    }),
    [videos, folders, isLoading],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = (): DataContextType => {
  const context = useContext(DataContext);
  if (context === undefined) throw new Error('useData must be used within a DataProvider');
  return context;
};
