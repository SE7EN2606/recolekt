import { API_BASE } from "../utils/api";
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
  addFolder: (name: string, parentId?: string | null) => Promise<void>;
  updateFolder: (id: string, name: string) => Promise<void>;
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

function joinUrl(base: string, path: string) {
  const p = String(path || '').replace(/^\/+/, '');
  if (!base) return `/${p}`;
  const b = String(base || '').replace(/\/+$/, '');
  return `${b}/${p}`;
}

function makeCacheKey(user: any) {
  return user?.id ? `reels_cache_${user.id}` : null;
}

function stripRawForCache(videos: any[]): any[] {
  return (videos || []).map((v) => {
    const { __raw, ...rest } = v || {};
    return rest;
  });
}

let globalLastFetchTime = 0;
let isFetchingGlobal = false;

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [_videos, _setVideos] = useState<Video[]>(() => {
    if (user?.id) {
      const cacheKey = `reels_cache_${user.id}`;
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        try { return JSON.parse(raw); } catch (e) {}
      }
    }
    return [];
  });

  const setVideos = useCallback((updater: React.SetStateAction<Video[]>) => {
    _setVideos((prev) => {
      const next = typeof updater === 'function' ? (updater as any)(prev) : updater;
      try {
        const cacheKey = user?.id ? `reels_cache_${user.id}` : null;
        if (cacheKey) {
          localStorage.setItem(cacheKey, JSON.stringify(stripRawForCache(next)));
        }
      } catch (e) {}
      return next;
    });
  }, [user?.id]);

  const [folders, setFolders] = useState<Folder[]>(() => {
    const saved = localStorage.getItem('custom_folders');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [isLoading, setIsLoading] = useState(false);

  const videosRef = useRef<Video[]>([]);
  videosRef.current = _videos;

  useEffect(() => {
    localStorage.setItem('custom_folders', JSON.stringify(folders));
  }, [folders]);

  useEffect(() => {
    if (!user) {
      setVideos([]);
      const saved = localStorage.getItem('custom_folders');
      setFolders(saved ? JSON.parse(saved) : []);
      return;
    }

    const cacheKey = makeCacheKey(user);
    if (!cacheKey) return;

    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setVideos(parsed);
      }
    } catch (e) {}
  }, [user?.id, setVideos]);

  const fetchVideos = useCallback(async () => {
    if (!user) return;
    
    const now = Date.now();
    if (now - globalLastFetchTime < 2000 || isFetchingGlobal) return; 
    
    globalLastFetchTime = now;
    isFetchingGlobal = true;
    setIsLoading(true);

    try {
      const url = joinUrl(API_BASE, `/api/saved_reels?page=1&per_page=100&view=list&t=${now}`);

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

        const loadedVideos: Video[] = (data?.reels || []).map((r: any) => {
          const summary = r.summary || {};
          const status = String(r.status || '');
          const isDone = status === 'done' || status === 'completed';
          const isFailed = status === 'failed' || status === 'error';

          let finalCategory = summary.category || 'General';
          if (!isDone && !isFailed) finalCategory = 'Processing';
          if (isFailed) finalCategory = 'Failed';

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
            r.transcript || '';

          const rawFolderId = r.folder_id || 'unsorted';
          const normalizedFolderId = (rawFolderId === 'default' || rawFolderId === 'all') ? 'unsorted' : rawFolderId;

          return {
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
            folderId: normalizedFolderId,
            content_type: r.content_type,
            recipe: r.recipe,
            workout: r.workout,
            status: r.status,
            errorMessage: r.error_message || null,
            __raw: r,
          } as any as Video;
        });

        setVideos((prevVideos) => {
          const loadedByUrl = new Map(loadedVideos.map((v: any) => [v.originalUrl, v]));
          const loadedById = new Map(loadedVideos.map((v: any) => [v.id, v]));
          const loadedByShortcode = new Map<string, Video>();

          loadedVideos.forEach((v: any) => {
            const sc = String(v.id || '').split('--')[0].split('_')[0];
            if (sc && !loadedByShortcode.has(sc)) loadedByShortcode.set(sc, v);
          });

          const seenIds = new Set<string>();
          const optimisticOnly = (prevVideos || []).filter((v: any) => {
            if (!v?.id || seenIds.has(v.id)) return false;
            seenIds.add(v.id);
            if (v.category !== 'Processing') return false;
            const sc = String(v.id || '').split('--')[0].split('_')[0];
            if (loadedById.has(v.id)) return false;
            if (v.originalUrl && loadedByUrl.has(v.originalUrl)) return false;
            if (sc && loadedByShortcode.has(sc)) return false;
            return true;
          });

          const finalVideos = [...optimisticOnly, ...loadedVideos];
          const uniqueById = new Map<string, Video>();
          for (const v of finalVideos as any[]) {
            if (v?.id) uniqueById.set(v.id, v);
          }
          const result = Array.from(uniqueById.values());

          let changed = false;
          if (prevVideos.length !== result.length) {
            changed = true;
          } else {
            for (let i = 0; i < prevVideos.length; i++) {
              if (
                prevVideos[i].id !== result[i].id || 
                prevVideos[i].status !== result[i].status || 
                prevVideos[i].category !== result[i].category ||
                prevVideos[i].folderId !== result[i].folderId ||
                prevVideos[i].thumbnailUrl !== result[i].thumbnailUrl
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
    } catch (error) {
    } finally {
      isFetchingGlobal = false;
      setIsLoading(false);
    }
  }, [user, setVideos]);

  const refreshFolders = useCallback(async () => {
    if (!user) return;
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
      console.error("Failed to refresh folders", error);
    }
  }, [user?.id]);

  const initRef = useRef(false);
  useEffect(() => {
    if (!user?.id) {
      initRef.current = false;
      return;
    }
    if (!initRef.current) {
      initRef.current = true;
      refreshFolders();
      globalLastFetchTime = 0;
      fetchVideos();
    }
  }, [user?.id, refreshFolders, fetchVideos]);

  useEffect(() => {
    if (!user?.id) return;
    const interval = window.setInterval(() => {
      const currentVideos = videosRef.current;
      const hasProcessing = currentVideos.some((v: any) => v?.category === 'Processing');
      if (hasProcessing && !isFetchingGlobal) {
        fetchVideos();
      }
    }, 10000);
    return () => window.clearInterval(interval);
  }, [user?.id, fetchVideos]);

  const addVideo = useCallback(async (url: string, forceRetry: boolean = false): Promise<AddVideoResult> => {
    const cleanUrl = (url || '').trim().split('?')[0];
    const currentVideos = videosRef.current;
    const existing = currentVideos.find((v: any) => v.originalUrl === cleanUrl);
    
    if (!forceRetry && existing && existing.status !== 'error' && existing.category !== 'Failed') {
      return {
        clientTempId: existing.id,
        processId: existing.id,
        status: existing.category === 'Processing' ? 'processing' : 'done',
        sourceUrl: cleanUrl,
        createdAt: existing.savedAt,
        previewUrl: (existing as any).thumbnailUrl,
      };
    }

    const payload = { url: cleanUrl, force_retry: forceRetry ? "true" : "false" };

    const response = await fetch(joinUrl(API_BASE, '/api/summarize'), {
      method: 'POST',
      body: JSON.stringify(payload),
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    });

    if (response.status === 409) throw new Error('This video has already been saved.');
    if (response.status === 401) {
      localStorage.removeItem('auth_token');
      throw new Error('Not authenticated');
    }

    let result: any = null;
    try { result = await response.json(); } catch {}
    if (!response.ok) throw new Error(result?.error || 'Failed to import video.');

    const createdAt = new Date().toISOString();
    const videoId = result?.reel_id || `temp_${cleanUrl.split('/').pop()}_${Date.now()}`;

    const newVideo: any = {
      id: videoId, title: 'Processing...', author: result?.author_name || 'Instagram User', platform: 'instagram',
      thumbnailUrl: result?.preview_url ?? '', duration: '', savedAt: createdAt, category: 'Processing',
      tags: [], summary: {}, transcript: '', transcription: null, originalUrl: cleanUrl, isFavorite: false,
      folderId: 'unsorted', status: 'processing', errorMessage: null,
    };

    setVideos((prev) => [newVideo, ...(prev || []).filter((v: any) => v.originalUrl !== cleanUrl)]);

    window.setTimeout(() => {
      globalLastFetchTime = 0;
      fetchVideos();
    }, 5000);

    return {
      clientTempId: `temp_${Date.now()}`, processId: videoId, status: 'processing',
      sourceUrl: cleanUrl, createdAt, previewUrl: result?.preview_url ?? null,
    };
  }, [user, fetchVideos, setVideos]);

  const moveVideos = useCallback(async (videoIds: string[], targetFolderId: string) => {
    setVideos((prev) => prev.map((v: any) => videoIds.includes(v.id) ? { ...v, folderId: targetFolderId } : v));
    
    try {
      await Promise.all(
        videoIds.map(async (id) => {
          const url = joinUrl(API_BASE, `/api/update/${encodeURIComponent(String(id))}`);
          await fetch(url, {
            method: 'PUT',
            credentials: 'include',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_id: targetFolderId })
          });
        })
      );
    } catch (error) {
      console.error("Failed to save move to DB:", error);
      fetchVideos();
    }
  }, [setVideos, fetchVideos]);

  const toggleFavorite = useCallback(async (videoId: string) => {
    const video = videosRef.current.find(v => v.id === videoId);
    if (!video) return;
    const newFav = !video.isFavorite;

    setVideos((prev) => prev.map((v: any) => (v.id === videoId ? { ...v, isFavorite: newFav } : v)));
    
    try {
      const url = joinUrl(API_BASE, `/api/update/${encodeURIComponent(String(videoId))}`);
      await fetch(url, {
        method: 'PUT',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: newFav }) 
      });
    } catch (error) {
      fetchVideos();
    }
  }, [setVideos, fetchVideos]);

  const updateVideo = useCallback(async (id: string, updates: any) => {
    setVideos((prev) => prev.map((v) => v.id === id ? { ...v, ...updates } : v));
    try {
      const url = joinUrl(API_BASE, `/api/update/${encodeURIComponent(String(id))}`);
      await fetch(url, {
        method: 'PUT',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (error) {
      fetchVideos();
    }
  }, [setVideos, fetchVideos]);

  const deleteVideos = useCallback(async (videoIds: string[]): Promise<void> => {
    if (!videoIds?.length) return;
    
    setVideos((prev) => {
      const idsToDelete = new Set(videoIds);
      return (prev || []).filter((v: any) => !idsToDelete.has(v.id));
    });

    try {
      await Promise.all(
        videoIds.map(async (id) => {
          const url = joinUrl(API_BASE, `/api/reel/${encodeURIComponent(String(id))}`);
          await fetch(url, {
            method: 'DELETE',
            credentials: 'include',
            headers: getAuthHeaders(),
          });
        })
      );
    } catch (error) {
      fetchVideos();
    }
  }, [user, setVideos, fetchVideos]);

  const addFolder = useCallback(async (name: string, parentId: string | null = null) => {
    const res = await fetch(joinUrl(API_BASE, '/api/folders'), {
      method: 'POST', credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parent_id: parentId })
    });
    
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to create folder");
    }
    await refreshFolders();
  }, [refreshFolders]);

  const updateFolder = useCallback(async (id: string, name: string) => {
    const res = await fetch(joinUrl(API_BASE, `/api/folders/${id}`), {
      method: 'PUT', credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to rename folder");
    }
    await refreshFolders();
  }, [refreshFolders]);

  const deleteFolder = useCallback(async (id: string) => {
    setVideos((prev) => prev.map(v => v.folderId === id ? { ...v, folderId: 'unsorted' } : v));

    try {
      const res = await fetch(joinUrl(API_BASE, `/api/folders/${id}`), {
        method: 'DELETE', credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        await refreshFolders();
        fetchVideos();
      } else {
        fetchVideos();
      }
    } catch (error) {
      console.error("Folder deletion failed:", error);
      fetchVideos();
    }
  }, [refreshFolders, fetchVideos, setVideos]);

  const refreshVideos = useCallback(async () => {
    fetchVideos(); 
  }, [fetchVideos]);

  const getVideoById = useCallback(
    (id: string): Video | undefined => {
      if (!id) return undefined;
      const vids = videosRef.current || [];
      return (
        vids.find(v => v.id === id) ||
        vids.find(v => (v as any).processId === id || (v as any).process_id === id) ||
        vids.find(v => String(v.id || '').startsWith(String(id).split('--')[0].split('_')[0]))
      );
    },
    []
  );

  const value = useMemo<DataContextType>(
    () => ({
      videos: _videos,
      folders,
      isLoading,
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
    [_videos, folders, isLoading, addFolder, updateFolder, deleteFolder, toggleFavorite, moveVideos, updateVideo, deleteVideos, addVideo, refreshVideos, refreshFolders, getVideoById]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within a DataProvider');
  return ctx;
};
