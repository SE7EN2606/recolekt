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

  // Fetch videos from backend
  const fetchVideos = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/saved_reels`);
      const data = await response.json();
      setVideos(data);
    } catch (error) {
      console.error('Failed to fetch videos:', error);
    }
  };

  // Fetch folders from backend
  const fetchFolders = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/folders`);
      const data = await response.json();
      setFolders(data);
    } catch (error) {
      console.error('Failed to fetch folders:', error);
    }
  };

  // Add a new folder
  const addFolder = async (name: string) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const newFolder = await response.json();
      setFolders(prev => [...prev, newFolder]);
    } catch (error) {
      console.error('Failed to add folder:', error);
    }
  };

  // Toggle favorite status
  const toggleFavorite = async (videoId: string) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/videos/${videoId}/favorite`, {
        method: 'POST'
      });
      const updatedVideo = await response.json();
      setVideos(prev => prev.map(video => (video.id === videoId ? updatedVideo : video)));
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  // Move videos to a folder
  const moveVideos = async (videoIds: string[], targetFolderId: string) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/videos/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds, targetFolderId })
      });
      const movedVideos = await response.json();
      setVideos(prev => prev.map(video => (videoIds.includes(video.id) ? { ...video, folderId: targetFolderId } : video)));
    } catch (error) {
      console.error('Failed to move videos:', error);
    }
  };

  // Delete videos
  const deleteVideos = async (videoIds: string[]) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/videos/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds })
      });
      const deletedVideos = await response.json();
      setVideos(prev => prev.filter(video => !videoIds.includes(video.id)));
    } catch (error) {
      console.error('Failed to delete videos:', error);
    }
  };

  // Add a new video
  const addVideo = async (url: string) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const newVideo = await response.json();
      setVideos(prev => [newVideo, ...prev]);
    } catch (error) {
      console.error('Failed to save video:', error);
    }
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
