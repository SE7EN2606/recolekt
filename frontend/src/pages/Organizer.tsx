import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  FolderOpen,
  FolderPlus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  isSub?: boolean;
  divider?: boolean;
  disabled?: boolean;
  isAction?: boolean;
}

const safeStr = (v: any): string => {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return String(v);
};

const CREATE_NEW_FOLDER_VALUE = '__create_new__';

// ✅ Portal-based dropdown — escapes sticky/z-index stacking contexts completely
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
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = (e: Event) => { if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) return; setIsOpen(false); };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 220) });
    }
    setIsOpen(p => !p);
  };

  const selected = options.find(o => o.value === value);

  return (
    <div className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={triggerClassName || "flex items-center justify-between w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium hover:border-primary-300 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm"}
      >
        <div className="flex items-center gap-2 truncate min-w-0">
          {selected?.icon}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </div>
        <ChevronDown className={`ml-2 flex-shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} size={16} />
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] bg-white border border-gray-100 rounded-xl shadow-xl py-1.5 max-h-72 overflow-y-auto"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          {options.map((opt, i) => {
            if (opt.divider) return <div key={`div-${i}`} className="h-px bg-gray-100 my-1.5 mx-2" />;
            if (opt.isAction) {
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setIsOpen(false); }}
                  className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm font-bold text-primary-600 hover:bg-primary-50 transition-colors"
                >
                  <div className="shrink-0">{opt.icon}</div>
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            }
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
                <div className="transition-colors shrink-0">{opt.icon}</div>
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
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

  // ✅ Inline "create & move" state — triggered from the move dropdown
  const [isInlineFolderCreate, setIsInlineFolderCreate] = useState(false);
  const [inlineFolderName, setInlineFolderName] = useState('');
  const [inlineFolderParentId, setInlineFolderParentId] = useState('');
  const [inlineFolderError, setInlineFolderError] = useState<string | null>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (isInlineFolderCreate) {
      setTimeout(() => inlineInputRef.current?.focus(), 50);
    }
  }, [isInlineFolderCreate]);

  const selectedFolder = folders.find(f => f.id === selectedFolderId) || 
                         folders.flatMap(f => f.subFolders || []).find(f => f.id === selectedFolderId);

  const folderVideos = useMemo(() => {
    let filtered = videos.filter(v => {
      if (selectedFolderId === 'all') return true;
      if (selectedFolderId === 'unsorted') return v.folderId === 'unsorted' || !v.folderId || v.folderId === 'all';
      if (selectedFolderId === 'favorites') return v.isFavorite;
      return v.folderId === selectedFolderId;
    });

    filtered = filtered.map((v: any) => {
      let title = '';
      let summaryObj = v.summary ?? v.summary_text ?? v.raw?.summary ?? {};
      if (typeof summaryObj === 'string') {
        try { summaryObj = JSON.parse(summaryObj); } catch(e) { summaryObj = {}; }
      }
      
      let recipeObj = v.recipe ?? v.raw?.recipe ?? {};
      if (typeof recipeObj === 'string') {
        try { recipeObj = JSON.parse(recipeObj); } catch(e) { recipeObj = {}; }
      }
      if (recipeObj?.recipe) recipeObj = recipeObj.recipe;

      const sumEngTitle = safeStr(summaryObj?.english?.title).trim();
      const recEngTitle = safeStr(recipeObj?.english?.title).trim();
      const dbTitle = safeStr(v.summary_title ?? v.summaryTitle).trim();
      
      let passedTitle = safeStr(v.title).trim();
      const captionCutoff = safeStr(v.caption ?? '').split('\n')[0].substring(0, 56).trim();
      if (passedTitle === captionCutoff || passedTitle.length === 56) {
        passedTitle = '';
      }

      title = sumEngTitle || recEngTitle || dbTitle || passedTitle || summaryObj?.title || safeStr(v.caption ?? '').split('\n')[0].trim() || t('organizer:untitledVideo', 'Saved Video');
      
      return { ...v, title };
    });

    if (searchQuery) {
      filtered = filtered.filter(v => v.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    return filtered;
  }, [videos, selectedFolderId, searchQuery, t]);

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

  // ✅ Create folder from inline move panel then immediately move selected videos into it
  const handleInlineFolderCreateAndMove = async () => {
    if (!inlineFolderName.trim()) return;
    setInlineFolderError(null);
    try {
      await addFolder(inlineFolderName.trim(), inlineFolderParentId || null);
      // Find the newly created folder by name after it's added
      const newFolder = folders.find(f => f.name === inlineFolderName.trim()) ??
        folders.flatMap(f => f.subFolders || []).find(f => f.name === inlineFolderName.trim());
      if (newFolder?.id) {
        handleMoveSelected(newFolder.id);
      }
      setIsInlineFolderCreate(false);
      setInlineFolderName('');
      setInlineFolderParentId('');
    } catch (err: any) {
      setInlineFolderError(err.message || t('organizer:errorFolderExists'));
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
    if (targetId === CREATE_NEW_FOLDER_VALUE) {
      setIsInlineFolderCreate(true);
      return;
    }
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

  const mainSelectorOptions: DropdownOption[] = [
    { value: 'all', label: t('organizer:myVideos', 'My videos'), icon: <LayoutGrid size={18} className="text-primary-600" /> },
    { value: 'unsorted', label: t('organizer:unsorted'), icon: <Inbox size={18} className="text-primary-600" /> },
    { value: 'favorites', label: t('organizer:favorites'), icon: <Heart size={18} className="text-primary-600" /> },
    { divider: true, value: 'div1', label: '' },
    ...folders.flatMap(f => [
      { value: f.id, label: f.name, icon: <Folders size={18} className="text-primary-600" /> },
      ...(f.subFolders || []).map(sub => ({
        value: sub.id, label: sub.name, icon: <CornerDownRight size={14} strokeWidth={2.5} className="text-gray-400 group-hover:text-primary-500" />, isSub: true
      }))
    ])
  ];

  const moveSelectorOptions: DropdownOption[] = [
    { value: 'unsorted', label: t('organizer:unsorted'), icon: <Inbox size={18} className="text-primary-600" /> },
    { divider: true, value: 'div1', label: '' },
    ...folders.filter(f => !['all', 'favorites', 'archive', 'unsorted'].includes(f.id)).flatMap(f => [
      { value: f.id, label: f.name, icon: <Folders size={18} className="text-primary-600" /> },
      ...(f.subFolders || []).map(sub => ({
        value: sub.id, label: sub.name, icon: <CornerDownRight size={14} strokeWidth={2.5} className="text-gray-400 group-hover:text-primary-500" />, isSub: true
      }))
    ]),
    { divider: true, value: 'div_create', label: '' },
    // ✅ "New folder" action at bottom of move dropdown
    {
      value: CREATE_NEW_FOLDER_VALUE,
      label: t('organizer:newFolder', 'New folder'),
      icon: <FolderPlus size={16} className="text-primary-600" />,
      isAction: true,
    },
  ];

  const parentCreationOptions: DropdownOption[] = [
    { value: '', label: t('organizer:topLevel', 'Top level'), icon: <LayoutGrid size={16} /> },
    { divider: true, value: 'div1', label: '' },
    ...folders.filter(f => !['all', 'favorites', 'archive', 'unsorted'].includes(f.id) && !f.isSystem).map(f => (
      { value: f.id, label: t('organizer:insideFolder', { name: f.name }), icon: <Folders size={16} /> }
    ))
  ];

  return (
    <div className="flex flex-col w-full h-full pt-4 md:pt-0">
      
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('organizer:title')}</h1>
          <p className="text-gray-500 text-xs md:text-sm mt-1">{t('organizer:subtitle', 'Create collections and sort your library')}</p>
        </div>
      </div>

      <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm mb-24 md:mb-8">
        
        {/* 1. MAIN HEADER TOOLBAR */}
        <div className="h-16 border-b border-gray-100 flex items-center justify-between px-4 md:px-6 bg-white rounded-t-2xl sticky top-0 z-50 shadow-sm">
          <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
            {isRenaming ? (
              <div className="flex items-center gap-2 w-full">
                <input 
                  autoFocus
                  className="text-base font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1 flex-1 min-w-0 focus:ring-2 focus:ring-primary-500 outline-none max-w-[160px] md:max-w-xs"
                  value={renameValue}
                  onChange={e => { setRenameValue(e.target.value); setActionError(null); }}
                  onKeyDown={e => e.key === 'Enter' && handleRename()}
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button type="button" onClick={handleRename} className="p-1.5 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition-colors flex-shrink-0"><Check size={18} /></button>
                  <button type="button" onClick={() => { setIsRenaming(false); setActionError(null); }} className="p-1.5 text-gray-400 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"><X size={18} /></button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 w-full min-w-0">
                <span className="text-gray-500 font-medium text-sm hidden sm:inline-block whitespace-nowrap mr-1 flex-shrink-0">
                  {t('organizer:selectFolder')}
                </span>
                <div className="flex-1 min-w-0">
                  <CustomDropdown 
                    value={selectedFolderId}
                    onChange={setSelectedFolderId}
                    options={mainSelectorOptions}
                    placeholder={t('organizer:placeholderSelectFolder')}
                    triggerClassName="appearance-none w-full bg-transparent font-bold text-base text-gray-900 outline-none cursor-pointer flex items-center justify-between hover:opacity-70 transition-opacity"
                  />
                </div>
                {!['all', 'unsorted', 'favorites', 'archive'].includes(selectedFolderId) && (
                  <div className="flex items-center gap-1 ml-1 flex-shrink-0">
                    <button 
                      type="button"
                      onClick={() => { setRenameValue(selectedFolder?.name || ''); setIsRenaming(true); }}
                      className="text-gray-400 hover:text-primary-600 hover:bg-primary-50 p-1.5 rounded-lg transition-colors"
                      title={t('common:rename', 'Rename')}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      type="button"
                      onClick={handleDeleteFolder}
                      className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                      title={t('organizer:deleteFolder')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 md:gap-3 flex-shrink-0 ml-auto pl-2">
            {selectedVideoIds.size > 0 && (
              <button
                onClick={() => setSelectedVideoIds(new Set())}
                className="hidden md:flex items-center gap-1 px-3 py-1 bg-red-50 text-red-600 border border-red-100 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors flex-shrink-0"
              >
                <X size={14} /> {t('organizer:cancel')}
              </button>
            )}
            <span className="text-xs text-primary-600 font-bold px-2.5 py-1 bg-primary-50 border border-primary-100 rounded-lg whitespace-nowrap flex-shrink-0">
              {t('organizer:itemsCount', { count: folderVideos.length })}
            </span>
            {lastAction && (
              <button 
                type="button"
                onClick={handleUndo}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-black transition-colors shadow-sm animate-fade-in flex-shrink-0"
              >
                <Undo2 size={14} />
                <span className="hidden md:inline">{t('organizer:undoMove')}</span>
              </button>
            )}
            <div className="flex bg-gray-100 p-1 rounded-lg flex-shrink-0">
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
          <div className="px-6 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2 text-red-600 text-sm font-bold animate-fade-in">
            <AlertTriangle size={16} />
            <span>{actionError}</span>
          </div>
        )}

        {/* 2. ACTION BAR */}
        <div className="px-4 md:px-6 py-3 bg-gray-50/50 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-16 z-40 backdrop-blur-sm">
          <div className="flex items-center gap-2 w-full sm:max-w-xs md:max-w-md">
            <div className="relative w-full flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                placeholder={t('organizer:searchInFolder')} 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
              />
            </div>
            {selectedVideoIds.size === 0 && (
              <button 
                type="button"
                onClick={() => { setIsCreating(!isCreating); setActionError(null); setNewFolderName(''); setCreationParentId(selectedFolderId === 'unsorted' || selectedFolderId === 'all' ? '' : selectedFolderId); }}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-50 border border-primary-100 text-primary-600 hover:bg-primary-100 rounded-xl transition-all shadow-sm active:scale-95 whitespace-nowrap shrink-0"
              >
                <Plus size={20} className="shrink-0" />
                <span className="hidden sm:inline font-bold text-sm">{t('organizer:newFolder', 'New')}</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto overflow-visible">
            {selectedVideoIds.size > 0 && (
              <div className="flex items-center gap-3 animate-fade-in bg-primary-50 pl-3 pr-1 py-1 rounded-xl border border-primary-100 ml-auto w-full sm:w-auto">
                <span className="text-xs font-bold text-primary-700 whitespace-nowrap">
                  {t('organizer:selectedCount', { count: selectedVideoIds.size })}
                </span>
                <CustomDropdown 
                  value=""
                  onChange={(val) => handleMoveSelected(val)}
                  options={moveSelectorOptions}
                  placeholder={t('organizer:moveToFolder')}
                  triggerClassName="flex items-center justify-between bg-white border border-primary-200 text-primary-900 rounded-lg px-3 py-1.5 text-xs font-bold hover:border-primary-300 transition-colors focus:ring-2 focus:ring-primary-500 shadow-sm min-w-[140px]"
                />
              </div>
            )}
          </div>
        </div>

        {/* ✅ INLINE CREATE-AND-MOVE panel — appears below action bar when triggered from move dropdown */}
        {isInlineFolderCreate && (
          <div className="px-4 md:px-6 py-4 bg-primary-50/80 border-b border-primary-100 flex flex-col gap-3 animate-fade-in">
            <div className="text-xs font-bold text-primary-700 uppercase tracking-wider flex items-center gap-2">
              <FolderPlus size={14} />
              {t('organizer:createAndMove', 'Create folder and move selected')}
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 w-full">
              <div className="w-full sm:w-48 flex-shrink-0">
                <CustomDropdown 
                  value={inlineFolderParentId}
                  onChange={(val) => { setInlineFolderParentId(val); setInlineFolderError(null); }}
                  options={parentCreationOptions}
                  placeholder={t('organizer:placeholderSelectFolder')}
                  triggerClassName="flex items-center justify-between w-full bg-white border border-primary-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:border-primary-300 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm"
                />
              </div>
              <div className="flex items-center gap-2 w-full flex-1 min-w-0">
                <input 
                  ref={inlineInputRef}
                  placeholder={t('organizer:folderNamePlaceholder')}
                  value={inlineFolderName}
                  onChange={e => { setInlineFolderName(e.target.value); setInlineFolderError(null); }}
                  onKeyDown={e => e.key === 'Enter' && handleInlineFolderCreateAndMove()}
                  className={`flex-1 min-w-0 bg-white border rounded-lg px-3 py-2 text-sm outline-none transition-all shadow-sm ${inlineFolderError ? 'border-red-400 focus:ring-2 focus:ring-red-500' : 'border-gray-200 focus:ring-2 focus:ring-primary-500'}`}
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button 
                    type="button" 
                    onClick={handleInlineFolderCreateAndMove}
                    disabled={!inlineFolderName.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-lg shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold whitespace-nowrap"
                  >
                    <Check size={14} />
                    {t('organizer:createAndMoveBtn', 'Create & Move')}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => { setIsInlineFolderCreate(false); setInlineFolderName(''); setInlineFolderError(null); }} 
                    className="p-2 text-gray-400 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors flex-shrink-0"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            </div>
            {inlineFolderError && (
              <div className="flex items-center gap-1 text-red-500 text-xs font-bold animate-fade-in">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{inlineFolderError}</span>
              </div>
            )}
          </div>
        )}

        {/* 3. NEW FOLDER INLINE CREATION (from top bar button) */}
        {isCreating && (
          <div className="px-4 md:px-6 py-4 bg-primary-50/80 border-b border-primary-100 flex flex-col gap-3 animate-fade-in">
            <div className="text-xs font-bold text-primary-700 uppercase tracking-wider flex items-center gap-2">
              <CornerDownRight size={14} /> {t('organizer:createFolder')}
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 w-full">
              <div className="w-full sm:flex-1 min-w-0">
                <CustomDropdown 
                  value={creationParentId}
                  onChange={(val) => { setCreationParentId(val); setActionError(null); }}
                  options={parentCreationOptions}
                  placeholder={t('organizer:placeholderSelectFolder')}
                  triggerClassName="flex items-center justify-between w-full bg-white border border-primary-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:border-primary-300 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm"
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:flex-1 mt-2 sm:mt-0 min-w-0">
                <input 
                  autoFocus 
                  placeholder={t('organizer:folderNamePlaceholder')} 
                  value={newFolderName}
                  onChange={e => { setNewFolderName(e.target.value); setActionError(null); }}
                  onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                  className={`w-full flex-1 min-w-0 bg-white border rounded-lg px-3 py-2 text-sm outline-none transition-all shadow-sm ${actionError ? 'border-red-400 focus:ring-2 focus:ring-red-500' : 'border-gray-200 focus:ring-2 focus:ring-primary-500'}`}
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button 
                    type="button" 
                    onClick={handleCreateFolder} 
                    disabled={!newFolderName.trim()}
                    className="p-2 bg-primary-600 text-white rounded-lg shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    <Check size={18} />
                  </button>
                  <button type="button" onClick={() => { setIsCreating(false); setActionError(null); }} className="p-2 text-gray-400 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors flex-shrink-0">
                    <X size={18} />
                  </button>
                </div>
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
        <div className="flex-1 p-4 md:p-6 bg-gray-50/10 min-h-[50vh]">
          <div>
            {folderVideos.length === 0 ? (
              <div className="text-center py-24 border-2 border-dashed border-gray-100 rounded-3xl bg-white/50">
                <Inbox size={48} className="mx-auto text-gray-200 mb-4" />
                <p className="text-gray-400 text-sm font-medium">{t('organizer:noVideos')}</p>
              </div>
            ) : (
              <div className={viewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4" : "space-y-3"}>
                {folderVideos.map((video: any) => (
                  <div 
                    key={video.id}
                    draggable
                    onDragStart={(e) => {
                      let idsToMove = [video.id];
                      if (selectedVideoIds.has(video.id)) idsToMove = Array.from(selectedVideoIds);
                      e.dataTransfer.setData('videoIds', JSON.stringify(idsToMove));

                      const idsToMoveLabel =
                        idsToMove.length > 1 ? `${idsToMove.length} reels` : '1 reel';

                      const dragGhost = document.createElement('div');
                      dragGhost.style.position = 'fixed';
                      dragGhost.style.top = '-1000px';
                      dragGhost.style.left = '-1000px';
                      dragGhost.style.padding = '8px 12px';
                      dragGhost.style.borderRadius = '999px';
                      dragGhost.style.background = 'white';
                      dragGhost.style.boxShadow = '0 12px 30px rgba(0,0,0,0.20)';
                      dragGhost.style.fontSize = '13px';
                      dragGhost.style.fontWeight = '800';
                      dragGhost.style.color = '#111827';
                      dragGhost.textContent = idsToMoveLabel;

                      document.body.appendChild(dragGhost);
                      e.dataTransfer.setDragImage(dragGhost, 18, 18);

                      setTimeout(() => {
                        dragGhost.remove();
                      }, 0);

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
                        : `flex items-center gap-4 p-2.5 sm:p-3 rounded-2xl border-2 ${selectedVideoIds.has(video.id) ? 'bg-primary-50 border-primary-500 shadow-sm shadow-primary-500/10' : 'border-gray-100 hover:border-primary-200 shadow-sm'}`
                      }
                      hover:-translate-y-1 active:cursor-grabbing
                    `}
                  >
                    {viewMode === 'grid' ? (
                      <>
                        <div className={`absolute top-3 left-3 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shadow-sm ${selectedVideoIds.has(video.id) ? 'bg-primary-500 border-primary-500' : 'bg-black/30 border-white/80 hover:bg-black/40'}`}>
                          {selectedVideoIds.has(video.id) && <Check size={12} className="text-white" strokeWidth={3} />}
                        </div>
                        <img src={video.thumbnailUrl || video.gcs_urls?.preview_thumbnail} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80" />
                        <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
                          <p className="text-white text-sm font-bold leading-snug line-clamp-2">{video.title}</p>
                          <p className="text-gray-300 text-xs mt-1 truncate">{video.author_name || video.author}</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 shadow-sm border border-gray-200/60">
                          <div className={`absolute top-2 left-2 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shadow-sm ${selectedVideoIds.has(video.id) ? 'bg-primary-500 border-primary-500' : 'bg-black/30 border-white/80 hover:bg-black/40'}`}>
                            {selectedVideoIds.has(video.id) && <Check size={12} className="text-white" strokeWidth={3} />}
                          </div>
                          <img src={video.thumbnailUrl || video.gcs_urls?.preview_thumbnail} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        </div>
                        <div className="flex-1 min-w-0 pr-2">
                          <h4 className={`text-sm sm:text-base font-bold leading-snug whitespace-normal line-clamp-2 break-words ${selectedVideoIds.has(video.id) ? 'text-primary-900' : 'text-gray-900'}`}>
                            {video.title}
                          </h4>
                          <p className="text-xs sm:text-sm text-gray-500 truncate mt-1.5">{video.author_name || video.author}</p>
                        </div>
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