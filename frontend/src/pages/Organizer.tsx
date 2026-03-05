import React, { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import { Folder, Video } from '../types';
import { 
  Folder as FolderIcon, 
  ChevronDown, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  Grid, 
  List, 
  Search,
  CornerDownRight,
  Inbox,
  AlertTriangle,
  Undo2,
  LayoutGrid,
  Heart,
  Folders,
  FolderOpen
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  isSub?: boolean;
  divider?: boolean;
  disabled?: boolean;
}

const CustomDropdown = ({ 
  value, 
  onChange, 
  options, 
  placeholder, 
  triggerClassName, 
  dropdownClassName 
}: { 
  value: string, 
  onChange: (val: string) => void, 
  options: DropdownOption[], 
  placeholder: string,
  triggerClassName?: string,
  dropdownClassName?: string
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={triggerClassName || "flex items-center justify-between w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium hover:border-primary-300 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm"}
      >
        <div className="flex items-center gap-2 truncate">
          {selected?.icon}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </div>
        <ChevronDown className={`ml-2 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} size={16} />
      </button>

      {isOpen && (
        <div className={`absolute z-[100] mt-1.5 w-full min-w-[220px] bg-white border border-gray-100 rounded-xl shadow-xl py-1.5 max-h-72 overflow-y-auto ${dropdownClassName || 'left-0'}`}>
          {options.map((opt, i) => {
            if (opt.divider) return <div key={`div-${i}`} className="h-px bg-gray-100 my-1.5 mx-2" />;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={opt.disabled}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className={`w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm transition-colors group
                  ${opt.isSub ? 'pl-8' : 'pl-3'}
                  ${opt.disabled ? 'text-gray-400 cursor-not-allowed' : 'hover:bg-primary-50 text-gray-700 hover:text-primary-900'}
                  ${value === opt.value ? 'bg-primary-50 text-primary-900 font-bold' : 'font-medium'}
                `}
              >
                <div className={`transition-colors shrink-0`}>
                  {opt.icon}
                </div>
                <span className="truncate">{opt.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  );
};

export const Organizer: React.FC = () => {
  const { t } = useTranslation(['organizer', 'common']);
  const { folders, videos, addFolder, updateFolder, deleteFolder, moveVideos } = useData();

  const [selectedFolderId, setSelectedFolderId] = useState<string>('unsorted');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creationParentId, setCreationParentId] = useState<string>(''); 
  const [actionError, setActionError] = useState<string | null>(null);

  const [lastAction, setLastAction] = useState<{ type: 'move', videoIds: string[], fromFolderId: string, toFolderId: string } | null>(null);

  useEffect(() => {
    const handleVideoMoved = (e: any) => {
      setLastAction({
        type: 'move',
        videoIds: e.detail.videoIds,
        fromFolderId: e.detail.fromFolderId,
        toFolderId: e.detail.toFolderId
      });
      setSelectedVideoIds(new Set());
    };
    window.addEventListener('app-video-moved', handleVideoMoved);
    return () => window.removeEventListener('app-video-moved', handleVideoMoved);
  }, []);

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

  const folderVideos = videos.filter(v => {
    if (selectedFolderId === 'all') return true;
    if (selectedFolderId === 'unsorted') return v.folderId === 'unsorted' || !v.folderId || v.folderId === 'all';
    if (selectedFolderId === 'favorites') return v.isFavorite;
    return v.folderId === selectedFolderId;
  }).filter(v => v.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
      setActionError(null);
      try {
        await addFolder(newFolderName.trim(), creationParentId || null);
        setNewFolderName('');
        setIsCreating(false);
      } catch (err: any) {
        setActionError(err.message || t('organizer:errorFolderExists'));
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
        setActionError(err.message || t('organizer:errorFolderExists'));
      }
    }
  };

  const handleDeleteFolder = () => {
    if (window.confirm(t('organizer:deleteConfirm', { name: selectedFolder?.name }))) {
      deleteFolder(selectedFolderId);
      setSelectedFolderId('unsorted');
    }
  };

  const handleMoveSelected = (targetId: string) => {
    const ids = Array.from(selectedVideoIds);
    moveVideos(ids, targetId);
    setLastAction({ type: 'move', videoIds: ids, fromFolderId: selectedFolderId, toFolderId: targetId });
    setSelectedVideoIds(new Set());
  };

  const handleUndo = () => {
    if (lastAction && lastAction.type === 'move') {
      if (lastAction.fromFolderId !== 'all') {
         moveVideos(lastAction.videoIds, lastAction.fromFolderId);
         setLastAction(null);
      }
    }
  };

  // ✅ REDUCED ICON SIZES TO 18 TO MATCH NEW TEXT-BASE SIZE
  const mainSelectorOptions: DropdownOption[] = [
    { value: 'all', label: t('organizer:allVideos'), icon: <LayoutGrid size={18} className="text-primary-600" /> },
    { value: 'unsorted', label: t('organizer:unsorted'), icon: <Inbox size={18} className="text-primary-600" /> },
    { value: 'favorites', label: t('organizer:favorites'), icon: <Heart size={18} className="text-primary-600" /> },
    { divider: true, value: 'div1', label: '' },
    ...folders.flatMap(f => [
      { value: f.id, label: f.name, icon: <Folders size={18} className="text-primary-600" /> },
      ...(f.subFolders || []).map(sub => ({
         value: sub.id, label: sub.name, icon: <FolderOpen size={18} className="text-gray-400 group-hover:text-primary-500" />, isSub: true
      }))
    ])
  ];

  const moveSelectorOptions: DropdownOption[] = [
    { value: 'unsorted', label: t('organizer:unsorted'), icon: <Inbox size={18} className="text-primary-600" /> },
    { divider: true, value: 'div1', label: '' },
    ...folders.filter(f => !['all', 'favorites', 'archive', 'unsorted'].includes(f.id)).flatMap(f => [
      { value: f.id, label: f.name, icon: <Folders size={18} className="text-primary-600" /> },
      ...(f.subFolders || []).map(sub => ({
         value: sub.id, label: sub.name, icon: <FolderOpen size={18} className="text-gray-400 group-hover:text-primary-500" />, isSub: true
      }))
    ])
  ];

  const parentCreationOptions: DropdownOption[] = [
    { value: '', label: t('organizer:mainLevel'), icon: <LayoutGrid size={16}/> },
    { divider: true, value: 'div1', label: '' },
    ...folders.filter(f => !['all', 'favorites', 'archive', 'unsorted'].includes(f.id) && !f.isSystem).map(f => (
      { value: f.id, label: t('organizer:insideFolder', { name: f.name }), icon: <Folders size={16}/> }
    ))
  ];

  return (
    <div className="flex flex-col w-full h-full pt-4 md:pt-0">
      
      {/* ✅ TITLE BLOCK CLEANED UP */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('organizer:title')}</h1>
      </div>

      <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm mb-24 md:mb-8 relative z-0">
        
        {/* 1. MAIN HEADER TOOLBAR */}
        <div className="h-16 border-b border-gray-100 flex items-center justify-between px-4 md:px-6 bg-white rounded-t-2xl z-50 sticky top-0 shadow-sm">
          <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
            {isRenaming ? (
              <div className="flex items-center gap-2">
                <input 
                  autoFocus
                  className="text-base font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1 focus:ring-2 focus:ring-primary-500 outline-none w-full max-w-[160px] md:max-w-xs"
                  value={renameValue}
                  onChange={e => { setRenameValue(e.target.value); setActionError(null); }}
                  onKeyDown={e => e.key === 'Enter' && handleRename()}
                />
                <button type="button" onClick={handleRename} className="p-1.5 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"><Check size={18} /></button>
                <button type="button" onClick={() => { setIsRenaming(false); setActionError(null); }} className="p-1.5 text-gray-400 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-gray-500 font-medium text-sm hidden sm:inline-block whitespace-nowrap mr-1">
                  {t('organizer:selectFolder')}
                </span>

                {/* ✅ REDUCED TEXT SIZE: text-base instead of text-lg */}
                <CustomDropdown 
                  value={selectedFolderId}
                  onChange={setSelectedFolderId}
                  options={mainSelectorOptions}
                  placeholder={t('organizer:placeholderSelectFolder')}
                  triggerClassName="appearance-none bg-transparent font-bold text-base text-gray-900 outline-none cursor-pointer truncate flex items-center hover:opacity-70 transition-opacity"
                />

                {!['all', 'unsorted', 'favorites', 'archive'].includes(selectedFolderId) && (
                  <button 
                    type="button"
                    onClick={() => { setRenameValue(selectedFolder?.name || ''); setIsRenaming(true); }}
                    className="text-gray-400 hover:text-primary-600 hover:bg-primary-50 p-1.5 rounded-lg transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                )}
              </div>
            )}
            
            <span className="md:hidden text-xs text-primary-600 font-bold px-2 py-0.5 bg-primary-50 border border-primary-100 rounded-md whitespace-nowrap">
              {t('organizer:itemsCount', { count: folderVideos.length })}
            </span>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {selectedVideoIds.size > 0 && (
              <button
                onClick={() => setSelectedVideoIds(new Set())}
                className="hidden md:flex items-center gap-1 px-3 py-1 bg-red-50 text-red-600 border border-red-100 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors"
              >
                <X size={14} /> {t('organizer:cancel')}
              </button>
            )}

            <span className="hidden md:inline-block text-xs text-primary-600 font-bold px-2.5 py-1 bg-primary-50 border border-primary-100 rounded-lg whitespace-nowrap mr-2">
              {t('organizer:itemsCount', { count: folderVideos.length })}
            </span>

            {lastAction && (
              <button 
                type="button"
                onClick={handleUndo}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-black transition-colors shadow-sm animate-fade-in"
              >
                <Undo2 size={14} />
                <span className="hidden md:inline">{t('organizer:undoMove')}</span>
              </button>
            )}
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button type="button" onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                <Grid size={16} />
              </button>
              <button type="button" onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                <List size={16} />
              </button>
            </div>
          </div>
        </div>

        {actionError && isRenaming && (
          <div className="px-6 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2 text-red-600 text-sm font-bold animate-fade-in z-40 relative">
             <AlertTriangle size={16} />
             <span>{actionError}</span>
          </div>
        )}

        {/* 2. ACTION BAR */}
        <div className="px-4 md:px-6 py-3 bg-gray-50/50 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 z-40 sticky top-16 backdrop-blur-sm">
           <div className="relative w-full sm:max-w-xs md:max-w-md">
             <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
             <input 
               placeholder={t('organizer:searchInFolder')} 
               value={searchQuery}
               onChange={e => setSearchQuery(e.target.value)}
               className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
             />
           </div>

           <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto overflow-visible">
             
             {selectedVideoIds.size === 0 && (
               <button 
                 type="button"
                 onClick={() => { setIsCreating(!isCreating); setActionError(null); setNewFolderName(''); setCreationParentId(selectedFolderId === 'unsorted' || selectedFolderId === 'all' ? '' : selectedFolderId); }}
                 className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-xs rounded-xl transition-all shadow-sm active:scale-95 whitespace-nowrap"
               >
                 <Plus size={14} className="text-gray-500" />
                 <span>{t('organizer:newFolder')}</span>
               </button>
             )}

             {!['all', 'unsorted', 'favorites', 'archive'].includes(selectedFolderId) && selectedVideoIds.size === 0 && (
               <button 
                 type="button"
                 onClick={handleDeleteFolder}
                 className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-red-600 text-xs font-bold rounded-xl hover:bg-red-50 hover:border-red-200 transition-all shadow-sm"
               >
                 <Trash2 size={14} />
                 <span className="hidden md:inline">{t('organizer:deleteFolder')}</span>
               </button>
             )}

             {selectedVideoIds.size > 0 && (
               <div className="flex items-center gap-3 animate-fade-in bg-primary-50 pl-3 pr-1 py-1 rounded-xl border border-primary-100 ml-auto">
                 <span className="text-xs font-bold text-primary-700 whitespace-nowrap">
                    {t('organizer:selectedCount', { count: selectedVideoIds.size })}
                 </span>
                 <CustomDropdown 
                   value=""
                   onChange={(val) => handleMoveSelected(val)}
                   options={moveSelectorOptions}
                   placeholder={t('organizer:moveToFolder')}
                   triggerClassName="flex items-center justify-between bg-white border border-primary-200 text-primary-900 rounded-lg px-3 py-1.5 text-xs font-bold hover:border-primary-300 transition-colors focus:ring-2 focus:ring-primary-500 shadow-sm min-w-[140px]"
                   dropdownClassName="right-0 left-auto origin-top-right w-56"
                 />
               </div>
             )}
           </div>
        </div>

        {/* 3. NEW FOLDER INLINE CREATION */}
        {isCreating && (
          <div className="relative z-50 px-4 md:px-6 py-4 bg-primary-50/80 border-b border-primary-100 flex flex-col gap-3 animate-fade-in">
            <div className="text-xs font-bold text-primary-700 uppercase tracking-wider flex items-center gap-2">
              <CornerDownRight size={14} /> {t('organizer:createFolder')}
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5">
              <div className="w-full sm:w-auto min-w-[220px]">
                <CustomDropdown 
                  value={creationParentId}
                  onChange={(val) => { setCreationParentId(val); setActionError(null); }}
                  options={parentCreationOptions}
                  placeholder={t('organizer:placeholderSelectFolder')}
                  triggerClassName="flex items-center justify-between w-full bg-white border border-primary-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:border-primary-300 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                <input 
                  autoFocus placeholder={t('organizer:folderNamePlaceholder')} value={newFolderName}
                  onChange={e => { setNewFolderName(e.target.value); setActionError(null); }}
                  onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                  className={`flex-1 sm:flex-none w-full sm:w-64 bg-white border rounded-lg px-3 py-2 text-sm outline-none transition-all shadow-sm ${actionError ? 'border-red-400 focus:ring-2 focus:ring-red-500' : 'border-gray-200 focus:ring-2 focus:ring-primary-500'}`}
                />
                <button 
                  type="button" 
                  onClick={handleCreateFolder} 
                  disabled={!newFolderName.trim()}
                  className="p-2 bg-primary-600 text-white rounded-lg shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check size={18} />
                </button>
                <button type="button" onClick={() => { setIsCreating(false); setActionError(null); }} className="p-2 text-gray-400 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"><X size={18} /></button>
              </div>
            </div>
            {actionError && (
              <div className="flex items-center gap-1 text-red-500 text-xs font-bold animate-fade-in">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{actionError}</span>
              </div>
            )}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 p-4 md:p-6 bg-gray-50/10 min-h-[50vh] relative z-0">
          
          {selectedFolder?.subFolders && selectedFolder.subFolders.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">{t('organizer:subfolders')}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {selectedFolder.subFolders.map(sub => (
                  <div 
                    key={sub.id}
                    onClick={() => setSelectedFolderId(sub.id)}
                    className="group p-4 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md hover:border-primary-200 transition-all cursor-pointer flex flex-col items-center text-center gap-3"
                  >
                    <div className="w-12 h-12 bg-primary-50 text-primary-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FolderOpen size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm truncate max-w-[120px]">{sub.name}</h4>
                      <p className="text-xs text-gray-400">
                        {t('organizer:itemsCount', { count: getVideoCount(sub.id) })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            {folderVideos.length === 0 ? (
              <div className="text-center py-24 border-2 border-dashed border-gray-100 rounded-3xl bg-white/50">
                <Inbox size={48} className="mx-auto text-gray-200 mb-4" />
                <p className="text-gray-400 text-sm font-medium">{t('organizer:noVideos')}</p>
              </div>
            ) : (
              <div className={viewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4" : "space-y-3"}>
                {folderVideos.map(video => (
                  <div 
                    key={video.id}
                    draggable
                    onDragStart={(e) => {
                      let idsToMove = [video.id];
                      if (selectedVideoIds.has(video.id)) {
                        idsToMove = Array.from(selectedVideoIds);
                      }
                      e.dataTransfer.setData('videoIds', JSON.stringify(idsToMove));
                      e.dataTransfer.setData('sourceId', selectedFolderId);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
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
                      hover:-translate-y-1 active:cursor-grabbing
                    `}
                  >
                    {viewMode === 'grid' ? (
                      <div className={`absolute top-3 left-3 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors shadow-sm ${selectedVideoIds.has(video.id) ? 'bg-primary-500 border-primary-500' : 'bg-black/30 border-white/80 hover:bg-black/40'}`}>
                        {selectedVideoIds.has(video.id) && <Check size={14} className="text-white" strokeWidth={3} />}
                      </div>
                    ) : (
                      <div className={`relative z-10 w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors shadow-sm ml-1 ${selectedVideoIds.has(video.id) ? 'bg-primary-500 border-primary-500' : 'bg-gray-100 border-gray-300 hover:bg-gray-200'}`}>
                        {selectedVideoIds.has(video.id) && <Check size={14} className="text-white" strokeWidth={3} />}
                      </div>
                    )}

                    {viewMode === 'grid' ? (
                      <>
                        <img src={video.thumbnailUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80" />
                        <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
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
  );
};