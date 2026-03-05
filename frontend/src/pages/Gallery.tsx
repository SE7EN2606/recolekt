import { API_BASE } from "../utils/api";
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { VideoCard } from '../components/VideoCard';
import { Button } from '../components/Button';
import { Search, Settings2, Trash2, Loader2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { MoveCollectionModal } from '../components/MoveCollectionModal';

const CalendarArrowUp = ({ size = 20 }) => ( <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m14 18 4-4 4 4"/><path d="M16 2v4"/><path d="M18 22v-8"/><path d="M21 11.343V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2-2v14a2 2 0 0 0 2 2h9"/><path d="M3 10h18"/><path d="M8 2v4"/></svg> );
const CalendarArrowDown = ({ size = 20 }) => ( <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m14 18 4 4 4-4"/><path d="M16 2v4"/><path d="M18 14v8"/><path d="M21 11.354V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2-2v14a2 2 0 0 0 2 2h7.343"/><path d="M3 10h18"/><path d="M8 2v4"/></svg> );

export const Gallery: React.FC = () => {
  const { folderId } = useParams<{ folderId?: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const { user, loading: authLoading } = useAuth();
  const { videos, folders, isLoading: dataLoading, refreshVideos, moveVideos, deleteVideos } = useData();
  const { t } = useTranslation(['gallery', 'common']);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth', { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    const newTempId = searchParams.get('new');
    if (newTempId) {
      refreshVideos();
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [searchParams, refreshVideos]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [folderId, location.pathname]);

  const isFavoritesView = folderId === 'favorites';
  const isAllView = !folderId || folderId === 'all';
  const isUnsortedView = folderId === 'unsorted';

  const displayedVideos = useMemo(() => {
    let filtered = videos.filter((v: any) => {
      if (isFavoritesView) return v.isFavorite;
      if (isAllView) return true;
      if (isUnsortedView) return !v.folderId || v.folderId === 'unsorted' || v.folderId === 'all';
      return v.folderId === folderId;
    });

    if (searchQuery) {
      filtered = filtered.filter((v: any) =>
        v.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.author?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered.sort((a: any, b: any) => {
      const aProcessing = a.category === 'Processing' || a.status === 'processing';
      const bProcessing = b.category === 'Processing' || b.status === 'processing';
      if (aProcessing && !bProcessing) return -1;
      if (!aProcessing && bProcessing) return 1;
      const dateA = new Date(a.savedAt || a.created_at || 0).getTime();
      const dateB = new Date(b.savedAt || b.created_at || 0).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });
  }, [videos, folderId, isFavoritesView, isAllView, isUnsortedView, searchQuery, sortOrder]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const handleMoveSubmit = async (targetId: string) => {
    try {
      await moveVideos(Array.from(selectedIds), targetId);
      setSelectedIds(new Set());
      setSelectionMode(false);
      setIsMoveModalOpen(false);
    } catch (err) {
      alert(t('gallery:moveFailed', 'Failed to move videos'));
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0 || !confirm(t('gallery:confirmDelete', `Delete ${selectedIds.size} video(s)?`))) return;
    try {
      await deleteVideos(Array.from(selectedIds));
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (err) {
      alert(t('gallery:deleteFailed', 'Failed to delete videos'));
    }
  };

  const getFolderTitle = () => {
    if (isFavoritesView) return t('gallery:favorites');
    if (isAllView) return t('gallery:allVideos');
    if (isUnsortedView) return t('sidebar:unsorted', 'Unsorted');
    
    const foundFolder = folders.find((f: any) => f.id === folderId);
    if (foundFolder) return foundFolder.name;
    for (const f of folders) {
      const sub = f.subFolders?.find((s: any) => s.id === folderId);
      if (sub) return sub.name;
    }
    return folderId ? folderId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : t('gallery:gallery');
  };

  const getThumbnail = (video: any): string => video?.thumbnailUrl || video?.thumbnail_url || video?.gcs_urls?.preview_thumbnail || video?.gcsUrls?.previewThumbnail || '';

  const showSkeleton = authLoading || (dataLoading && videos.length === 0);

  if (showSkeleton) return (
    <div className="w-full pt-4 md:pt-0 animate-pulse">
      <div className="h-8 bg-gray-200 rounded-lg w-48 mb-8" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[9/16] rounded-2xl bg-gray-200/60" />
        ))}
      </div>
    </div>
  );

  if (!user) return null;

  return (
    <div className="w-full pt-4 md:pt-0 pb-0 md:pb-6 animate-fade-in">
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{getFolderTitle()}</h1>
          
          <div className="flex items-center gap-2">
            {!selectionMode && (
              <p className="text-gray-500 text-xs font-medium whitespace-nowrap">
                {displayedVideos.length} {t('gallery:items', 'items')}
              </p>
            )}
            <div className="flex items-center gap-1.5">
              {selectionMode ? (
                <>
                  <Button variant="ghost" size="sm" className="h-10 px-4 text-gray-500" onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}>{t('common:cancel')}</Button>
                  <Button variant="primary" size="sm" className="h-10 px-6 gap-2" disabled={selectedIds.size === 0} onClick={() => setIsMoveModalOpen(true)}>
                    <span>{t('gallery:move')}</span>
                    {selectedIds.size > 0 && (
                      <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] font-bold min-w-[20px] text-center">{selectedIds.size}</span>
                    )}
                  </Button>
                  <button onClick={handleDelete} disabled={selectedIds.size === 0} className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50">
                    <Trash2 size={20} />
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => setSelectionMode(true)} 
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-primary-100 hover:text-primary-600 active:scale-90 active:bg-primary-200 transition-all duration-200 shadow-sm" 
                  title={t('gallery:selectVideos', 'Select Videos')}
                >
                  <Settings2 size={18} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <div className="relative flex-1">
            <input 
              type="text" placeholder={t('common:search')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none shadow-sm transition-all hover:bg-white/80"
            />
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          <button onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')} className="p-3 bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl hover:bg-white/80 transition-colors text-gray-600 shadow-sm h-[46px] w-[46px] flex items-center justify-center">
            {sortOrder === 'desc' ? <CalendarArrowUp size={20} /> : <CalendarArrowDown size={20} />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-24 md:mb-12">
        {displayedVideos.map((video: any) => {
          const videoId = video?.id ?? video?.process_id ?? video?.processId ?? '';
          const thumb = getThumbnail(video);
          
          if (video.category === 'Processing' || video.status === 'processing') {
            return (
              <div key={videoId} className="relative aspect-[9/16] rounded-2xl bg-black overflow-hidden cursor-default">
                {thumb ? (
                  <img src={thumb} alt="Processing" className="absolute inset-0 w-full h-full object-cover opacity-60 blur-md scale-110" />
                ) : (
                  <div className="absolute inset-0 bg-gray-900 animate-pulse" />
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-10">
                  <Loader2 className="w-10 h-10 text-white animate-spin mb-3" />
                  <span className="text-white text-xs font-bold tracking-widest uppercase">{t('gallery:processing')}</span>
                </div>
              </div>
            );
          }

          return (
            <div 
              key={videoId}
              draggable={!selectionMode}
              onDragStart={(e) => {
                // ✅ MULTI-DRAG SUPPORT: Bundle all selected IDs into JSON
                let idsToMove = [videoId];
                if (selectedIds.has(videoId)) {
                  idsToMove = Array.from(selectedIds);
                }
                e.dataTransfer.setData('videoIds', JSON.stringify(idsToMove));
                e.dataTransfer.setData('sourceId', video.folderId || 'unsorted');
                e.dataTransfer.effectAllowed = 'move';
              }}
              className={!selectionMode ? "cursor-grab active:cursor-grabbing" : ""}
            >
              <VideoCard 
                video={video} 
                selectionMode={selectionMode}
                selected={selectedIds.has(videoId)}
                onToggleSelect={() => toggleSelect(videoId)}
              />
            </div>
          );
        })}
      </div>

      {!dataLoading && displayedVideos.length === 0 && (
        <div className="py-20 text-center animate-fade-in">
          <div className="w-16 h-16 bg-white/40 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4 border border-white/40">
            <Search className="text-gray-400" size={24} />
          </div>
          <h3 className="text-gray-900 font-medium">{t('gallery:noVideosFound')}</h3>
          <p className="text-gray-500 text-sm mt-1">{searchQuery ? t('gallery:tryDifferentSearch') : t('gallery:noVideosInFolder')}</p>
        </div>
      )}

      <MoveCollectionModal isOpen={isMoveModalOpen} onClose={() => setIsMoveModalOpen(false)} onMove={handleMoveSubmit} count={selectedIds.size} />
    </div>
  );
};