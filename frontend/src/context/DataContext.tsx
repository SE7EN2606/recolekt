import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
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

const RAW_API_BASE = (
  import.meta.env.VITE_API_BASE ??
  import.meta.env.VITE_API_URL ??
  ''
) as string;
const API_BASE = String(RAW_API_BASE).replace(/\/+$/, '');

function joinUrl(base: string, path: string) {
  const p = String(path || '').replace(/^\/+/, '');
  if (!base) return `/${p}`;
  const b = String(base || '').replace(/\/+$/, '');
  return `${b}/${p}`;
}

const isDev = Boolean((import.meta as any).env?.DEV);

function makeCacheKey(user: any) {
  return user?.id ? `reels_cache_${user.id}` : null;
}

function stripRawForCache(videos: any[]): any[] {
  return (videos || []).map((v) => {
    const { __raw, ...rest } = v || {};
    return rest;
  });
}

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [videos, setVideos] = useState<Video[]>([]);
  const [folders, setFolders] = useState<Folder[]>(() => {
    const saved = localStorage.getItem('custom_folders');
    return saved ? JSON.parse(saved) : [];
  });
  const [isLoading, setIsLoading] = useState(false);

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
        if (isDev) console.log('💾 Hydrating videos from cache:', parsed.length);
        setVideos(parsed);
      }
    } catch (e) {
      console.error('❌ Failed to read reels cache:', e);
    }
  }, [user]);

  const fetchVideos = async () => {
    if (!user) return;
    if (isLoading) return;

    setIsLoading(true);

    try {
      const url = joinUrl(
        API_BASE,
        `/api/saved_reels?page=1&per_page=100&view=list&t=${Date.now()}`
      );

      if (isDev) {
        console.log('🔄 DataContext: Fetching videos...');
        console.log('🔧 API_BASE =', API_BASE || '(same-origin)');
        console.log('🌐 URL =', url);
      }

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
          const isFailed = status === 'failed';

          let finalCategory = summary.category || 'General';
          if (!isDone && !isFailed) finalCategory = 'Processing';
          if (isFailed) finalCategory = 'Failed';

          let displayTitle = 'Processing...';
          if (isDone) {
            if (typeof summary.title === 'object' && summary.title?.english) {
              displayTitle = summary.title.english;
            } else if (
              typeof summary.title === 'string' &&
              summary.title !== 'Processing...'
            ) {
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
            folderId: r.folder_id || 'default',
            content_type: r.content_type,
            recipe: r.recipe,
            workout: r.workout,
            status: r.status,
            errorMessage: r.error_message || null,
            __raw: r,
          } as any as Video;
        });

        if (isDev) console.log('✅ Loaded reels:', loadedVideos.length);

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

          try {
            const cacheKey = makeCacheKey(user);
            if (cacheKey) {
              localStorage.setItem(cacheKey, JSON.stringify(stripRawForCache(result as any[])));
              if (isDev) console.log('💾 Stored videos in cache:', result.length);
            }
          } catch (e) {
            console.error('❌ Failed to write reels cache:', e);
          }

          return result;
        });

        return;
      }

      if (response.status === 401) {
        console.error('❌ Unauthorized - clearing token');
        localStorage.removeItem('auth_token');
        return;
      }

      console.error('❌ Failed to fetch reels:', response.status);
    } catch (error) {
      console.error('❌ Failed to load gallery:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const cleanupStuckReels = async () => {
    if (!user) return;
    try {
      const response = await fetch(joinUrl(API_BASE, '/api/cleanup/stuck-reels'), {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      const cleaned = Number(data?.cleaned || 0);
      if (cleaned > 0) {
        if (isDev) console.log(`🧹 Cleaned up ${cleaned} stuck reels`);
        await fetchVideos();
      }
    } catch (error) {
      console.error('❌ Failed to cleanup stuck reels:', error);
    }
  };

  const refreshFolders = async () => {
    if (!user) return;
    try {
      const response = await fetch(joinUrl(API_BASE, '/api/folders'), {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) localStorage.removeItem('auth_token');
        throw new Error(`Failed to fetch folders: ${response.status}`);
      }

      const data = await response.json();
      const fetchedFolders: Folder[] = data?.folders || [];

      if (isDev) console.log('📁 Loaded folders:', fetchedFolders.length);

      setFolders((prev) => {
        const merged = [...(prev || [])];
        for (const bf of fetchedFolders) {
          if (!merged.find((f) => f.id === bf.id)) merged.push(bf);
        }
        return merged;
      });
    } catch (error) {
      console.error('❌ DataContext: Error fetching folders:', error);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (isDev) console.log('✅ User logged in: refreshFolders + cleanup + fetchVideos');
    refreshFolders();
    cleanupStuckReels();
    fetchVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(() => {
      const hasProcessing = videos.some((v: any) => v?.category === 'Processing');
      if (hasProcessing && !isLoading) {
        if (isDev) console.log('⏱️ Auto-refreshing (processing videos detected)');
        fetchVideos();
      }
    }, 10000);
    return () => window.clearInterval(interval);
  }, [user, videos, isLoading]);

  const addVideo = async (url: string): Promise<AddVideoResult> => {
    const cleanUrl = (url || '').trim().split('?')[0];

    const existing = videos.find((v: any) => v.originalUrl === cleanUrl);
    if (existing) {
      return {
        clientTempId: existing.id,
        processId: existing.id,
        status: existing.category === 'Processing' ? 'processing' : 'done',
        sourceUrl: cleanUrl,
        createdAt: existing.savedAt,
        previewUrl: (existing as any).thumbnailUrl,
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

    const newVideo: any = {
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
      transcription: null,
      originalUrl: cleanUrl,
      isFavorite: false,
      folderId: 'default',
      status: 'processing',
      errorMessage: null,
    };

    setVideos((prev) => {
      const filtered = (prev || []).filter((v: any) => v.originalUrl !== cleanUrl);
      const merged = [newVideo, ...filtered];
      try {
        const cacheKey = makeCacheKey(user);
        if (cacheKey)
          localStorage.setItem(cacheKey, JSON.stringify(stripRawForCache(merged)));
      } catch (e) {
        console.error('❌ Failed to update reels cache on addVideo:', e);
      }
      return merged;
    });

    window.setTimeout(fetchVideos, 5000);

    return {
      clientTempId: `temp_${Date.now()}`,
      processId: videoId,
      status: 'processing',
      sourceUrl: cleanUrl,
      createdAt,
      previewUrl: result?.preview_url ?? null,
    };
  };

  const deleteVideos = async (videoIds: string[]): Promise<void> => {
    if (!videoIds?.length) return;
    const before = videos;

    try {
      if (isDev) console.log('🗑️ Deleting videos:', videoIds);

      setVideos((prev) => {
        const idsToDelete = new Set(videoIds);
        const filtered = (prev || []).filter((v: any) => {
          const processId = v?.__raw?.process_id;
          return !idsToDelete.has(v.id) && !(processId && idsToDelete.has(processId));
        });
        try {
          const cacheKey = makeCacheKey(user);
          if (cacheKey)
            localStorage.setItem(cacheKey, JSON.stringify(stripRawForCache(filtered)));
        } catch (e) {
          console.error('❌ Failed to update reels cache on delete:', e);
        }
        return filtered;
      });

      await Promise.all(
        videoIds.map(async (id) => {
          const url = joinUrl(API_BASE, `/api/reel/${encodeURIComponent(String(id))}`);
          const res = await fetch(url, {
            method: 'DELETE',
            credentials: 'include',
            headers: getAuthHeaders(),
          });
          if (res.status === 404) return;
          if (res.status === 401) {
            localStorage.removeItem('auth_token');
            throw new Error('Not authenticated');
          }
          if (!res.ok) throw new Error(`Delete failed (${res.status})`);
        })
      );

      await fetchVideos();
    } catch (error) {
      console.error('❌ Failed to delete videos (restoring):', error);
      setVideos(before);
      await fetchVideos();
      throw error as any;
    }
  };

  const addFolder = (name: string, parentId: string | null = null) => {
    const newFolder: Folder = { id: Date.now().toString(), name, subFolders: [] };
    if (parentId) {
      const addToParent = (list: Folder[]): Folder[] =>
        (list || []).map((f) => {
          if (f.id === parentId)
            return { ...f, subFolders: [...(f.subFolders || []), newFolder] };
          if (f.subFolders?.length) return { ...f, subFolders: addToParent(f.subFolders) };
          return f;
        });
      setFolders((prev) => addToParent(prev));
    } else {
      setFolders((prev) => [...(prev || []), newFolder]);
    }
  };

  const updateFolder = (id: string, name: string) => {
    const rec = (list: Folder[]): Folder[] =>
      (list || []).map((f) => {
        if (f.id === id) return { ...f, name };
        if (f.subFolders?.length) return { ...f, subFolders: rec(f.subFolders) };
        return f;
      });
    setFolders((prev) => rec(prev));
  };

  const deleteFolder = (id: string) => {
    const rec = (list: Folder[]): Folder[] =>
      (list || [])
        .filter((f) => f.id !== id)
        .map((f) => ({ ...f, subFolders: f.subFolders ? rec(f.subFolders) : [] }));
    setFolders((prev) => rec(prev));
  };

  const toggleFavorite = (videoId: string) => {
    setVideos((prev) =>
      prev.map((v: any) => (v.id === videoId ? { ...v, isFavorite: !v.isFavorite } : v))
    );
  };

  const moveVideos = (videoIds: string[], targetFolderId: string) => {
    setVideos((prev) =>
      prev.map((v: any) =>
        videoIds.includes(v.id) ? { ...v, folderId: targetFolderId } : v
      )
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
      refreshVideos: fetchVideos,
      refreshFolders,
    }),
    [videos, folders, isLoading]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within a DataProvider');
  return ctx;
};
