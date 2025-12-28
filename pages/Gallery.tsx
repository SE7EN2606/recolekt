import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { VideoCard } from '../components/VideoCard';
import { Button } from '../components/Button';
import { Search } from 'lucide-react';
import { normalizeReel } from '../services/normalizeReel';

// Custom Icon: Calendar Arrow Up (Newest/Desc)
const CalendarArrowUp = ({ size = 20 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m14 18 4-4 4 4"/><path d="M16 2v4"/><path d="M18 22v-8"/><path d="M21 11.343V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2-2v14a2 2 0 0 0 2 2h9"/><path d="M3 10h18"/><path d="M8 2v4"/>
  </svg>
);

// Custom Icon: Calendar Arrow Down (Oldest/Asc)
const CalendarArrowDown = ({ size = 20 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m14 18 4 4 4-4"/><path d="M16 2v4"/><path d="M18 14v8"/><path d="M21 11.354V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2-2v14a2 2 0 0 0 2 2h7.343"/><path d="M3 10h18"/><path d="M8 2v4"/>
  </svg>
);

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5001";

type Reel = ReturnType<typeof normalizeReel>;

export const Gallery: React.FC = () => {
  const { folderId } = useParams<{ folderId?: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [reels, setReels] = useState<Reel[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Move Modal State
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [targetFolderId, setTargetFolderId] = useState<string>('');

  // ✅ Handle new reel placeholder from URL params (only once)
  useEffect(() => {
    const newTempId = searchParams.get('new');
    const newUrl = searchParams.get('url');

    if (newTempId && newUrl) {
      const temp: Reel = {
        id: newTempId,
        process_id: newTempId,
        isTemp: true,
        is_favorite: false,
        status: 'processing',
        folder_id: 'default',
        source_url: decodeURIComponent(newUrl),
        created_at: new Date().toISOString(),
        summary: {
          category: 'General',
          title: 'Processing…',
          topic: '',
          bullets: [],
          emojis: [],
          hashtags: []
        },
        gcs_urls: {
          video: null,
          thumbnail: null,
          preview_thumbnail: null,
          caption_json: null,
          transcription: null,
          result_json: null
        },
        caption: '',
        author_name: '',
        transcription: { transcript: '' },
        content_type: 'generic',  // ✅ ADD THIS
        recipe: null,              // ✅ ADD THIS
        duration: null,            // ✅ ADD THIS
      };

      // ✅ Only add if not already in the list
      setReels((prev) => {
        const exists = prev.some(r => r.process_id === newTempId || r.source_url === decodeURIComponent(newUrl));
        if (exists) return prev;
        return [temp, ...prev];
      });

      // ✅ Clear URL params immediately to prevent re-adding
      navigate(location.pathname, { replace: true });
    }
  }, [searchParams, navigate, location.pathname]);

  // Fetch reels from backend
  useEffect(() => {
    const fetchReels = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/saved_reels`);
        
        if (!res.ok) {
          console.error(`Failed to fetch reels: ${res.status} ${res.statusText}`);
          return;
        }

        const rows = await res.json();
        console.log("Fetched reels from backend:", rows);
        
        const backend: Reel[] = rows.map((r: any) => normalizeReel(r)).filter(Boolean);
        
        // ✅ Merge backend data with temp placeholders
        setReels((current) => {
          const normalizeUrl = (url: string) => {
            try {
              const u = new URL(url);
              return `${u.origin}${u.pathname}`.replace(/\/$/, '');
            } catch {
              return url.split('?')[0].replace(/\/$/, '');
            }
          };

          const updated = [...current];
          const seenIds = new Set<string>();

          backend.forEach((b) => {
            const backendUrl = normalizeUrl(b.source_url || '');

            // Find temp placeholder by URL match
            const tempIndex = updated.findIndex((r) => {
              if (!r.isTemp) return false;
              const tempUrl = normalizeUrl(r.source_url || '');
              return tempUrl === backendUrl;
            });

            if (tempIndex !== -1) {
              // ✅ Replace temp with real data BUT keep status as processing if not done
              updated[tempIndex] = { 
                ...b, 
                isTemp: false,
                // Preserve processing status until completely done
                status: b.status === 'done' ? 'done' : 'processing'
              };
              seenIds.add(b.process_id);
            } else {
              // Check if already exists by process_id
              const existIndex = updated.findIndex((r) => r.process_id === b.process_id);
              if (existIndex !== -1) {
                // ✅ Update existing
                updated[existIndex] = b;
                seenIds.add(b.process_id);
              } else if (!seenIds.has(b.process_id)) {
                // ✅ Add new (only if not already seen)
                updated.push(b);
                seenIds.add(b.process_id);
              }
            }
          });

          // ✅ Remove duplicates by process_id
          const uniqueReels = updated.filter((reel, index, self) =>
            index === self.findIndex(r => r.process_id === reel.process_id)
          );

          return uniqueReels;
        });
      } catch (err) {
        console.error("Fetch error:", err);
      }
    };

    fetchReels();
    const interval = setInterval(fetchReels, 3000);
    return () => clearInterval(interval);
  }, []);

  // Reset selection mode when folder or location changes
  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [folderId, location.pathname]);

  // 1. Filter by Folder / Favorites
  const isFavoritesView = folderId === 'favorites';
  const isAllView = !folderId || folderId === 'all';
  
  let displayedVideos = reels.filter(v => {
    if (isFavoritesView) return v.is_favorite;
    if (isAllView) return true;
    return v.folder_id === folderId;
  });

  // 2. Search Filter
  displayedVideos = displayedVideos.filter(v => 
    v.summary?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.caption?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.author_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 3. Sort Logic - ✅ Keep processing items at top
  displayedVideos.sort((a, b) => {
    const aProcessing = a.status !== 'done';
    const bProcessing = b.status !== 'done';
    
    // Processing items always first
    if (aProcessing && !bProcessing) return -1;
    if (!aProcessing && bProcessing) return 1;
    
    // Otherwise sort by date
    const dateA = new Date(a.created_at || 0).getTime();
    const dateB = new Date(b.created_at || 0).getTime();
    return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
  });

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
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
        });
      }
      
      const res = await fetch(`${API_BASE}/api/saved_reels`);
      const rows = await res.json();
      const normalized: Reel[] = rows.map((r: any) => normalizeReel(r)).filter(Boolean);
      setReels(normalized);
      
      setIsMoveModalOpen(false);
      setSelectionMode(false);
      setSelectedIds(new Set());
      alert('Videos moved successfully!');
    } catch (err) {
      console.error('Move failed:', err);
      alert('Failed to move videos');
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    
    if (!confirm(`Delete ${selectedIds.size} video(s)?`)) return;
    
    try {
      for (const id of Array.from(selectedIds)) {
        await fetch(`${API_BASE}/api/delete_reel/${id}`, { method: 'DELETE' });
      }
      
      setReels(prev => prev.filter(r => !selectedIds.has(r.process_id)));
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete videos');
    }
  };

  // ✅ Get processing message (dynamic based on is_long_video flag)
  const getProcessingMessage = (reel: any) => {
    // Use the message from the API if available
    if (reel.summary?.title) {
      return reel.summary.title;
    }
    return reel.is_long_video ? "Processing… This may take a few minutes" : "Processing…";
  };

  const getFolderTitle = () => {
    if (isFavoritesView) return 'Favorites';
    if (isAllView) return 'All my videos';
    return folderId!
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const currentFolderTitle = getFolderTitle();

  useEffect(() => {
    document.body.style.overflow = isMoveModalOpen ? 'hidden' : 'unset';
  }, [isMoveModalOpen]);

  return (
    <div className="w-full pb-0 md:pb-6">
      {/* ✅ Processing Overlay + Shimmer CSS */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }
        
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(124, 58, 237, 0.3); }
          50% { box-shadow: 0 0 30px rgba(124, 58, 237, 0.5); }
        }
        
        .placeholder-skeleton {
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, #e5e7eb 0%, #f3f4f6 20%, #e5e7eb 40%, #e5e7eb 100%);
          background-size: 2000px 100%;
          animation: shimmer 2s linear infinite;
        }
        
        .processing-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          z-index: 10;
          gap: 12px;
        }
        
        .processing-overlay .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        
        .processing-overlay span {
          color: white;
          font-size: 12px;
          font-weight: 600;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
          text-align: center;
          max-width: 140px;
          line-height: 1.3;
        }
        
        .processing-card {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>

      {/* Header Area */}
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{currentFolderTitle}</h1>
            <p className="text-gray-500 text-sm mt-1">{displayedVideos.length} items</p>
          </div>  
        
        <div className="flex items-center gap-2">
          {selectionMode ? (
            <>
              <Button 
                variant="outline" 
                size="sm"
                className="h-9 px-5"
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedIds(new Set());
                }}
              >
                Cancel
              </Button>
              <Button 
                variant="primary" 
                size="sm"
                className="h-9 px-5"
                disabled={selectedIds.size === 0}
                onClick={() => setIsMoveModalOpen(true)}
              >
                Move {selectedIds.size > 0 && `(${selectedIds.size})`}
              </Button>
            </>
          ) : (
            <Button 
              variant="outline" 
              size="sm"
              className="h-9 px-5"
              onClick={() => setSelectionMode(true)}
            >
              Manage
            </Button>
          )}
        </div>
        </div>

        {/* Search Input & Sort Button */}
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
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-600 shadow-sm h-[46px] w-[46px] flex items-center justify-center"
            title={`Sort by ${sortOrder === 'desc' ? 'Newest' : 'Oldest'}`}
          >
            {sortOrder === 'desc' ? <CalendarArrowUp size={20} /> : <CalendarArrowDown size={20} />}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-3 mb-24 md:mb-12">
        {displayedVideos.map(video => {
          const processing = video.status !== 'done';
          const thumbnailUrl = video.gcs_urls?.preview_thumbnail || video.gcs_urls?.thumbnail;
          
          return (
            <div key={video.process_id} className="relative">
              {processing ? (
                <div className="relative aspect-[9/16] rounded-2xl bg-gray-200 overflow-hidden processing-card cursor-default">
                  {!thumbnailUrl ? (
                    <div className="placeholder-skeleton" />
                  ) : (
                    <img 
                      src={thumbnailUrl} 
                      alt="Processing"
                      className="absolute inset-0 w-full h-full object-cover blur-sm opacity-80"
                    />
                  )}
                  
                  {/* ✅ Dynamic processing message */}
                  <div className="processing-overlay">
                    <div className="spinner" />
                    <span>{getProcessingMessage(video)}</span>
                  </div>
                </div>
              ) : (
                <VideoCard 
                  video={video} 
                  selectionMode={selectionMode}
                  selected={selectedIds.has(video.process_id)}
                  onToggleSelect={() => toggleSelect(video.process_id)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {displayedVideos.length === 0 && (
        <div className="py-20 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="text-gray-400" size={24} />
          </div>
          <h3 className="text-gray-900 font-medium">No videos found</h3>
          <p className="text-gray-500 text-sm mt-1">
            {!isAllView && !isFavoritesView 
              ? `No videos in "${currentFolderTitle}" yet` 
              : 'Try adjusting your search or filters'}
          </p>
        </div>
      )}
    </div>
  );
};
