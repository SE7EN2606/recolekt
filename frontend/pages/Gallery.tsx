import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { VideoCard } from '../components/VideoCard';
import { Button } from '../components/Button';
import { Search, X, FolderInput, CheckCircle2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';

// --- ICONS ---
const CalendarArrowUp = ({ size = 20 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m14 18 4-4 4 4"/><path d="M16 2v4"/><path d="M18 22v-8"/><path d="M21 11.343V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2-2v14a2 2 0 0 0 2 2h9"/><path d="M3 10h18"/><path d="M8 2v4"/></svg>
);
const CalendarArrowDown = ({ size = 20 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m14 18 4 4 4-4"/><path d="M16 2v4"/><path d="M18 14v8"/><path d="M21 11.354V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2-2v14a2 2 0 0 0 2 2h7.343"/><path d="M3 10h18"/><path d="M8 2v4"/></svg>
);

const API_BASE = import.meta.env.VITE_API_BASE; // Utilise uniquement la variable d'environnement

export const Gallery: React.FC = () => {
  const { folderId } = useParams<{ folderId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const { user, loading: authLoading } = useAuth();
  
  // ✅ USE DATACONTEXT - NO LOCAL FETCH
  const { videos, folders, isLoading: dataLoading, refreshVideos } = useData();

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [targetFolderId, setTargetFolderId] = useState<string>('');
  const [showSkeleton, setShowSkeleton] = useState(true);

  // 🔍 DEBUG
  console.log('🎯 Gallery rendering with', videos.length, 'videos from DataContext');
  if (videos.length > 0) {
    console.log('🎯 First video in Gallery:', videos[0]);
  }

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth', { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (user && videos.length === 0 && !dataLoading) {
      console.log('🔄 Triggering refreshVideos because videos array is empty');
      refreshVideos();
    }
  }, [user, videos.length, dataLoading, refreshVideos]);

  useEffect(() => {
    const newTempId = searchParams.get('new');
    if (newTempId) {
      refreshVideos();
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [searchParams, refreshVideos]);

  useEffect(() => {
    document.body.style.overflow = isMoveModalOpen ? 'hidden' : 'unset';
  }, [isMoveModalOpen]);

  useEffect(() => {
    const timer = setTimeout(() => setShowSkeleton(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const isFavoritesView = folderId === 'favorites';
  const isAllView = !folderId || folderId === 'all';

  let displayedVideos = videos.filter(v => {
    if (isFavoritesView) return v.isFavorite;
    if (isAllView) return true;
    return v.folderId === folderId;
  });

  if (searchQuery) {
    displayedVideos = displayedVideos.filter(v =>
      v.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.author?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  displayedVideos.sort((a, b) => {
    const aProcessing = a.category === 'Processing';
    const bProcessing = b.category === 'Processing';
    if (aProcessing && !bProcessing) return -1;
    if (!aProcessing && bProcessing) return 1;
    const dateA = new Date(a.savedAt || 0).getTime();
    const dateB = new Date(b.savedAt || 0).getTime();
    return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
  });

  console.log('🎯 displayedVideos count:', displayedVideos.length);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const handleMoveSubmit = async () => {
    if (!targetFolderId) return;
    try {
      for (const id of Array.from(selectedIds)) {
        await fetch(`${API_BASE}/api/update_reel/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder_id: targetFolderId }),
          credentials: 'include'
        });
      }
      await refreshVideos();
      setSelectedIds(new Set());
      setSelectionMode(false);
      setIsMoveModalOpen(false);
    } catch (err) { alert('Failed to move videos'); }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0 || !confirm(`Delete ${selectedIds.size} video(s)?`)) return;
    try {
      for (const id of Array.from(selectedIds)) {
        await fetch(`${API_BASE}/api/delete_reel/${id}`, { 
          method: 'DELETE', 
          credentials: 'include' 
        });
      }
      await refreshVideos();
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (err) { alert('Failed to delete videos'); }
  };

  const getProcessingMessage = (video: any) => video.title || "Processing…";

  const getFolderTitle = () => {
    if (isFavoritesView) return 'Favorites';
    if (isAllView) return 'All my videos';
    const topLevelFolder = folders.find(f => f.id === folderId);
    if (topLevelFolder) return topLevelFolder.name;
    for (const folder of folders) {
      const sub = folder.subFolders?.find((s: any) => s.id === folderId);
      if (sub) return sub.name;
    }
    return folderId ? folderId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : 'Gallery';
  };

  if (authLoading) return (
    <div className="w-full pt-8 md:pt-0">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[9/16] rounded-2xl bg-gray-200 animate-pulse" />
        ))}
      </div>
    </div>
  );

  if (!user) return null;

  return (
    <div className="w-full pt-8 md:pt-0 pb-0 md:pb-6">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: -1000px 0; } 100% { background-position: 1000px 0; } }
        @keyframes pulse-glow { 0%, 100% { box-shadow: 0 0 20px rgba(124, 58, 237, 0.3); } 50% { box-shadow: 0 0 30px rgba(124, 58, 237, 0.5); } }
        
        @keyframes scan-y-loop {
          0% { top: 0%; opacity: 0; }
          5% { opacity: 1; }
          45% { top: 100%; opacity: 1; }
          50% { top: 100%; opacity: 0; }
          55% { top: 100%; opacity: 1; }
          95% { top: 0%; opacity: 1; }
          100% { top: 0%; opacity: 0; }
        }

        @keyframes scan-x-loop {
          0% { left: 0%; opacity: 0; }
          5% { opacity: 1; }
          45% { left: 100%; opacity: 1; }
          50% { left: 100%; opacity: 0; }
          55% { left: 100%; opacity: 1; }
          95% { left: 0%; opacity: 1; }
          100% { left: 0%; opacity: 0; }
        }

        @keyframes reveal-grid-y {
          0% { clip-path: inset(0 0 100% 0); opacity: 0; }
          5% { opacity: 0.5; }
          45% { clip-path: inset(0 0 0 0); opacity: 0.5; }
          95% { clip-path: inset(0 0 100% 0); opacity: 0.5; } 
          100% { opacity: 0; }
        }

        @keyframes sequence-h {
           0% { top: 0%; opacity: 1; }
           25% { top: 100%; opacity: 1; }
           50% { top: 0%; opacity: 1; }
           50.1% { opacity: 0; }
           100% { opacity: 0; }
        }
        
        @keyframes sequence-v {
           0% { opacity: 0; }
           50% { opacity: 0; left: 0%; }
           50.1% { opacity: 1; }
           75% { left: 100%; opacity: 1; }
           100% { left: 0%; opacity: 1; }
        }

        .placeholder-skeleton { width: 100%; height: 100%; background: linear-gradient(90deg, #e5e7eb 0%, #f3f4f6 20%, #e5e7eb 40%, #e5e7eb 100%); background-size: 2000px 100%; animation: shimmer 2s linear infinite; }
        .processing-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px); z-index: 10; gap: 12px; overflow: hidden; }
        
        .scan-grid { 
          position: absolute; inset: 0; 
          background-image: linear-gradient(rgba(124, 58, 237, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(124, 58, 237, 0.2) 1px, transparent 1px); 
          background-size: 20px 20px; 
          opacity: 0.3;
        }

        .scan-line-y { 
          position: absolute; left: 0; width: 100%; height: 3px; 
          background: rgba(124, 58, 237, 1); 
          box-shadow: 0 0 20px 4px rgba(124, 58, 237, 0.8); 
          animation: scan-y-loop 4s ease-in-out infinite;
        }

        .scan-line-x {
          position: absolute; top: 0; height: 100%; width: 3px;
          background: rgba(124, 58, 237, 1);
          box-shadow: 0 0 20px 4px rgba(124, 58, 237, 0.8);
          animation: scan-x-loop 4s ease-in-out infinite;
          animation-delay: 2s;
        }

        .scan-line-seq-h {
           position: absolute; left: 0; width: 100%; height: 3px; 
           background: #8b5cf6; 
           box-shadow: 0 0 15px 2px rgba(139, 92, 246, 0.8);
           animation: sequence-h 6s ease-in-out infinite;
        }

        .scan-line-seq-v {
           position: absolute; top: 0; height: 100%; width: 3px; 
           background: #8b5cf6;
           box-shadow: 0 0 15px 2px rgba(139, 92, 246, 0.8);
           animation: sequence-v 6s ease-in-out infinite;
        }

        .processing-overlay .spinner { width: 32px; height: 32px; border: 3px solid rgba(255, 255, 255, 0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; }
        .processing-overlay span { color: white; font-size: 12px; font-weight: 600; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); text-align: center; max-width: 140px; line-height: 1.3; }
        .processing-card { animation: pulse-glow 2s ease-in-out infinite; }
      `}</style>

      <div className="flex flex-col gap-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{getFolderTitle()}</h1>
            <p className="text-gray-500 text-sm mt-1">{displayedVideos.length} items</p>
          </div>
          <div className="flex items-center gap-2">
            {selectionMode ? (
              <>
                <Button variant="outline" size="sm" className="h-9 px-5" onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}>Cancel</Button>
                <Button variant="primary" size="sm" className="h-9 px-5" disabled={selectedIds.size === 0} onClick={() => setIsMoveModalOpen(true)}>Move {selectedIds.size > 0 && `(${selectedIds.size})`}</Button>
                <Button variant="danger" size="sm" className="h-9 px-5" disabled={selectedIds.size === 0} onClick={handleDelete}>Delete {selectedIds.size > 0 && `(${selectedIds.size})`}</Button>
              </>
            ) : (
              <Button variant="outline" size="sm" className="h-9 px-5" onClick={() => setSelectionMode(true)}>Manage</Button>
            )}
          </div>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <div className="relative flex-1 w-full md:w-3/4">
            <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none shadow-sm transition-shadow hover:border-gray-300" />
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          <button onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')} className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-600 shadow-sm h-[46px] w-[46px] flex items-center justify-center">
            {sortOrder === 'desc' ? <CalendarArrowUp size={20} /> : <CalendarArrowDown size={20} />}
          </button>
        </div>
      </div>

      {(showSkeleton || (dataLoading && videos.length === 0)) && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-3 mb-24 md:mb-12">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="relative aspect-[9/16] rounded-2xl bg-gray-200 overflow-hidden">
              <div className="placeholder-skeleton" />
            </div>
          ))}
        </div>
      )}

      {displayedVideos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-3 mb-24 md:mb-12">
          {displayedVideos.map((video) => {
            console.log('🎯 Rendering video card for:', video.id, 'category:', video.category);
            return (
              <div key={video.id} className="relative">
                {video.category === 'Processing' ? (
                  <div className="relative aspect-[9/16] rounded-2xl bg-gray-200 overflow-hidden processing-card cursor-default">
                    {video.thumbnailUrl ? (
                      <img src={video.thumbnailUrl} alt="Processing" loading="lazy" crossOrigin="anonymous" className="absolute inset-0 w-full h-full object-cover blur-sm opacity-80" />
                    ) : (
                      <div className="placeholder-skeleton" />
                    )}
                    <div className="processing-overlay">
                      <div className="scan-grid" />
                      <div className="scan-line-seq-h" />
                      <div className="scan-line-seq-v" />
                      <div className="spinner mb-2" />
                      <span>{getProcessingMessage(video)}</span>
                    </div>
                  </div>
                ) : (
                  <VideoCard video={video} selectionMode={selectionMode} selected={selectedIds.has(video.id)} onToggleSelect={() => toggleSelect(video.id)} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {!dataLoading && displayedVideos.length === 0 && (
        <div className="py-20 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="text-gray-400" size={24} />
          </div>
          <h3 className="text-gray-900 font-medium">No videos found</h3>
          <p className="text-gray-500 text-sm mt-1">{searchQuery ? 'Try a different search term' : 'No videos in this folder yet'}</p>
        </div>
      )}

      {isMoveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-up">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Move to Folder</h3>
              <button onClick={() => setIsMoveModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <button onClick={() => setTargetFolderId('default')} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${targetFolderId === 'default' ? 'bg-primary-50 text-primary-700 ring-2 ring-primary-500 ring-inset' : 'hover:bg-gray-50 text-gray-700'}`}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${targetFolderId === 'default' ? 'bg-white' : 'bg-gray-100'}`}>
                    <FolderInput size={20} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold">All my videos</p>
                    <p className="text-xs opacity-70">Default folder</p>
                  </div>
                  {targetFolderId === 'default' && <CheckCircle2 size={20} className="text-primary-600" />}
                </button>
                {folders.map(f => (
                  <React.Fragment key={f.id}>
                    <button onClick={() => setTargetFolderId(f.id)} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${targetFolderId === f.id ? 'bg-primary-50 text-primary-700 ring-2 ring-primary-500 ring-inset' : 'hover:bg-gray-50 text-gray-700'}`}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${targetFolderId === f.id ? 'bg-white' : 'bg-gray-100'}`}>
                        <span className="text-lg">{f.emoji}</span>
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-semibold">{f.name}</p>
                        <p className="text-xs opacity-70">{f.videoCount || 0} videos</p>
                      </div>
                      {targetFolderId === f.id && <CheckCircle2 size={20} className="text-primary-600" />}
                    </button>
                    {f.subFolders?.map(sub => (
                      <button key={sub.id} onClick={() => setTargetFolderId(sub.id)} className={`w-full flex items-center gap-3 p-3 pl-8 rounded-xl transition-all ${targetFolderId === sub.id ? 'bg-primary-50 text-primary-700 ring-2 ring-primary-500 ring-inset' : 'hover:bg-gray-50 text-gray-700'}`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${targetFolderId === sub.id ? 'bg-white' : 'bg-gray-100'}`}>
                          <span className="text-sm">{sub.emoji}</span>
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-semibold text-sm">{sub.name}</p>
                        </div>
                        {targetFolderId === sub.id && <CheckCircle2 size={18} className="text-primary-600" />}
                      </button>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsMoveModalOpen(false)}>Cancel</Button>
              <Button variant="primary" disabled={!targetFolderId} onClick={handleMoveSubmit}>Move Videos</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
