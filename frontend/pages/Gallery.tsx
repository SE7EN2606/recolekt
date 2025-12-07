import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { VideoCard } from '../components/VideoCard';
import { Button } from '../components/Button';
import { Search } from 'lucide-react';
import { useData } from '../context/DataContext';

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

export const Gallery: React.FC = () => {
  const { folderId } = useParams<{ folderId?: string }>();
  const location = useLocation();
  const { videos, folders, moveVideos } = useData();
  
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Move Modal State
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [targetFolderId, setTargetFolderId] = useState<string>('');

  // Reset selection mode when folder or location changes
  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [folderId, location.pathname]);

  // Helper to flatten folders for dropdown with subfolders
  // Filters out 'all' and 'fav' to show only actionable collections
  const getFlatFolders = () => {
    const flat: { id: string; name: string; level: number }[] = [];
    folders.forEach(f => {
      if (f.id !== 'all' && f.id !== 'fav') {
        flat.push({ id: f.id, name: f.name, level: 0 });
        if (f.subFolders) {
          f.subFolders.forEach(sub => {
            flat.push({ id: sub.id, name: sub.name, level: 1 });
          });
        }
      }
    });
    return flat;
  };
  const flatFolders = getFlatFolders();

  // Set default target folder when modal opens
  useEffect(() => {
    if (isMoveModalOpen && flatFolders.length > 0 && !targetFolderId) {
      setTargetFolderId(flatFolders[0].id);
    }
  }, [isMoveModalOpen, flatFolders, targetFolderId]);

  // 1. Filter by Folder / Favorites
  const isFavoritesView = folderId === 'favorites';
  
  let displayedVideos = videos.filter(v => {
    if (isFavoritesView) return v.isFavorite;
    if (folderId && folderId !== 'all') return v.folderId === folderId;
    return true; // All videos view
  });

  // 2. Search Filter
  displayedVideos = displayedVideos.filter(v => 
    v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // 3. Sort Logic
  // Favorites View -> Sort by favoritedAt
  // Other Views -> Sort by savedAt
  displayedVideos.sort((a, b) => {
    const dateA = isFavoritesView 
      ? (a.favoritedAt ? new Date(a.favoritedAt).getTime() : 0)
      : new Date(a.savedAt).getTime();
      
    const dateB = isFavoritesView 
      ? (b.favoritedAt ? new Date(b.favoritedAt).getTime() : 0)
      : new Date(b.savedAt).getTime();

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

  const handleMoveSubmit = () => {
    if (!targetFolderId) return;
    moveVideos(Array.from(selectedIds), targetFolderId);
    setIsMoveModalOpen(false);
    setSelectionMode(false);
    setSelectedIds(new Set());
    alert('Videos moved successfully!');
  };

  const currentFolderTitle = isFavoritesView 
    ? 'Favorites' 
    : (folderId ? (flatFolders.find(f => f.id === folderId)?.name || 'Folder') : 'All my videos');

  // Prevent body scroll when move modal is open
  useEffect(() => {
    document.body.style.overflow = isMoveModalOpen ? 'hidden' : 'unset';
  }, [isMoveModalOpen]);

  return (
    <div className="w-full pb-0 md:pb-6">
      {/* Header Area */}
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{currentFolderTitle}</h1>
            <p className="text-gray-500 text-sm mt-1">{displayedVideos.length} items</p>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {selectionMode ? (
              <>
                <Button 
                  variant="danger" 
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
          
          {/* Sort Button (Arrow) */}
          <button 
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-600 shadow-sm h-[46px] w-[46px] flex items-center justify-center"
            title={`Sort by ${sortOrder === 'desc' ? 'Newest' : 'Oldest'}`}
          >
            {sortOrder === 'desc' ? <CalendarArrowUp size={20} /> : <CalendarArrowDown size={20} />}
          </button>
        </div>
      </div>

      {/* Filter Chips - Wrapping on mobile */}
      <div className="flex flex-wrap gap-2 mb-6">
         <button className="px-4 py-2 bg-gray-900 text-white rounded-full text-sm font-medium shadow-sm transition-transform active:scale-95">All</button>
         <button className="px-4 py-2 bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 rounded-full text-sm font-medium transition-colors">Fitness</button>
         <button className="px-4 py-2 bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 rounded-full text-sm font-medium transition-colors">Cooking</button>
         <button className="px-4 py-2 bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 rounded-full text-sm font-medium transition-colors">Fashion</button>
         <button className="px-4 py-2 bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 rounded-full text-sm font-medium transition-colors">Finance</button>
      </div>

      {/* Grid */}
     <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-3 mb-24 md:mb-12">
        {displayedVideos.map(video => (
          <VideoCard 
            key={video.id} 
            video={video} 
            selectionMode={selectionMode}
            selected={selectedIds.has(video.id)}
            onToggleSelect={() => toggleSelect(video.id)}
          />
        ))}
      </div>

      {/* Empty State */}
      {displayedVideos.length === 0 && (
        <div className="py-20 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="text-gray-400" size={24} />
          </div>
          <h3 className="text-gray-900 font-medium">No videos found</h3>
          <p className="text-gray-500 text-sm mt-1">Try adjusting your search or filters</p>
        </div>
      )}

      {/* Move Modal */}
      {isMoveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMoveModalOpen(false)} />
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl relative z-10 p-6 animate-scale-in">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Move {selectedIds.size} videos to...</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Destination</label>
                <select 
                  value={targetFolderId} 
                  onChange={(e) => setTargetFolderId(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  {flatFolders.map(f => (
                    <option key={f.id} value={f.id}>
                      {/* Indent based on level for visual hierarchy */}
                      {'\u00A0'.repeat(f.level * 4) + (f.level > 0 ? '↳ ' : '') + f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button variant="ghost" onClick={() => setIsMoveModalOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={handleMoveSubmit}>Move</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};