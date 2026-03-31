import { API_BASE } from "../utils/api";
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { VideoCard } from '../components/VideoCard';
import { Button } from '../components/Button';
import { Search, Settings2, Trash2, Loader2, CircleX } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { MoveCollectionModal } from '../components/MoveCollectionModal';

const CalendarArrowUp = ({ size = 20 }) => ( <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m14 18 4-4 4 4"/><path d="M16 2v4"/><path d="M18 22v-8"/><path d="M21 11.343V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2-2v14a2 2 0 0 0 2 2h9"/><path d="M3 10h18"/><path d="M8 2v4"/></svg> );
const CalendarArrowDown = ({ size = 20 }) => ( <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m14 18 4 4 4-4"/><path d="M16 2v4"/><path d="M18 14v8"/><path d="M21 11.354V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2-2v14a2 2 0 0 0 2 2h7.343"/><path d="M3 10h18"/><path d="M8 2v4"/></svg> );

const PROCESSING_MESSAGES = [
  'msg_indexing', 'msg_parsing', 'msg_visual', 'msg_auditory', 
  'msg_analysing', 'msg_decoding', 'msg_semantic', 'msg_contextual', 
  'msg_identifying', 'msg_mapping', 'msg_inferring', 'msg_correlating', 
  'msg_synthesizing', 'msg_distilling', 'msg_abstracting', 'msg_interpreting', 
  'msg_ideating', 'msg_curating', 'msg_refining', 'msg_tuning', 
  'msg_optimizing', 'msg_polishing', 'msg_finalizing'
];

export const Gallery: React.FC = () => {
  const { folderId } = useParams<{ folderId?: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const { user, loading: authLoading } = useAuth();
  const { videos, folders, isLoading: dataLoading, refreshVideos, moveVideos, deleteVideos } = useData();
  const { t } = useTranslation(['gallery', 'common', 'sidebar']);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  
  const [msgIndex, setMsgIndex] = useState(0);
  const [scanState, setScanState] = useState<'h-active' | 'v-active'>('h-active');

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
  }, [folderId, location.pathname, location.key]);

  useEffect(() => {
    const hasProcessing = videos.some((v: any) => v.category === 'Processing' || v.status === 'processing');
    if (!hasProcessing) return;

    const msgInterval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % PROCESSING_MESSAGES.length);
    }, 2000);

    const scanSequencer = setInterval(() => {
      setScanState((prev) => (prev === 'h-active' ? 'v-active' : 'h-active'));
    }, 4000);

    return () => {
      clearInterval(msgInterval);
      clearInterval(scanSequencer);
    };
  }, [videos]);

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
      filtered = filtered.filter((v: any) => {
        let summaryObj = v.summary || {};
        if (typeof summaryObj === 'string') { try { summaryObj = JSON.parse(summaryObj); } catch(e) { summaryObj = {}; } }
        const searchTitle = summaryObj?.english?.title || summaryObj?.title || v.summary_title || v.title || '';
        return searchTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
               (v.author || '').toLowerCase().includes(searchQuery.toLowerCase());
      });
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
    if (isAllView) return t('gallery:myVideos');
    if (isUnsortedView) return t('sidebar:unsorted', 'Unsorted');
    
    const foundFolder = folders.find((f: any) => f.id === folderId);
    if (foundFolder) return foundFolder.name;
    for (const f of folders) {
      const sub = f.subFolders?.find((s: any) => s.id === folderId);
      if (sub) return sub.name;
    }
    return folderId ? folderId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : t('gallery:gallery');
  };

  const getFolderSubtitle = () => {
    if (isFavoritesView) return t('gallery:subtitleFavorites', 'Your most loved videos in one place');
    if (isAllView) return t('gallery:subtitleAll', 'Browse, search, and manage all your saved videos');
    if (isUnsortedView) return t('gallery:subtitleUnsorted', 'Videos waiting to be organized into collections');
    return t('gallery:subtitleFolder', 'Manage videos in this collection');
  };

  const getThumbnail = (video: any): string => {
    return (
      video?.posterUrl || 
      video?.coverUrl ||
      video?.gcs_urls?.poster || 
      video?.thumbnailUrl || 
      video?.thumbnail_url || 
      video?.gcs_urls?.preview_thumbnail || 
      ''
    );
  };
  
  const showSkeleton = authLoading || (dataLoading && videos.length === 0);

  if (showSkeleton) return (
    <div className="w-full pt-4 md:pt-0 animate-pulse">
      <div className="h-8 bg-gray-200 rounded-lg w-48 mb-2" />
      <div className="h-4 bg-gray-100 rounded-lg w-64 mb-8" />
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
        <div className="flex items-start justify-between">
          <div>
            {selectionMode ? (
              <>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">
                  {t('gallery:moveModeOn', 'Move mode on')}
                </h1>
                <p className="text-gray-500 text-xs md:text-sm mt-1">
                  {t('gallery:moveModeHint', 'Select videos then tap Move')}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">{getFolderTitle()}</h1>
                <p className="text-gray-500 text-xs md:text-sm mt-1">{getFolderSubtitle()}</p>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {!selectionMode && (
              <p className="text-gray-500 text-xs font-medium whitespace-nowrap hidden sm:block">
                {displayedVideos.length} {t('gallery:items', 'items')}
              </p>
            )}
            <div className="flex items-center gap-1.5">
              {selectionMode ? (
                <>
                  <button 
                    onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors mr-1"
                    title={t('common:cancel', 'Cancel')}
                  >
                    <CircleX size={26} strokeWidth={1.5} />
                  </button>
                  <Button variant="primary" size="sm" className="h-10 px-3 md:px-6 gap-1.5 whitespace-nowrap" disabled={selectedIds.size === 0} onClick={() => setIsMoveModalOpen(true)}>
                    <span className="truncate max-w-[60px] md:max-w-none">{t('gallery:move')}</span>
                    {selectedIds.size > 0 && (
                      <span className="flex-shrink-0 bg-white/20 px-1.5 py-0.5 rounded text-[10px] font-bold min-w-[20px] text-center">{selectedIds.size}</span>
                    )}
                  </Button>
                  <button onClick={handleDelete} disabled={selectedIds.size === 0} className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50">
                    <Trash2 size={20} />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setSelectionMode(true)}
                  className="flex items-center gap-1.5 pl-2.5 pr-3.5 h-9 rounded-full bg-gray-100 text-gray-600 hover:bg-primary-100 hover:text-primary-600 active:scale-90 active:bg-primary-200 transition-all duration-200 shadow-sm"
                  title={t('gallery:manage', 'Manage')}
                >
                  <Settings2 size={16} aria-hidden="true" />
                  <span className="text-sm font-medium">{t('gallery:manage', 'Manage')}</span>
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

          return (
            <div
              key={videoId}
              draggable={!selectionMode && video.category !== 'Processing'}
              onDragStart={(e) => {
                let idsToMove = [videoId];
                if (selectedIds.has(videoId)) idsToMove = Array.from(selectedIds);
                e.dataTransfer.setData('videoIds', JSON.stringify(idsToMove));
                e.dataTransfer.setData('sourceId', video.folderId || 'unsorted');
                e.dataTransfer.effectAllowed = 'move';
              }}
              className={!selectionMode && video.category !== 'Processing' ? "cursor-grab active:cursor-grabbing" : ""}
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
      
      {/* GLOBAL STYLES FOR THE PROCESSING SKELETON */}
      <style>{`
        /* PERFECT BOUNDS SCANNER - Hardware Accelerated (Translate3D) */
        @keyframes scan-h { 
          0% { transform: translate3d(0, 0%, 0); opacity: 0; } 
          5% { transform: translate3d(0, 0%, 0); opacity: 1; } 
          50% { transform: translate3d(0, 100%, 0); opacity: 1; } 
          95% { transform: translate3d(0, 0%, 0); opacity: 1; }
          100% { transform: translate3d(0, 0%, 0); opacity: 0; } 
        }
        @keyframes scan-v { 
          0% { transform: translate3d(0%, 0, 0); opacity: 0; } 
          5% { transform: translate3d(0%, 0, 0); opacity: 1; } 
          50% { transform: translate3d(100%, 0, 0); opacity: 1; } 
          95% { transform: translate3d(0%, 0, 0); opacity: 1; }
          100% { transform: translate3d(0%, 0, 0); opacity: 0; } 
        }

        .h-active { animation: scan-h 4s linear forwards; }
        .v-active { animation: scan-v 4s linear forwards; }
        .idle { opacity: 0; }

        /* GPU-Safe Lowercase AI Text Reveal */
        @keyframes ai-text-reveal {
          0% { opacity: 0; filter: blur(6px); transform: translate3d(-8px, 0, 0); }
          15% { opacity: 1; filter: blur(0px); transform: translate3d(0, 0, 0); }
          85% { opacity: 1; filter: blur(0px); transform: translate3d(0, 0, 0); }
          100% { opacity: 0; filter: blur(6px); transform: translate3d(8px, 0, 0); }
        }
        .ai-message {
          animation: ai-text-reveal 2s cubic-bezier(0.1, 0.9, 0.2, 1) forwards;
        }
      `}</style>
    </div>
  );
};
