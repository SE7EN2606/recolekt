import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Video, Folder } from '../types';

interface DataContextType {
  videos: Video[];
  folders: Folder[];
  addFolder: (name: string) => void;
  toggleFavorite: (videoId: string) => void;
  moveVideos: (videoIds: string[], targetFolderId: string) => void;
  deleteVideos: (videoIds: string[]) => void;
  addVideo: (url: string) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [folders, setFolders] = useState<Folder[]>(() => {
    // Load folders from localStorage on init
    const saved = localStorage.getItem('custom_folders');
    return saved ? JSON.parse(saved) : [];
  });

  // Save folders to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('custom_folders', JSON.stringify(folders));
  }, [folders]);

  // Find this function in your DataContext.tsx
const addFolder = (name: string, parentId: string | null = null) => {
  const newFolder = {
    id: Date.now().toString(),
    name,
    parentId, // ✅ Add parent reference
    subFolders: []
  };

  if (parentId) {
    // ✅ Add as subfolder
    setFolders(prev => prev.map(folder => 
      folder.id === parentId 
        ? { ...folder, subFolders: [...(folder.subFolders || []), newFolder] }
        : folder
    ));
  } else {
    // ✅ Add as main folder
    setFolders(prev => [...prev, newFolder]);
  }
};


  const toggleFavorite = (videoId: string) => {
    setVideos(prev =>
      prev.map(v =>
        v.id === videoId
          ? {
              ...v,
              isFavorite: !v.isFavorite,
              favoritedAt: !v.isFavorite ? new Date().toISOString() : undefined,
            }
          : v,
      ),
    );
  };

  const moveVideos = (videoIds: string[], targetFolderId: string) => {
    setVideos(prev =>
      prev.map(v => (videoIds.includes(v.id) ? { ...v, folderId: targetFolderId } : v)),
    );
  };

  const deleteVideos = (videoIds: string[]) => {
    setVideos(prev => prev.filter(v => !videoIds.includes(v.id)));
  };

  const addVideo = async (url: string) => {
    try {
      const formData = new FormData();
      formData.append('url', url);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL ?? 'http://localhost:5001'}/api/summarize`,
        {
          method: 'POST',
          body: formData,
        },
      );
      const result = await response.json();
      const newVideo: Video = {
        id: result.reel_id ?? Date.now().toString(),
        title: result.summary?.title ?? 'Processing…',
        author: result.author_name ?? '',
        platform: 'instagram',
        thumbnailUrl: result.thumbnail_url ?? '',
        duration: '',
        savedAt: new Date().toISOString(),
        category: 'Uncategorized',
        tags: [],
        summary: result.summary?.title ?? 'Processing…',
        bullets: [],
        transcript: '',
        originalUrl: url,
        isFavorite: false,
        folderId: 'default',
      };
      setVideos(prev => [newVideo, ...prev]);
    } catch (err) {
      console.error('Failed to call /summarize', err);
    }
  };

  return (
    <DataContext.Provider
      value={{ videos, folders, addFolder, toggleFavorite, moveVideos, deleteVideos, addVideo }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within a DataProvider');
  return ctx;
};
