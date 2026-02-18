import React, {
  createContext,
  useCallback,
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

function normalizeApiBase(raw: unknown) {
  const s = String(raw ?? '').trim();
  if (s === '/' || s === '') return '';
  return s.replace(/\/+$/, '');
}

const API_BASE = normalizeApiBase(RAW_API_BASE);

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  if (!b) return `/${p}`;
  return `${b}/${p}`;
}

const isDev = Boolean((import.meta as any).env?.DEV);

function makeCacheKey(user: User | null | undefined) {
  return user ? `reels_cache_${user.id}` : null;
}

function stripRawForCache(videos: any[]): any[] {
  return videos.map((v) => {
    const { __raw, ...rest } = v || {};
    return rest;
  });
}

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = (user as any)?.id as string | undefined;

  const [videos, setVideos] = useState<Video[]>([]);
  const [folders, setFolders] = useState<Folder[]>(() => {
    const saved = localStorage.getItem('custom_folders');
    return saved ? JSON.parse(saved) : [];
  });
  const [isLoading, setIsLoading] = useState(false);

  // Refs to avoid overlap + stale closures
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const videosRef = useRef<Video[]>([]);
  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  // Persist custom folders locally
  useEffect(() => {
    localStorage.setItem('custom_folders', JSON.stringify(folders));
  }, [folders]);

  // Hydrate videos from per-user cache on login
  useEffect(() => {
    if (!userId) {
      setVideos([]);
      const saved = localStorage.getItem('custom_folders');
      setFolders(saved ? JSON.parse(saved) : []);
      return;
    }

    const cacheKey = makeCacheKey(user as any);
    if (!cacheKey) return;

    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          if (isDev) {
            console.log('💾 Hydrating videos from cache:', parsed.length);
          }
          setVideos(parsed);
        }
      }
    } catch (e) {
      console.error('❌ Failed to read reels cache:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const fetchVideos = useCallback(async () => {
    if (!userId) return;
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    setIsLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const url = joinUrl(API_BASE, '/api/saved_reels?page=1&per_page=100&view=list');

      if (isDev) {
        console.log('🔄 DataContext: Fetching videos', {
          RAW_API_BASE,
          API_BASE: API_BASE || '(same-origin)',
          url,
        });
      }

      const response = await fetch(url, {
        signal: controller.signal,
        credentials: 'include',
        headers: {
          ...getAuthHeaders(),
        },
      });

      if (response.ok) {
        const data = await response.json();

        const loadedVideos: Video[] = (data.reels || []).map((r: any) => {
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

          const mappedVideo: any = {
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
            isFavorite: Boolean(r.is_favorite),
            folderId: r.folder_id || 'default',
            content_type: r.content_type,
            recipe: r.recipe,
            workout: r.workout,
            status: r.status,
            errorMessage: r.error_message || null,
            __raw: r,
          };

          return mappedVideo as Video;
        });

        setVideos((prevVideos) => {
          const loadedByUrl = new Map(loadedVideos.map((v) => [v.originalUrl, v]));
          const loadedById = new Map(loadedVideos.map((v) => [v.id, v]));

          const loadedByShortcode = new Map<string, Video>();
          loadedVideos.forEach((v) => {
            const shortcode = v.id.split('--')[0].split('_')[0];
            if (!loadedByShortcode.has(shortcode)) loadedByShortcode.set(shortcode, v);
          });

          const seenIds = new Set<string>();
          const optimisticOnly = prevVideos.filter((v) => {
            if (seenIds.has(v.id)) return false;
            seenIds.add(v.id);

            if ((v as any).category !== 'Processing') return false;

            const shortcode = v.id.split('--')[0].split('_')[0];
            if (loadedById.has(v.id)) return false;
            if (v.originalUrl && loadedByUrl.has(v.originalUrl)) return false;
            if (loadedByShortcode.has(shortcode)) return false;

            return true;
          });

          const finalVideos = [...optimisticOnly, ...loadedVideos];
          const uniqueById = new Map(finalVideos.map((v) => [v.id, v]));
          const result = Array.from(uniqueById.values());

          try {
            const cacheKey = makeCacheKey(user as any);
            if (cacheKey) {
              const cachePayload = stripRawForCache(result as any[]);
              localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
              if (isDev) console.log('💾 Stored videos in cache:', cachePayload.length);
            }
          } catch (e) {
            console.error('❌ Failed to write reels cache:', e);
          }

          return result;
        });
      } else if (response.status === 401) {
        console.error('❌ Unauthorized - clearing token');
        localStorage.removeItem('auth_token');
      } else {
        const text = await response.text().catch(() => '');
        console.error('❌ Failed to load gallery:', response.status, text);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('❌ Failed to load gallery:', err);
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, [userId, user]);

  const refreshFolders = useCallback(async () => {
    if (!userId) {
      if (isDev) console.log('⚠️ DataContext: No user, skipping folder fetch');
      return;
    }

    try {
      const url = joinUrl(API_BASE, '/api/folders');
      const response = await fetch(url, {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.error('❌ Unauthorized - clearing token');
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
    } catch (error) {
      console.error('❌ DataContext: Error fetching folders:', error);
    }
  }, [userId]);

  // On login: load folders + reels (NO cleanup call)
  useEffect(() => {
    if (!userId) return;
    refreshFolders();
    fetchVideos();
  }, [userId, refreshFolders, fetchVideos]);

  // Poll only while there are processing videos + tab is visible
  useEffect(() => {
    if (!userId) return;

    const interval = window.setInterval(() => {
      const hasProcessing = videosRef.current.some((v: any) => v.category === 'Processing');
      if (!hasProcessing) return;
      if (document.visibilityState !== 'visible') return;
      if (inFlightRef.current) return;
      fetchVideos();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [userId, fetchVideos]);

  const addVideo = useCallback(
    async (url: string): Promise<AddVideoResult> => {
      const cleanUrl = url.trim().split('?')[0];

      const existingVideo = videosRef.current.find((v) => (v as any).originalUrl === cleanUrl);
      if (existingVideo) {
        return {
          clientTempId: existingVideo.id,
          processId: existingVideo.id,
          status: (existingVideo as any).category === 'Processing' ? 'processing' : 'done',
          sourceUrl: cleanUrl,
          createdAt: (existingVideo as any).savedAt,
          previewUrl: (existingVideo as any).thumbnailUrl,
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
      } catch {}

      if (!response.ok) throw new Error(result?.error || 'Failed to import video.');

      const createdAt = new Date().toISOString();
      const videoId = result?.reel_id || `temp_${cleanUrl.split('/').pop()}_${Date.now()}`;

      const newVideo: Video = {
        id: videoId,
        title: 'Processing...',
        author: result?.author_name || 'Instagram User',
        platform: 'instagram',
        thumbnailUrl: result?.preview_url ?? '',
        duration: '',
        savedAt: createdAt,
        category: 'Processing' as any,
        tags: [],
        summary: {},
        transcript: '',
        originalUrl: cleanUrl,
        isFavorite: false as any,
        folderId: 'default' as any,
        status: 'processing' as any,
      } as any;

      setVideos((prev) => {
        const filtered = prev.filter((v: any) => v.originalUrl !== cleanUrl);
        const merged = [newVideo, ...filtered];

        try {
          const cacheKey = makeCacheKey(user as any);
          if (cacheKey) {
            const cachePayload = stripRawForCache(merged as any[]);
            localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
          }
        } catch (e) {
          console.error('❌ Failed to update reels cache on addVideo:', e);
        }

        return merged;
      });

      // refresh shortly after to pick up server-side status updates
      window.setTimeout(fetchVideos, 5000);

      return {
        clientTempId: `temp_${Date.now()}`,
        processId: videoId,
        status: 'processing',
        sourceUrl: cleanUrl,
        createdAt,
        previewUrl: result?.preview_url,
      };
    },
    [user, fetchVideos],
  );

  const deleteVideos = useCallback(
    async (videoIds: string[]): Promise<void> => {
      if (!videoIds.length) return;

      const before = videosRef.current;

      // Optimistic removal
      setVideos((prev) => {
        const idsToDelete = new Set(videoIds);
        const filtered = prev.filter((v: any) => {
          const raw = v.__raw || {};
          const processId = raw.process_id;
          const matchById = idsToDelete.has(v.id);
          const matchByProcessId = processId && idsToDelete.has(processId);
          return !(matchById || matchByProcessId);
        });

        try {
          const cacheKey = makeCacheKey(user as any);
          if (cacheKey) {
            const cachePayload = stripRawForCache(filtered as any[]);
            localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
          }
        } catch (e) {
          console.error('❌ Failed to update reels cache on delete:', e);
        }

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

            // Treat "not found" as already deleted
            if (response.status === 404) return;

            if (!response.ok) {
              const text = await response.text().catch(() => '');
              throw new Error(`Delete failed for ${videoId}: ${response.status} ${text}`);
            }
          }),
        );

        await fetchVideos();
      } catch (error) {
        console.error('❌ Failed to delete videos (restoring):', error);
        setVideos(before);
        await fetchVideos();
      }
    },
    [user, fetchVideos],
  );

  const addFolder = (name: string, parentId: string | null = null) => {
    const newFolder: Folder = {
      id: Date.now().toString(),
      name,
      subFolders: [],
    };

    if (parentId) {
      const addToParent = (list: Folder[]): Folder[] => {
        return list.map((f) => {
          if (f.id === parentId) return { ...f, subFolders: [...(f.subFolders || []), newFolder] };
          if (f.subFolders?.length) return { ...f, subFolders: addToParent(f.subFolders) };
          return f;
        });
      };
      setFolders((prev) => addToParent(prev));
    } else {
      setFolders((prev) => [...prev, newFolder]);
    }
  };

  const updateFolder = (id: string, name: string) => {
    const updateRecursive = (list: Folder[]): Folder[] => {
      return list.map((f) => {
        if (f.id === id) return { ...f, name };
        if (f.subFolders?.length) return { ...f, subFolders: updateRecursive(f.subFolders) };
        return f;
      });
    };
    setFolders((prev) => updateRecursive(prev));
  };

  const deleteFolder = (id: string) => {
    const deleteRecursive = (list: Folder[]): Folder[] => {
      return list
        .filter((f) => f.id !== id)
        .map((f) => ({
          ...f,
          subFolders: f.subFolders?.length ? deleteRecursive(f.subFolders) : [],
        }));
    };
    setFolders((prev) => deleteRecursive(prev));
  };

  const toggleFavorite = (videoId: string) => {
    setVideos((prev) => prev.map((v: any) => (v.id === videoId ? { ...v, isFavorite: !v.isFavorite } : v)));
  };

  const moveVideos = (videoIds: string[], targetFolderId: string) => {
    setVideos((prev) => prev.map((v: any) => (videoIds.includes(v.id) ? { ...v, folderId: targetFolderId } : v)));
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
      refreshVideos: fetchVideos,
      refreshFolders,
    }),
    [videos, folders, isLoading, deleteVideos, addVideo, fetchVideos, refreshFolders],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) throw new Error('useData must be used within a DataProvider');
  return context;
};
