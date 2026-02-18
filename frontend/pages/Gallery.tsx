import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { VideoCard } from '../components/VideoCard';
import { Button } from '../components/Button';
import { Search, X, FolderOpen, Folders, CheckCircle2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth, getAuthHeaders } from '../context/AuthContext';

// --- ICONS ---
const CalendarArrowUp = ({ size = 20 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m14 18 4-4 4 4" />
    <path d="M16 2v4" />
    <path d="M18 22v-8" />
    <path d="M21 11.343V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2-2v14a2 2 0 0 0 2 2h9" />
    <path d="M3 10h18" />
    <path d="M8 2v4" />
  </svg>
);

const CalendarArrowDown = ({ size = 20 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m14 18 4 4 4-4" />
    <path d="M16 2v4" />
    <path d="M18 14v8" />
    <path d="M21 11.354V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2-2v14a2 2 0 0 0 2 2h7.343" />
    <path d="M3 10h18" />
    <path d="M8 2v4" />
  </svg>
);

// IMPORTANT: use ?? so empty string is allowed (for same-origin /api via Netlify proxy)
const RAW_API_BASE =
  (import.meta.env.VITE_API_BASE ?? import.meta.env.VITE_API_URL ?? '') as string;

const API_BASE = String(RAW_API_BASE).replace(/\/+$/, '');

function joinUrl(base: string, path: string) {
  const p = String(path || '').replace(/^\/+/, '');

  // If base is empty => same-origin
  if (!base) return `/${p}`;

  const b = String(base || '').replace(/\/+$/, '');
  return `${b}/${p}`;
}

const isDev = Boolean((import.meta as any).env?.DEV);

export const Gallery: React.FC = () => {
  const { folderId } = useParams<{ folderId?: string }>();
  const [searchParams] = useSearchParams();

  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const { videos, folders, isLoading: dataLoading, refreshVideos } = useData();

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [targetFolderId, setTargetFolderId] = useState<string>('');
  const [showSkeleton, setShowSkeleton] = useState(true);

  // Count videos per folder (used in move modal)
  const getVideoCount = (fid: string) => videos.filter((v) => v.folderId === fid).length;

  if (isDev) {
    console.log('🎯 Gallery render', 'authLoading=', authLoading, 'user=', !!user, 'videos=', videos.length);
  }

  // Removed: the “videos empty after login -> refreshVideos()” effect
  // DataContext already fetches on login; this effect caused extra duplicate calls. [file:4]

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

  const displayedVideos = useMemo(() => {
    let list = videos.filter((v) => {
      if (isFavoritesView) return v.isFavorite;
      if (isAllView) return true;
      return v.folderId === folderId;
    });

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (v) =>
          (v.title || '').toLowerCase().includes(q) ||
          // FIX: Video has "author" (set in DataContext), not "author_name" [file:4]
          (v.author || '').toLowerCase().includes(q),
      );
    }

    list.sort((a, b) => {
      const aProcessing = a.category === 'Processing';
      const bProcessing = b.category === 'Processing';
      if (aProcessing && !bProcessing) return -1;
      if (!aProcessing && bProcessing) return 1;

      const dateA = new Date(a.savedAt || 0).getTime();
      const dateB = new Date(b.savedAt || 0).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    if (isDev) console.log('🎯 displayedVideos count:', list.length);
    return list;
  }, [videos, folderId, isFavoritesView, isAllView, searchQuery, sortOrder]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleMoveSubmit = async () => {
    if (!targetFolderId) return;

    try {
      const idsArray = Array.from(selectedIds);

      for (const id of idsArray) {
        const encodedId = encodeURIComponent(String(id));
        const url = joinUrl(API_BASE, `/api/update/${encodedId}`);

        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ folder_id: targetFolderId }),
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error(`Failed to update video ${id}: ${response.status}`);
        }
      }

      await refreshVideos();

      setSelectedIds(new Set());
      setSelectionMode(false);
      setIsMoveModalOpen(false);
    } catch (err) {
      console.error('❌ Failed to move videos:', err);
      alert('Failed to move videos. Please try again.');
    }
  };

  const getProcessingMessage = (video: any) => video.title || 'Processing…';

  const getFolderTitle = () => {
    if (isFavoritesView) return 'Favorites';
    if (isAllView) return 'All my videos';

    const topLevelFolder = folders.find((f) => f.id === folderId);
    if (topLevelFolder) return topLevelFolder.name;

    for (const folder of folders) {
      const sub = folder.subFolders?.find((s: any) => s.id === folderId);
      if (sub) return sub.name;
    }

    return folderId
      ? folderId
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
      : 'Gallery';
  };

  if (authLoading) {
    return (
      <div className="w-full pt-8 md:pt-0">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[9/16] rounded-2xl bg-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Recolekt</h2>
          <p className="text-gray-600 mb-6">Sign in to save and organize your favorite reels</p>
          <Button variant="primary" onClick={signInWithGoogle}>
            Sign in with Google
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full pt-8 md:pt-0 pb-0 md:pb-6">
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{getFolderTitle()}</h1>
            <p className="text-gray-500 text-sm mt-1">{displayedVideos.length} items</p>
          </div>

          <div className="flex items-center gap-2">
            {selectionMode ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 md:px-5 text-xs md:text-sm"
                  onClick={() => {
                    setSelectionMode(false);
                    setSelectedIds(new Set());
                  }}
                >
                  <span className="hidden md:inline">Cancel</span>
                  <span className="md:hidden">✕</span>
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="h-9 px-3 md:px-5 text-xs md:text-sm whitespace-nowrap"
                  disabled={selectedIds.size === 0}
                  onClick={() => setIsMoveModalOpen(true)}
                >
                  Move{selectedIds.size > 0 && ` (${selectedIds.size})`}
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 md:px-5 text-xs md:text-sm"
                onClick={() => setSelectionMode(true)}
              >
                Manage
              </Button>
            )}
          </div>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <div className="relative flex-1 w-full md:w-3/4">
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none shadow-sm transition-shadow hover:border-gray-300"
            />
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>

          <button
            onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-600 shadow-sm h-[46px] w-[46px] flex items-center justify-center"
          >
            {sortOrder === 'desc' ? <CalendarArrowUp size={20} /> : <CalendarArrowDown size={20} />}
          </button>
        </div>
      </div>

      {(showSkeleton || (dataLoading && videos.length === 0)) && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-3 mb-24 md:mb-12">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="relative aspect-[9/16] rounded-2xl bg-gray-200 overflow-hidden">
              <div className="w-full h-full bg-gray-200 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {displayedVideos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-3 mb-24 md:mb-12">
          {displayedVideos.map((video) => (
            <div key={video.id} className="relative">
              {video.category === 'Processing' ? (
                <div className="relative aspect-[9/16] rounded-2xl bg-gray-200 overflow-hidden cursor-default">
                  {video.thumbnailUrl ? (
                    <img
                      src={video.thumbnailUrl}
                      alt="Processing"
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover blur-sm opacity-80"
                      onError={(e) => {
                        const img = e.currentTarget;
                        img.onerror = null;
                        img.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-200 animate-pulse" />
                  )}

                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm z-10 gap-3 px-3">
                    <div className="w-8 h-8 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span className="text-white text-xs font-semibold text-center leading-snug">
                      {getProcessingMessage(video)}
                    </span>
                  </div>
                </div>
              ) : (
                <VideoCard
                  video={video}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(video.id)}
                  onToggleSelect={() => toggleSelect(video.id)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {!dataLoading && displayedVideos.length === 0 && (
        <div className="py-20 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="text-gray-400" size={24} />
          </div>
          <h3 className="text-gray-900 font-medium">No videos found</h3>
          <p className="text-gray-500 text-sm mt-1">
            {searchQuery ? 'Try a different search term' : 'No videos in this folder yet'}
          </p>
        </div>
      )}

      {isMoveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Move to Folder</h3>
              <button onClick={() => setIsMoveModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <button
                  onClick={() => setTargetFolderId('default')}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                    targetFolderId === 'default'
                      ? 'bg-primary-50 text-primary-700 ring-2 ring-primary-500 ring-inset'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      targetFolderId === 'default' ? 'bg-white' : 'bg-gray-100'
                    }`}
                  >
                    <Folders
                      size={20}
                      className={targetFolderId === 'default' ? 'text-primary-600' : 'text-gray-600'}
                    />
                  </div>

                  <div className="flex-1 text-left">
                    <p className="font-semibold">All my videos</p>
                    <p className="text-xs opacity-70">Default folder</p>
                  </div>

                  {targetFolderId === 'default' && <CheckCircle2 size={20} className="text-primary-600" />}
                </button>

                {folders.map((f: any) => {
                  const folId = String(f?.id || '');
                  const folderName = String(f?.name || 'Untitled');

                  return (
                    <React.Fragment key={folId}>
                      <button
                        onClick={() => setTargetFolderId(folId)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                          targetFolderId === folId
                            ? 'bg-primary-50 text-primary-700 ring-2 ring-primary-500 ring-inset'
                            : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            targetFolderId === folId ? 'bg-white' : 'bg-gray-100'
                          }`}
                        >
                          <FolderOpen
                            size={20}
                            className={targetFolderId === folId ? 'text-primary-600' : 'text-gray-600'}
                          />
                        </div>

                        <div className="flex-1 text-left">
                          <p className="font-semibold">{folderName}</p>
                          <p className="text-xs opacity-70">{getVideoCount(folId)} videos</p>
                        </div>

                        {targetFolderId === folId && <CheckCircle2 size={20} className="text-primary-600" />}
                      </button>

                      {Array.isArray(f?.subFolders) &&
                        f.subFolders.map((sub: any) => {
                          const subId = String(sub?.id || '');
                          const subName = String(sub?.name || 'Untitled');

                          return (
                            <button
                              key={subId}
                              onClick={() => setTargetFolderId(subId)}
                              className={`w-full flex items-center gap-3 p-3 pl-8 rounded-xl transition-all ${
                                targetFolderId === subId
                                  ? 'bg-primary-50 text-primary-700 ring-2 ring-primary-500 ring-inset'
                                  : 'hover:bg-gray-50 text-gray-700'
                              }`}
                            >
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                  targetFolderId === subId ? 'bg-white' : 'bg-gray-100'
                                }`}
                              >
                                <FolderOpen
                                  size={18}
                                  className={targetFolderId === subId ? 'text-primary-600' : 'text-gray-600'}
                                />
                              </div>

                              <div className="flex-1 text-left">
                                <p className="font-semibold text-sm">{subName}</p>
                              </div>

                              {targetFolderId === subId && <CheckCircle2 size={18} className="text-primary-600" />}
                            </button>
                          );
                        })}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsMoveModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!targetFolderId} onClick={handleMoveSubmit}>
                Move Videos
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
