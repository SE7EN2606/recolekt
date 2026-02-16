import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
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

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
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
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [folders, setFolders] = useState<Folder[]>(() => {
    const saved = localStorage.getItem('custom_folders');
    return saved ? JSON.parse(saved) : [];
  });
  const [hydratedFromCache, setHydratedFromCache] = useState(false);

  useEffect(() => {
    localStorage.setItem('custom_folders', JSON.stringify(folders));
  }, [folders]);

  // Hydrate videos from per-user cache on login
  useEffect(() => {
    if (!user) {
      setVideos([]);
      setHydratedFromCache(false);
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
            console.log(
              '💾 Hydrating videos from cache:',
              parsed.length,
            );
          }
          setVideos(parsed);
          setHydratedFromCache(true);
        }
      }
    } catch (e) {
      console.error('❌ Failed to read reels cache:', e);
    }
  }, [user]);

  const fetchVideos = async () => {
    if (!user) return;
    if (isLoading) return; // prevent overlapping calls
    setIsLoading(true);

    try {
      // You can tune per_page down if needed (e.g. 50)
      const url = joinUrl(
        API_BASE,
        `/api/saved_reels?page=1&per_page=100&view=list&t=${Date.now()}`
      );

      if (isDev) {
        console.log('🔄 DataContext: Fetching videos from backend...');
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

        const loadedVideos = (data.reels || []).map((r: any) => {
          const summary = r.summary || {};
          const isDone = r.status === 'done' || r.status === 'completed';
          const isFailed = r.status === 'failed';

          let finalCategory = summary.category || 'General';
          if (!isDone && !isFailed) {
            finalCategory = 'Processing';
          } else if (isFailed) {
            finalCategory = 'Failed';
          }

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
            summary: summary,
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

          return mappedVideo as Video;
        });

        if (loadedVideos.length > 0 && isDev) {
          console.log(
            '🔍 DataContext: Loaded videos from backend:',
            loadedVideos.map((v) => ({
              id: v.id.substring(0, 30) + '...',
              folderId: v.folderId,
              category: v.category,
            })),
          );
        }

        setVideos((prevVideos) => {
          const loadedByUrl = new Map(
            loadedVideos.map((v) => [v.originalUrl, v]),
          );
          const loadedById = new Map(loadedVideos.map((v) => [v.id, v]));

          const loadedByShortcode = new Map<string, Video>();
          loadedVideos.forEach((v) => {
            const shortcode = v.id.split('--')[0].split('_')[0];
            if (!loadedByShortcode.has(shortcode)) {
              loadedByShortcode.set(shortcode, v);
            }
          });

          const seenIds = new Set<string>();

          const optimisticOnly = prevVideos.filter((v) => {
            if (seenIds.has(v.id)) return false;
            seenIds.add(v.id);

            if (v.category !== 'Processing') return false;

            const shortcode = v.id.split('--')[0].split('_')[0];

            if (loadedById.has(v.id)) return false;
            if (v.originalUrl && loadedByUrl.has(v.originalUrl)) return false;
            if (loadedByShortcode.has(shortcode)) return false;

            return true;
          });

          const finalVideos = [...optimisticOnly, ...loadedVideos];
          const uniqueById = new Map(finalVideos.map((v) => [v.id, v]));
          const result = Array.from(uniqueById.values());

          if (isDev) {
            console.log(
              '🔍 DataContext: Setting videos state:',
              result.map((v) => ({
                id: v.id.substring(0, 30) + '...',
                folderId: v.folderId,
                category: v.category,
              })),
            );
          }

          // Write a trimmed version to per-user cache
          try {
            const cacheKey = makeCacheKey(user as any);
            if (cacheKey) {
              const cachePayload = stripRawForCache(result);
              localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
              if (isDev) {
                console.log(
                  '💾 Stored videos in cache:',
                  cachePayload.length,
                );
              }
            }
          } catch (e) {
            console.error('❌ Failed to write reels cache:', e);
          }

          return result;
        });
      } else if (response.status === 401) {
        console.error('❌ Unauthorized - clearing token');
        localStorage.removeItem('auth_token');
      }
    } catch (error) {
      console.error('❌ Failed to load gallery:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Cleanup stuck reels, then optionally trigger a refresh (non-blocking)
  const cleanupStuckReels = async () => {
    if (!user) return;

    try {
      const url = joinUrl(API_BASE, '/api/cleanup/stuck-reels');
      const response = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.cleaned > 0) {
          if (isDev) {
            console.log(`🧹 Cleaned up ${data.cleaned} stuck reels from backend`);
          }
          fetchVideos();
        }
      }
    } catch (error) {
      console.error('❌ Failed to cleanup stuck reels:', error);
    }
  };

  const refreshFolders = async () => {
    if (!user) {
      if (isDev) {
        console.log('⚠️ DataContext: No user, skipping folder fetch');
      }
      return;
    }

    if (isDev) {
      console.log('📁 DataContext: Fetching folders from backend...');
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
      const fetchedFolders = data.folders || [];

      if (isDev) {
        console.log('📁 DataContext: Loaded folders:', fetchedFolders.length);
      }

      setFolders((prevFolders) => {
        const merged = [...prevFolders];
        fetchedFolders.forEach((backendFolder: Folder) => {
          const exists = merged.find((f) => f.id === backendFolder.id);
          if (!exists) {
            merged.push(backendFolder);
          }
        });
        return merged;
      });
    } catch (error) {
      console.error('❌ DataContext: Error fetching folders:', error);
    }
  };

  // On login/logout
  useEffect(() => {
    if (user) {
      if (isDev) {
        console.log(
          '📁 User logged in, fetching folders, cleaning up, loading videos...',
        );
      }
      refreshFolders();
      cleanupStuckReels();
      fetchVideos();
    }
  }, [user]);

  // Auto-refresh while there are processing videos (but never overlap requests)
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      const hasProcessing = videos.some((v) => v.category === 'Processing');
      if (hasProcessing && !isLoading) {
        if (isDev) {
          console.log('⏱️ Auto-refreshing (processing videos detected)');
        }
        fetchVideos();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [user, videos, isLoading]);

  const addVideo = async (url: string): Promise<AddVideoResult> => {
    try {
      const cleanUrl = url.trim().split('?')[0];

      const existingVideo = videos.find((v) => v.originalUrl === cleanUrl);
      if (existingVideo) {
        if (isDev) {
          console.warn('⚠️ Video already exists:', cleanUrl);
        }
        return {
          clientTempId: existingVideo.id,
          processId: existingVideo.id,
          status:
            existingVideo.category === 'Processing' ? 'processing' : 'done',
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

      if (response.status === 409)
        throw new Error('This video has already been saved.');
      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        throw new Error('Not authenticated');
      }

      let result: any;
      try {
        result = await response.json();
      } catch {}

      if (!response.ok) {
        throw new Error(result?.error || 'Failed to import video.');
      }

      const createdAt = new Date().toISOString();
      const videoId =
        result?.reel_id ||
        `temp_${cleanUrl.split('/').pop()}_${Date.now()}`;

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

        // Update cache optimistically
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

      setTimeout(fetchVideos, 5000);

      return {
        clientTempId: `temp_${Date.now()}`,
        processId: videoId,
        status: 'processing',
        sourceUrl: cleanUrl,
        createdAt,
        previewUrl: result?.preview_url,
      };
    } catch (err: any) {
      console.error('❌ Failed to call /summarize', err);
      throw err;
    }
  };

  const deleteVideos = async (videoIds: string[]): Promise<void> => {
    if (!videoIds.length) return;

    const before = videos;

    try {
      if (isDev) {
        console.log('🗑️ Deleting videos:', videoIds);
      }

      setVideos((prev) => prev.filter((v) => !videoIds.includes(v.id)));

      const deletePromises = videoIds.map(async (videoId) => {
        const encodedId = encodeURIComponent(videoId);
        const url = joinUrl(API_BASE, `/api/reel/${encodedId}`);

        try {
          const response = await fetch(url, {
            method: 'DELETE',
            credentials: 'include',
            headers: getAuthHeaders(),
          });

          if (response.status === 401) {
            localStorage.removeItem('auth_token');
            throw new Error('Not authenticated');
          }

          if (!response.ok) {
            const text = await response.text().catch(() => '');
            console.error(
              `❌ Failed to delete ${videoId} from backend:`,
              response.status,
              text,
            );
            throw new Error(`Delete failed for ${videoId}: ${response.status}`);
          }

          if (isDev) {
            console.log(`✅ Deleted ${videoId} from backend`);
          }
        } catch (error) {
          console.error(`❌ Error deleting ${videoId}:`, error);
          throw error;
        }
      });

      await Promise.all(deletePromises);

      if (isDev) {
        console.log('✅ All videos deleted');
      }

      // Update cache after delete
      try {
        const cacheKey = makeCacheKey(user as any);
        if (cacheKey) {
          const cachePayload = stripRawForCache(
            videos.filter((v) => !videoIds.includes(v.id)) as any[],
          );
          localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
        }
      } catch (e) {
        console.error('❌ Failed to update reels cache on delete:', e);
      }
    } catch (error) {
      console.error('❌ Failed to delete videos (restoring):', error);
      setVideos(before);
      await fetchVideos();
    }
  };

  const addFolder = (name: string, parentId: string | null = null) => {
    const newFolder: Folder = {
      id: Date.now().toString(),
      name,
      subFolders: [],
    };
    if (parentId) {
      const addToParent = (list: Folder[]): Folder[] => {
        return list.map((f) => {
          if (f.id === parentId)
            return {
              ...f,
              subFolders: [...(f.subFolders || []), newFolder],
            };
          if (f.subFolders)
            return { ...f, subFolders: addToParent(f.subFolders) };
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
        if (f.subFolders)
          return { ...f, subFolders: updateRecursive(f.subFolders) };
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
          subFolders: f.subFolders ? deleteRecursive(f.subFolders) : [],
        }));
    };
    setFolders((prev) => deleteRecursive(prev));
  };

  const toggleFavorite = (videoId: string) => {
    setVideos((prev) =>
      prev.map((v) =>
        v.id === videoId ? { ...v, isFavorite: !v.isFavorite } : v,
      ),
    );
  };

  const moveVideos = (videoIds: string[], targetFolderId: string) => {
    setVideos((prev) =>
      prev.map((v) =>
        videoIds.includes(v.id) ? { ...v, folderId: targetFolderId } : v,
      ),
    );
  };

  const value = useMemo(
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
    [videos, folders, isLoading],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined)
    throw new Error('useData must be used within a DataProvider');
  return context;
};
