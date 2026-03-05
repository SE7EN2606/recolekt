import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { Folder, Video } from '../types';
import { 
  Folder as FolderIcon, 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  Grid, 
  List, 
  Search,
  Inbox,
  AlertTriangle
} from 'lucide-react';

const FolderTreeItem = ({ 
  folder, 
  depth = 0, 
  selectedId, 
  onSelect, 
  expandedIds, 
  toggleExpand,
  getVideoCount
}: { 
  folder: Folder, 
  depth?: number, 
  selectedId: string | null, 
  onSelect: (id: string) => void,
  expandedIds: Set<string>,
  toggleExpand: (id: string) => void,
  getVideoCount: (id: string) => number
}) => {
  const isSelected = selectedId === folder.id;
  const hasChildren = folder.subFolders && folder.subFolders.length > 0;
  const isExpanded = expandedIds.has(folder.id);
  const count = getVideoCount(folder.id);

  return (
    <div className="select-none">
      <div 
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm
          ${isSelected ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}
        `}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        onClick={() => onSelect(folder.id)}
      >
        <button 
          className={`p-0.5 rounded hover:bg-gray-200 text-gray-400 transition-opacity ${hasChildren ? 'opacity-100' : 'opacity-0'}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand(folder.id);
          }}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        
        {folder.id === 'unsorted' ? <Inbox size={16} className="text-blue-500" /> : 
         folder.id === 'favorites' ? <FolderIcon size={16} className="text-rose-500" /> :
         <FolderIcon size={16} className={isSelected ? 'text-primary-500' : 'text-gray-400'} />
        }
        
        <span className="truncate flex-1">{folder.name}</span>
        <span className="text-xs text-gray-400">{count}</span>
      </div>

      {isExpanded && hasChildren && (
        <div className="animate-fade-in">
          {folder.subFolders!.map(sub => (
            <div key={sub.id}>
              <FolderTreeItem 
                folder={sub} 
                depth={depth + 1} 
                selectedId={selectedId} 
                onSelect={onSelect}
                expandedIds={expandedIds}
                toggleExpand={toggleExpand}
                getVideoCount={getVideoCount}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const Organizer: React.FC = () => {
  const { folders, videos, addFolder, updateFolder, deleteFolder, moveVideos } = useData();

  const [selectedFolderId, setSelectedFolderId] = useState<string>('unsorted');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['all']));
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creationParentId, setCreationParentId] = useState<string>(''); // ✅ Tracks parent selection
  const [actionError, setActionError] = useState<string | null>(null);

  const getVideoCount = (folderId: string) => {
    if (folderId === 'unsorted') {
        return videos.filter((v: any) => !v.folderId || v.folderId === 'unsorted' || v.folderId === 'all').length;
    }
    const directCount = videos.filter((v: any) => v.folderId === folderId).length;
    const folder = folders.find((f: any) => f.id === folderId);
    const subFolderCount = (folder?.subFolders || []).reduce((acc: number, sub: any) => 
      acc + videos.filter((v: any) => v.folderId === sub.id).length, 0);
    return directCount + subFolderCount;
  };

  const selectedFolder = folders.find(f => f.id === selectedFolderId) || 
                         folders.flatMap(f => f.subFolders || []).find(f => f.id === selectedFolderId);
  
  const getDisplayTitle = () => {
      if (selectedFolderId === 'all') return 'All Videos';
      if (selectedFolderId === 'unsorted') return 'Unsorted';
      if (selectedFolderId === 'favorites') return 'Favorites';
      if (selectedFolderId === 'archive') return 'Archive';
      return selectedFolder?.name || 'Select a Folder';
  }

  const folderVideos = videos.filter(v => {
    if (selectedFolderId === 'all') return true;
    if (selectedFolderId === 'unsorted') return v.folderId === 'unsorted' || !v.folderId || v.folderId === 'all';
    if (selectedFolderId === 'favorites') return v.isFavorite;
    return v.folderId === selectedFolderId;
  }).filter(v => v.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
      setActionError(null);
      try {
        await addFolder(newFolderName.trim(), creationParentId || null);
        setNewFolderName('');
        setIsCreating(false);
      } catch (err: any) {
        setActionError(err.message || "A folder with this name already exists.");
      }
    }
  };

  const handleRename = async () => {
    if (renameValue.trim() && selectedFolderId) {
      setActionError(null);
      try {
        await updateFolder(selectedFolderId, renameValue.trim());
        setIsRenaming(false);
      } catch (err: any) {
        setActionError(err.message || "A folder with this name already exists.");
      }
    }
  };

  const handleDeleteFolder = () => {
    if (window.confirm(`Delete folder "${selectedFolder?.name}" and move contents to Unsorted?`)) {
      deleteFolder(selectedFolderId);
      setSelectedFolderId('unsorted');
    }
  };

  const handleMoveSelected = (targetId: string) => {
    moveVideos(Array.from(selectedVideoIds), targetId);
    setSelectedVideoIds(new Set());
  };

  const flatFolders = folders.filter(f => !['all', 'favorites', 'archive'].includes(f.id)).flatMap(f => [
    f,
    ...(f.subFolders || [])
  ]);

  return (
    // ✅ 3. REMOVED fixed height logic to enable natural infinite gallery scroll
    <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mt-6 mb-24 md:mb-8">
      
      {/* ✅ 4. MOVED TOOLBAR TO THE VERY TOP, ABOVE EVERYTHING */}
      <div className="h-16 border-b border-gray-100 flex items-center justify-between px-4 md:px-6 flex-shrink-0 bg-white">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          {isRenaming ? (
            <div className="flex items-center gap-2">
              <input 
                autoFocus
                className="text-lg font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1 focus:ring-2 focus:ring-primary-500 outline-none w-full max-w-[160px] md:max-w-xs"
                value={renameValue}
                onChange={e => { setRenameValue(e.target.value); setActionError(null); }}
                onKeyDown={e => e.key === 'Enter' && handleRename()}
              />
              <button onClick={handleRename} className="p-1.5 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"><Check size={18} /></button>
              <button onClick={() => { setIsRenaming(false); setActionError(null); }} className="p-1.5 text-gray-400 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-3 min-w-0">
              {/* ✅ 5. REDUCED FONT TO text-lg */}
              <h1 className="text-lg font-bold text-gray-900 truncate">{getDisplayTitle()}</h1>
              {!['all', 'unsorted', 'favorites', 'archive'].includes(selectedFolderId) && (
                <button 
                  onClick={() => {
                    setRenameValue(selectedFolder?.name || '');
                    setIsRenaming(true);
                  }}
                  className="text-gray-400 hover:text-primary-600 hover:bg-primary-50 p-1.5 rounded-lg transition-colors"
                >
                  <Edit2 size={14} />
                </button>
              )}
            </div>
          )}
          {/* ✅ 1. REMOVED hidden sm:block so it shows natively on mobile */}
          <span className="text-xs text-gray-500 font-bold px-2.5 py-1 bg-gray-100 rounded-lg whitespace-nowrap">
            {folderVideos.length} items
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Grid size={16} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-start w-full">
        
        {/* LEFT SIDEBAR: TREE */}
        <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-gray-100 bg-gray-50/50 flex flex-col flex-shrink-0 self-start md:sticky md:top-[64px] max-h-none md:max-h-[calc(100vh-160px)] overflow-y-auto">
          
          <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white/50">
            <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wide">Library</h2>
            <button 
              onClick={() => { 
                setIsCreating(!isCreating); 
                setActionError(null); 
                setNewFolderName(''); 
                const isSystem = ['all', 'unsorted', 'favorites', 'archive'].includes(selectedFolderId);
                setCreationParentId(isSystem ? '' : selectedFolderId);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 rounded-lg text-gray-700 transition-all shadow-sm active:scale-95"
            >
              <Plus size={14} className="text-gray-500" />
              <span className="text-xs font-bold">New Folder</span>
            </button>
          </div>

          {/* ✅ 2. PARENT DROPDOWN ADDED TO FOLDER CREATION */}
          {isCreating && (
            <div className="p-3 bg-primary-50/50 border-b border-primary-100/50 flex flex-col gap-2.5">
              <select
                value={creationParentId}
                onChange={(e) => { setCreationParentId(e.target.value); setActionError(null); }}
                className="w-full text-xs font-medium text-gray-700 bg-white border border-primary-200 rounded-md px-2 py-2 outline-none focus:border-primary-500 shadow-sm cursor-pointer"
              >
                <option value="">Main Level (No Parent)</option>
                {folders.filter(f => !['all', 'favorites', 'archive', 'unsorted'].includes(f.id) && !f.isSystem).map(f => (
                  <option key={f.id} value={f.id}>Inside "{f.name}"</option>
                ))}
              </select>

              <div className="flex items-center gap-1.5">
                <input 
                  autoFocus
                  placeholder="Folder Name..."
                  value={newFolderName}
                  onChange={e => { setNewFolderName(e.target.value); setActionError(null); }}
                  onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                  className={`flex-1 min-w-0 bg-white border rounded-lg px-2.5 py-1.5 text-sm outline-none transition-all shadow-sm ${actionError ? 'border-red-400 focus:ring-2 focus:ring-red-500' : 'border-gray-200 focus:ring-2 focus:ring-primary-500'}`}
                />
                <button onClick={handleCreateFolder} className="p-1.5 bg-primary-600 text-white rounded-lg shadow-sm hover:bg-primary-700 transition-colors"><Check size={16} /></button>
                <button onClick={() => { setIsCreating(false); setActionError(null); }} className="p-1.5 text-gray-400 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"><X size={16} /></button>
              </div>
              {actionError && (
                <div className="flex items-center gap-1 text-red-500 text-xs font-bold mt-0.5 pl-1 animate-fade-in">
                  <AlertTriangle size={12} className="shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}
            </div>
          )}
          
          <div className="flex-1 p-2 space-y-0.5 pb-4">
            {folders.map(folder => (
              <div key={folder.id}>
                <FolderTreeItem 
                  folder={folder} 
                  selectedId={selectedFolderId} 
                  onSelect={setSelectedFolderId}
                  expandedIds={expandedIds}
                  toggleExpand={toggleExpand}
                  getVideoCount={getVideoCount}
                />
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT WORKSPACE */}
        <div className="flex-1 flex flex-col min-w-0 w-full bg-white">
          
          {/* Global Action Error Block for Rename */}
          {actionError && isRenaming && (
            <div className="px-6 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2 text-red-600 text-sm font-bold animate-fade-in">
               <AlertTriangle size={16} />
               <span>{actionError}</span>
            </div>
          )}

          {/* Action Bar (Search & Move) */}
          <div className="px-4 md:px-6 py-3 bg-gray-50/30 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-0 z-10">
             
             <div className="relative w-full sm:max-w-xs md:max-w-md">
               <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
               <input 
                 placeholder="Search in folder..." 
                 value={searchQuery}
                 onChange={e => setSearchQuery(e.target.value)}
                 className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
               />
             </div>

             <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
               {!['all', 'unsorted', 'favorites', 'archive'].includes(selectedFolderId) && (
                 <button 
                   onClick={handleDeleteFolder}
                   className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-red-600 text-xs font-bold rounded-xl hover:bg-red-50 hover:border-red-200 transition-all shadow-sm"
                 >
                   <Trash2 size={14} />
                   <span className="hidden md:inline">Delete Folder</span>
                 </button>
               )}

               {selectedVideoIds.size > 0 && (
                 <div className="flex items-center gap-3 animate-fade-in bg-primary-50 pl-3 pr-1 py-1 rounded-xl border border-primary-100">
                   <span className="text-xs font-bold text-primary-700">{selectedVideoIds.size} selected</span>
                   <select 
                     className="text-xs font-bold bg-white border border-primary-200 text-primary-900 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer shadow-sm"
                     onChange={(e) => {
                       if (e.target.value) handleMoveSelected(e.target.value);
                     }}
                     value=""
                   >
                     <option value="" disabled>Move to...</option>
                     <option value="unsorted">Unsorted</option>
                     {flatFolders.map(f => (
                       <option key={f.id} value={f.id}>{f.name}</option>
                     ))}
                   </select>
                 </div>
               )}
             </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 p-4 md:p-6 bg-gray-50/10">
            
            {/* Subfolders Grid */}
            {selectedFolder?.subFolders && selectedFolder.subFolders.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Subfolders</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {selectedFolder.subFolders.map(sub => (
                    <div 
                      key={sub.id}
                      onClick={() => setSelectedFolderId(sub.id)}
                      className="group p-4 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md hover:border-primary-200 transition-all cursor-pointer flex flex-col items-center text-center gap-3"
                    >
                      <div className="w-12 h-12 bg-primary-50 text-primary-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <FolderIcon size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-sm truncate max-w-[120px]">{sub.name}</h4>
                        <p className="text-xs text-gray-400">{getVideoCount(sub.id)} items</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Videos Grid/List */}
            <div>
              {folderVideos.length === 0 ? (
                <div className="text-center py-24 border-2 border-dashed border-gray-100 rounded-3xl bg-white/50">
                  <Inbox size={48} className="mx-auto text-gray-200 mb-4" />
                  <p className="text-gray-400 text-sm font-medium">No videos in this folder</p>
                </div>
              ) : (
                <div className={viewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4" : "space-y-3"}>
                  {folderVideos.map(video => (
                    <div 
                      key={video.id}
                      onClick={() => {
                        const next = new Set(selectedVideoIds);
                        if (next.has(video.id)) next.delete(video.id);
                        else next.add(video.id);
                        setSelectedVideoIds(next);
                      }}
                      className={`
                        group relative cursor-pointer transition-all bg-white
                        ${viewMode === 'grid' 
                          ? `aspect-[9/14] rounded-2xl overflow-hidden border-2 ${selectedVideoIds.has(video.id) ? 'border-primary-500 shadow-md shadow-primary-500/20' : 'border-transparent shadow-sm hover:shadow-md'}`
                          : `flex items-center gap-4 p-3 rounded-2xl border-2 ${selectedVideoIds.has(video.id) ? 'bg-primary-50 border-primary-500 shadow-sm shadow-primary-500/10' : 'border-gray-100 hover:border-primary-200 shadow-sm'}`
                        }
                      `}
                    >
                      <div className={`absolute top-3 left-3 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors shadow-sm ${selectedVideoIds.has(video.id) ? 'bg-primary-500 border-primary-500' : 'bg-black/30 border-white/80 hover:bg-black/40'}`}>
                        {selectedVideoIds.has(video.id) && <Check size={14} className="text-white" strokeWidth={3} />}
                      </div>

                      {viewMode === 'grid' ? (
                        <>
                          <img src={video.thumbnailUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80" />
                          <div className="absolute bottom-4 left-4 right-4">
                            <p className="text-white text-sm font-bold leading-snug line-clamp-2">{video.title}</p>
                            <p className="text-gray-300 text-xs mt-1 truncate">{video.author}</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                            <img src={video.thumbnailUrl} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0 pr-4">
                            <h4 className={`text-base font-bold truncate ${selectedVideoIds.has(video.id) ? 'text-primary-900' : 'text-gray-900'}`}>{video.title}</h4>
                            <p className="text-sm text-gray-500 truncate mt-0.5">{video.author}</p>
                          </div>
                          <div className="text-xs text-gray-400 font-bold bg-gray-100 px-2 py-1 rounded-lg">{video.duration}</div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};