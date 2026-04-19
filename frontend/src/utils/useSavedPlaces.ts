import { useState, useCallback, useEffect } from 'react';
import { LocationData } from '../components/LocationCard';

export interface SavedPlace {
  id: string;               // `${videoId}_${name}` — stable, unique
  videoId: string;
  savedAt: string;          // ISO date
  location: LocationData;
  videoTitle?: string;
  thumbnailUrl?: string;
}

const STORAGE_KEY = 'recolekt_saved_places';

function load(): SavedPlace[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function persist(places: SavedPlace[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(places)); } catch {}
}

export function useSavedPlaces() {
  const [places, setPlaces] = useState<SavedPlace[]>(load);

  const save = useCallback((
    videoId: string,
    location: LocationData,
    meta?: { videoTitle?: string; thumbnailUrl?: string },
  ) => {
    const id = `${videoId}_${(location.name ?? 'place').replace(/\s+/g, '_')}`;
    setPlaces(prev => {
      if (prev.some(p => p.id === id)) return prev;          // already pinned
      const next = [{ id, videoId, savedAt: new Date().toISOString(), location, ...meta }, ...prev];
      persist(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setPlaces(prev => { const next = prev.filter(p => p.id !== id); persist(next); return next; });
  }, []);

  const isPinned = useCallback((videoId: string, name?: string) => {
    const id = `${videoId}_${(name ?? 'place').replace(/\s+/g, '_')}`;
    return places.some(p => p.id === id);
  }, [places]);

  return { places, save, remove, isPinned };
}
