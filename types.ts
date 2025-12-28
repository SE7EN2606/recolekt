import React from 'react';

export interface Video {
  id: string;
  title: string;
  author: string;
  platform: 'instagram' | 'youtube' | 'tiktok';
  thumbnailUrl: string;
  duration: string;
  savedAt: string; // Using string for display, but we might treat as date
  category: string;
  subCategory?: string;
  tags: string[];
  summary: string;
  bullets: string[];
  transcript: string;
  originalUrl: string;
  views?: string;
  // New persistence fields
  isFavorite: boolean;
  folderId: string;
  favoritedAt?: string; // ISO string for sorting
}

export interface Folder {
  id: string;
  name: string;
  itemCount: number;
  coverUrl?: string;
  subFolders?: Folder[];
}

export interface NavigationItem {
  label: string;
  path: string;
  icon: React.ElementType;
}
