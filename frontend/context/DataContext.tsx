import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Video, Folder } from '../types';
import { MOCK_VIDEOS, MOCK_FOLDERS } from '../data/mockData';

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
  const [videos, setVideos] = useState<Video[]>(MOCK_VIDEOS);
  const [folders, setFolders] = useState<Folder[]>(MOCK_FOLDERS);

  // Calculate counts dynamically based on videos state if needed, 
  // but for now we just manage the lists.

  const addFolder = (name: string) => {
    const newFolder: Folder = {
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name: name,
      itemCount: 0,
      coverUrl: ''
    };
    setFolders(prev => [...prev, newFolder]);
  };

  const toggleFavorite = (videoId: string) => {
    setVideos(prev => prev.map(video => {
      if (video.id === videoId) {
        const isNowFavorite = !video.isFavorite;
        return {
          ...video,
          isFavorite: isNowFavorite,
          favoritedAt: isNowFavorite ? new Date().toISOString() : undefined
        };
      }
      return video;
    }));
  };

  const moveVideos = (videoIds: string[], targetFolderId: string) => {
    setVideos(prev => prev.map(video => {
      if (videoIds.includes(video.id)) {
        return { ...video, folderId: targetFolderId };
      }
      return video;
    }));
  };

  const deleteVideos = (videoIds: string[]) => {
    setVideos(prev => prev.filter(video => !videoIds.includes(video.id)));
  };

  const addVideo = (url: string) => {
    const newVideo: Video = {
      id: Date.now().toString(),
      title: 'New Saved Reel',
      author: '@saved_user',
      platform: url.includes('tiktok') ? 'tiktok' : url.includes('youtube') ? 'youtube' : 'instagram',
      thumbnailUrl: 'https://picsum.photos/400/711?random=' + Date.now(),
      duration: '0:30',
      savedAt: new Date().toISOString().split('T')[0],
      category: 'Uncategorized',
      tags: [],
      summary: 'Ready to organize',
      bullets: [],
      transcript: '',
      originalUrl: url,
      isFavorite: false,
      folderId: 'all'
    };
    setVideos(prev => [newVideo, ...prev]);
  };

  return (
    <DataContext.Provider value={{ videos, folders, addFolder, toggleFavorite, moveVideos, deleteVideos, addVideo }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};