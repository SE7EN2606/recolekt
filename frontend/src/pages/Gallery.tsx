import { API_BASE } from "../utils/api";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { VideoCard } from '../components/VideoCard';
import { Search, Settings2, Trash2, MoreVertical, Pencil, ChevronRight, Move, LayoutGrid, Folder, ArrowRight, Check, X, CircleX } from 'lucide-react';
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


// ─────────────────────────────────────────────────────────────────────────────
// Rename Modal
// ─────────────────────────────────────────────────────────────────────────────
interface RenameFolderModalProps {
  isOpen: boolean;
  currentName: string;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
}
const RenameFolderModal: React.FC<RenameFolderModalProps> = ({ isOpen, currentName, onClose, onRename }) => {
  const { t } = useTranslation('modals');
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (isOpen) setName(currentName); }, [isOpen, currentName]);
  if (!isOpen) return null;
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try { await onRename(name.trim()); onClose(); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in">
        <h2 className="text-lg font-bold text-gray-900 mb-4">{t('editCollection', 'Edit Collection')}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            placeholder={t('collectionNamePlaceholder', 'Collection name...')}
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 active:bg-gray-200 rounded-xl transition-colors">
              {t('cancel', 'Cancel')}
            </button>
            <button type="submit" disabled={saving || !name.trim()} className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-xl hover:bg-primary-700 active:bg-primary-800 active:scale-95 disabled:opacity-50 transition-all">
              {saving ? t('saving', 'Saving…') : t('save', 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


// ─────────────────────────────────────────────────────────────────────────────
// Move Collection Modal — wizard UI
// ─────────────────────────────────────────────────────────────────────────────
interface MoveFolderModalProps {
  isOpen: boolean;
  folderId: string;
  folderName: string;
  folders: any[];
  onClose: () => void;
  onMove: (newParentId: string | null) => Promise<void>;
}
const MoveFolderModal: React.FC<MoveFolderModalProps> = ({ isOpen, folderId, folderName, folders, onClose, onMove }) => {
  const { t } = useTranslation('modals');
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const [moving, setMoving] = useState(false);
  const [initialised, setInitialised] = useState(false);

  useEffect(() => { if (isOpen) { setStep('pick'); } }, [isOpen]);

  if (!isOpen) return null;

  const flattenFolders = (list: any[], parentId: string | null = null): any[] => {
    const result: any[] = [];
    for (const f of list) {
      result.push({ ...f, parent_id: f.parent_id ?? parentId });
      if (f.subFolders?.length) result.push(...flattenFolders(f.subFolders, f.id));
    }
    return result;
  };
  const flatFolders = flattenFolders(folders);

  const getDescendantIds = (id: string): string[] => {
    const result: string[] = [];
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = flatFolders.filter((f: any) => f.parent_id === current);
      for (const child of children) { result.push(child.id); queue.push(child.id); }
    }
    return result;
  };

  const descendantIds = getDescendantIds(folderId);
  const invalidIds = new Set([folderId, ...descendantIds]);
  const allEligible = flatFolders.filter((f: any) => !invalidIds.has(f.id));

  const currentFolder = flatFolders.find((f: any) => f.id === folderId);
  const currentParentId = currentFolder?.parent_id || null;
  const hasSubFolders = flatFolders.some((f: any) => f.parent_id === folderId);

  useEffect(() => {
    if (isOpen && !initialised) { setSelectedParent(currentParentId); setInitialised(true); }
    if (!isOpen) setInitialised(false);
  }, [isOpen, currentParentId, initialised]);

  const selectedName = selectedParent === null
    ? t('mainLibrary', 'Main Library')
    : flatFolders.find((f: any) => f.id === selectedParent)?.name || '';

  const handleConfirm = async () => {
    setMoving(true);
    try { await onMove(selectedParent); onClose(); } finally { setMoving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md animate-fade-in overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Move size={22} className="text-amber-600" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900 leading-tight">{t('moveCollection', 'Move Collection')}</h2>
            <p className="text-sm text-gray-500">"{folderName}"</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 active:bg-gray-200 active:scale-95 rounded-full transition-all">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="border-t border-gray-100" />

        {step === 'pick' ? (
          <>
            <div className="px-5 pt-4 pb-2">
              <p className="text-[11px] font-bold text-gray-400 tracking-widest uppercase mb-3">
                {t('selectDestination', 'Select Destination')}
              </p>
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto -mx-1 px-1">

                <button
                  onClick={() => setSelectedParent(null)}
                  className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all active:scale-[0.98] ${
                    selectedParent === null
                      ? 'bg-purple-50 border-purple-500'
                      : 'bg-gray-50 border-transparent hover:bg-gray-100 hover:border-gray-200'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${selectedParent === null ? 'bg-purple-600' : 'bg-gray-200'}`}>
                    <LayoutGrid size={18} className={selectedParent === null ? 'text-white' : 'text-gray-500'} aria-hidden="true" />
                  </div>
                  <span className={`font-semibold flex-1 text-left text-sm ${selectedParent === null ? 'text-purple-700' : 'text-gray-800'}`}>
                    {t('mainLibraryRoot', 'Main Library (Root)')}
                  </span>
                  {selectedParent === null && <Check size={18} className="text-purple-600 flex-shrink-0" aria-hidden="true" />}
                </button>

                {allEligible.map((f: any) => {
                  const isSubFolder = !!f.parent_id;
                  const isSelected = selectedParent === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setSelectedParent(f.id)}
                      className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all active:scale-[0.98] ${isSubFolder ? 'ml-5' : ''} ${
                        isSelected
                          ? 'bg-purple-50 border-purple-500'
                          : 'bg-gray-50 border-transparent hover:bg-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-purple-600' : 'bg-gray-200'}`}>
                        <Folder size={18} className={isSelected ? 'text-white' : 'text-gray-500'} aria-hidden="true" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className={`font-semibold text-sm ${isSelected ? 'text-purple-700' : 'text-gray-800'}`}>{f.name}</p>
                        {isSubFolder && <p className="text-xs text-gray-400 mt-0.5">{t('subCollection', 'Sub-collection')}</p>}
                      </div>
                      {isSelected && <Check size={18} className="text-purple-600 flex-shrink-0" aria-hidden="true" />}
                    </button>
                  );
                })}

                {allEligible.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">{t('noOtherCollections', 'No other collections available.')}</p>
                )}
              </div>

              {hasSubFolders && selectedParent !== currentParentId && (
                <div className="mt-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                  ⚠️ {t('moveWarning', 'Moving "{{name}}" will also move all its sub-collections.', { name: folderName })}
                </div>
              )}
            </div>

            <div className="px-5 pb-5 pt-3">
              <button
                onClick={() => setStep('confirm')}
                disabled={selectedParent === currentParentId}
                className="w-full h-14 bg-purple-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-purple-700 active:bg-purple-800 active:scale-[0.98] transition-all disabled:opacity-40 disabled:scale-100 disabled:cursor-not-allowed shadow-md shadow-purple-200"
              >
                <span>{t('next', 'Next')}</span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-6 pt-6 pb-4 flex flex-col items-center">
              <div className="flex items-center gap-5 mb-6">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <Folder size={28} className="text-gray-400" aria-hidden="true" />
                  </div>
                  <span className="text-sm text-gray-500 font-medium">{folderName}</span>
                </div>
                <ArrowRight size={22} className="text-purple-500 flex-shrink-0 mt-[-16px]" aria-hidden="true" />
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center">
                    {selectedParent === null
                      ? <LayoutGrid size={28} className="text-purple-600" aria-hidden="true" />
                      : <Folder size={28} className="text-purple-600" aria-hidden="true" />
                    }
                  </div>
                  <span className="text-sm text-purple-600 font-semibold">{selectedName}</span>
                </div>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{t('confirmMove', 'Confirm Move')}</h3>
              <p className="text-sm text-gray-500 text-center leading-relaxed">
                {t('confirmMoveDesc', 'Moving "{{name}}" will change its position in your library. All videos inside will remain intact.', { name: folderName })}
              </p>
            </div>

            <div className="border-t border-gray-100" />

            <div className="p-4 flex gap-3">
              <button
                onClick={() => setStep('pick')}
                className="flex-1 h-14 bg-white border-2 border-gray-200 text-gray-700 font-bold rounded-2xl hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100 active:scale-[0.98] transition-all"
              >
                {t('back', 'Back')}
              </button>
              <button
                onClick={handleConfirm}
                disabled={moving}
                className="flex-1 h-14 bg-purple-600 text-white font-bold rounded-2xl hover:bg-purple-700 active:bg-purple-800 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 shadow-md shadow-purple-200"
              >
                {moving ? t('moving', 'Moving…') : t('confirmMove', 'Confirm Move')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};


// ─────────────────────────────────────────────────────────────────────────────
// Delete Confirm Modal
// ─────────────────────────────────────────────────────────────────────────────
interface ConfirmDeleteModalProps {
  isOpen: boolean;
  folderName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}
const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({ isOpen, folderName, onClose, onConfirm }) => {
  const { t } = useTranslation('modals');
  const [deleting, setDeleting] = useState(false);
  if (!isOpen) return null;
  const handleConfirm = async () => {
    setDeleting(true);
    try { await onConfirm(); onClose(); } finally { setDeleting(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in">
        <h2 className="text-lg font-bold text-gray-900 mb-2">{t('deleteCollection', 'Delete Collection')}</h2>
        <p className="text-sm text-gray-500 mb-1">
          {t('deleteQuestion', 'Delete')} <span className="font-semibold text-gray-700">"{folderName}"</span>?
        </p>
        <p className="text-sm text-gray-400 mb-6">
          {t('deleteWarning', "Your videos won't be deleted — they'll be moved back to your main library.")}
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 active:bg-gray-200 rounded-xl transition-colors">
            {t('cancel', 'Cancel')}
          </button>
          <button onClick={handleConfirm} disabled={deleting} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 active:bg-red-800 active:scale-95 disabled:opacity-50 transition-all">
            {deleting ? t('deleting', 'Deleting…') : t('delete', 'Delete')}
          </button>
        </div>
      </div>
    </div>
  );
};


// ─────────────────────────────────────────────────────────────────────────────
// Main Gallery
// ─────────────────────────────────────────────────────────────────────────────
export const Gallery: React.FC = () => {
  const { folderId: folderParam } = useParams<{ folderId?: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const { user, loading: authLoading } = useAuth();
  const {
    videos,
    folders,
    isLoading: dataLoading,
    refreshVideos,
    moveVideos,
    deleteVideos,
    deleteFolder,
    updateFolder,
  } = useData();
  const { t } = useTranslation(['gallery', 'common', 'sidebar', 'modals']);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);

  const [msgIndex, setMsgIndex] = useState(0);
  const [scanState, setScanState] = useState<'h-active' | 'v-active'>('h-active');

  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isMoveFolderModalOpen, setIsMoveFolderModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Flatten folder tree once ─────────────────────────────────────────────
  const flatFolders = useMemo(() => {
    const flat = (list: any[], inheritedParentId: string | null = null): any[] => {
      const result: any[] = [];
      for (const f of list) {
        result.push({ ...f, parent_id: f.parent_id ?? inheritedParentId });
        if (f.subFolders?.length) result.push(...flat(f.subFolders, f.id));
      }
      return result;
    };
    return flat(folders);
  }, [folders]);

  // ── Resolve slug or legacy fld_xxx → real folder record ─────────────────
  const resolvedFolder = useMemo(() => {
    if (!folderParam) return null;
    if (['favorites', 'all', 'unsorted'].includes(folderParam)) return null;
    return flatFolders.find((f: any) => f.slug === folderParam || f.id === folderParam) ?? null;
  }, [folderParam, flatFolders]);

  const folderId = resolvedFolder?.id ?? folderParam;

  const isFavoritesView = folderId === 'favorites';
  const isAllView = !folderId || folderId === 'all';
  const isUnsortedView = folderId === 'unsorted';
  const isCustomFolder = !isFavoritesView && !isAllView && !isUnsortedView && !!folderId;

  // ── Auth guard ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) navigate('/auth', { replace: true });
  }, [authLoading, user, navigate]);

  // ── Handle ?new= param ───────────────────────────────────────────────────
  useEffect(() => {
    const newTempId = searchParams.get('new');
    if (newTempId) {
      refreshVideos();
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [searchParams, refreshVideos]);

  // ── Reset state on folder change ─────────────────────────────────────────
  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setShowFolderMenu(false);
  }, [folderId, location.pathname, location.key]);

  // ── Processing animations ────────────────────────────────────────────────
  useEffect(() => {
    const hasProcessing = videos.some((v: any) => v.category === 'Processing' || v.status === 'processing');
    if (!hasProcessing) return;
    const msgInterval = setInterval(() => setMsgIndex(p => (p + 1) % PROCESSING_MESSAGES.length), 2000);
    const scanSequencer = setInterval(() => setScanState(p => p === 'h-active' ? 'v-active' : 'h-active'), 4000);
    return () => { clearInterval(msgInterval); clearInterval(scanSequencer); };
  }, [videos]);

  // ── Click-outside for folder menu ────────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowFolderMenu(false);
    };
    if (showFolderMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFolderMenu]);

  // ── Lock body scroll when any overlay is open ────────────────────────────
  useEffect(() => {
    const isAnyOpen = showFolderMenu || isMoveModalOpen || isRenameModalOpen || isMoveFolderModalOpen || isDeleteConfirmOpen;
    document.body.style.overflow = isAnyOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showFolderMenu, isMoveModalOpen, isRenameModalOpen, isMoveFolderModalOpen, isDeleteConfirmOpen]);

  // ── Filtered + sorted videos ─────────────────────────────────────────────
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
      const aP = a.category === 'Processing' || a.status === 'processing';
      const bP = b.category === 'Processing' || b.status === 'processing';
      if (aP && !bP) return -1;
      if (!aP && bP) return 1;
      const dA = new Date(a.savedAt || a.created_at || 0).getTime();
      const dB = new Date(b.savedAt || b.created_at || 0).getTime();
      return sortOrder === 'desc' ? dB - dA : dA - dB;
    });
  }, [videos, folderId, isFavoritesView, isAllView, isUnsortedView, searchQuery, sortOrder]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const handleCancelSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
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

  const resolveFolderName = (): string => {
    if (!folderId) return '';
    const found = flatFolders.find((f: any) => f.id === folderId);
    return found?.name || folderId;
  };

  const handleRenameFolder = async (newName: string) => {
    if (!folderId) return;
    await updateFolder(folderId, newName);
    await refreshVideos();
  };

  const handleMoveFolder = async (newParentId: string | null) => {
    if (!folderId) return;
    await updateFolder(folderId, resolveFolderName(), newParentId);
    await refreshVideos();
  };

  const handleDeleteFolder = async () => {
    if (!folderId) return;
    const videosInFolder = videos.filter((v: any) => v.folderId === folderId);
    if (videosInFolder.length > 0) {
      const ids = videosInFolder.map((v: any) => v.id ?? v.process_id ?? v.processId);
      await moveVideos(ids, 'unsorted');
    }
    await deleteFolder(folderId);
    navigate('/gallery', { replace: true });
  };

  const getFolderTitle = (): string => {
    if (isFavoritesView) return t('gallery:favorites');
    if (isAllView) return t('gallery:myVideos');
    if (isUnsortedView) return t('sidebar:unsorted', 'Unsorted');
    const found = flatFolders.find((f: any) => f.id === folderId);
    if (found) return found.name;
    return folderId ? folderId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : t('gallery:gallery');
  };

  const getFolderSubtitle = (): string => {
    if (isFavoritesView) return t('gallery:subtitleFavorites', 'Your most loved videos in one place');
    if (isAllView) return t('gallery:subtitleAll', 'Browse, search, and manage all your saved videos');
    if (isUnsortedView) return t('gallery:subtitleUnsorted', 'Videos waiting to be organized into collections');
    return t('gallery:subtitleFolder', 'Manage videos in this collection');
  };

  const showSkeleton = authLoading || (dataLoading && videos.length === 0);
  if (showSkeleton) return (
    <div className="w-full pt-4 md:pt-0 animate-pulse">
      <div className="h-8 bg-gray-200 rounded-lg w-48 mb-2" />
      <div className="h-4 bg-gray-100 rounded-lg w-64 mb-8" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[9/16] rounded-2xl bg-gray-200/60" />)}
      </div>
    </div>
  );
  if (!user) return null;

  const folderTitle = getFolderTitle();

  return (
    <div className="w-full pt-4 md:pt-0 pb-0 md:pb-6 animate-fade-in">
      <div className="flex flex-col gap-6 mb-8">

        {/* ── Header row ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">

          {/* LEFT: title + subtitle + folder context menu */}
          <div className="min-w-0 flex-1">
            {selectionMode ? (
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('gallery:moveModeOn', 'Move mode on')}</h1>
                <p className="text-gray-500 text-xs md:text-sm mt-0.5">{t('gallery:moveModeHint', 'Select videos then tap Move')}</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate">{folderTitle}</h1>

                  {isCustomFolder && (
                    <div className="relative flex-shrink-0 ml-2" ref={menuRef}>
                      <button
                        onClick={() => setShowFolderMenu(v => !v)}
                        className={`p-1.5 rounded-lg border transition-all ${
                          showFolderMenu
                            ? 'text-primary-600 bg-primary-50 border-primary-400'
                            : 'text-gray-400 border-gray-200 hover:text-gray-600 hover:bg-gray-100 hover:border-gray-300 active:bg-gray-200 active:scale-95'
                        }`}
                        title={t('gallery:collectionOptions', 'Collection options')}
                      >
                        <MoreVertical size={18} aria-hidden="true" />
                      </button>

                      {showFolderMenu && (
                        <div className="absolute left-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 py-2 animate-fade-in">
                          <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase px-4 py-2">
                            {t('modals:collectionActions', 'Collection Actions')}
                          </p>
                          <button
                            onClick={() => { setIsRenameModalOpen(true); setShowFolderMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 active:scale-[0.98] transition-all"
                          >
                            <Pencil size={16} className="text-gray-400" aria-hidden="true" />
                            <span className="font-medium">{t('modals:rename', 'Rename')}</span>
                          </button>
                          <button
                            onClick={() => { setIsMoveFolderModalOpen(true); setShowFolderMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 active:scale-[0.98] transition-all"
                          >
                            <Move size={16} className="text-gray-400" aria-hidden="true" />
                            <span className="font-medium">{t('modals:moveTo', 'Move to...')}</span>
                          </button>
                          <div className="mx-3 my-1 border-t border-gray-100" />
                          <button
                            onClick={() => { setIsDeleteConfirmOpen(true); setShowFolderMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-500 hover:bg-red-50 active:bg-red-100 active:scale-[0.98] transition-all"
                          >
                            <Trash2 size={16} className="text-red-400" aria-hidden="true" />
                            <span className="font-medium">{t('modals:delete', 'Delete')}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-gray-500 text-xs md:text-sm mt-0.5">{getFolderSubtitle()}</p>
              </div>
            )}
          </div>

          {/* RIGHT: item count + controls — fixed h-10 prevents layout shift */}
          <div className="flex items-center gap-2 flex-shrink-0 h-10">

            {!selectionMode && (
              <span className="hidden sm:inline-flex items-center px-3.5 py-1.5 rounded-xl bg-gray-100 border border-gray-200 text-primary-600 text-[13px] font-bold tracking-wide whitespace-nowrap">
                {displayedVideos.length} {t('gallery:items', 'items')}
              </span>
            )}

            <div className="flex items-center gap-2 h-10">
              {selectionMode ? (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  {/* Cancel */}
                  <button
                    onClick={handleCancelSelection}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-all shadow-sm active:scale-95"
                    title={t('modals:cancel', 'Cancel')}
                  >
                    <CircleX size={24} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                  {/* Trash — glows red on hover via .btn-trash-danger in index.css */}
                  <button
                    onClick={handleDelete}
                    disabled={selectedIds.size === 0}
                    className="btn-trash-danger"
                    title={t('common:delete', 'Delete')}
                  >
                    <Trash2 size={20} aria-hidden="true" />
                  </button>
                  {/* Move + count badge */}
                  <button
                    disabled={selectedIds.size === 0}
                    onClick={() => setIsMoveModalOpen(true)}
                    className="h-10 px-4 flex items-center justify-center gap-2 rounded-full bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 active:scale-95 transition-all shadow-md text-sm font-bold disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
                  >
                    <span>{t('gallery:move', 'Move')}</span>
                    {selectedIds.size > 0 && (
                      <span className="bg-white/25 w-6 py-0.5 rounded-md text-[11px] font-black text-center shadow-sm tabular-nums flex-shrink-0">
                        {selectedIds.size}
                      </span>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSelectionMode(true)}
                  className="w-10 md:w-auto h-10 md:px-4 flex items-center justify-center gap-2 rounded-full bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-all shadow-sm active:scale-95"
                  title={t('gallery:manage', 'Manage')}
                >
                  <Settings2 size={20} className="text-gray-600" aria-hidden="true" />
                  <span className="hidden md:inline text-sm font-bold">{t('gallery:manage', 'Manage')}</span>
                </button>
              )}
            </div>

          </div>
        </div>{/* ── end header row ── */}

        {/* ── Search + sort ─────────────────────────────────────────────── */}
        <div className="hidden md:flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={t('common:search')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none shadow-sm transition-all hover:bg-white/80"
            />
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          </div>
          <button
            onClick={() => setSortOrder(p => p === 'desc' ? 'asc' : 'desc')}
            className="p-3 bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl hover:bg-white/80 active:bg-white active:scale-95 transition-all text-gray-600 shadow-sm h-[46px] w-[46px] flex items-center justify-center"
            title={sortOrder === 'desc' ? t('gallery:sortOldest', 'Sort oldest first') : t('gallery:sortNewest', 'Sort newest first')}
          >
            {sortOrder === 'desc' ? <CalendarArrowUp size={20} /> : <CalendarArrowDown size={20} />}
          </button>
        </div>

      </div>{/* ── end flex flex-col gap-6 ── */}

      {/* ── Video grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-24 md:mb-12">
        {displayedVideos.map((video: any) => {
          const videoId = video?.id ?? video?.process_id ?? video?.processId ?? '';
          return (
            <div
              key={videoId}
              draggable={!selectionMode && video.category !== 'Processing'}
              onDragStart={e => {
                let idsToMove = [videoId];
                if (selectedIds.has(videoId)) idsToMove = Array.from(selectedIds);
                e.dataTransfer.setData('videoIds', JSON.stringify(idsToMove));
                e.dataTransfer.setData('sourceId', video.folderId || 'unsorted');
                e.dataTransfer.effectAllowed = 'move';
              }}
              className={!selectionMode && video.category !== 'Processing' ? 'cursor-grab active:cursor-grabbing' : ''}
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
            <Search className="text-gray-400" size={24} aria-hidden="true" />
          </div>
          <h3 className="text-gray-900 font-medium">{t('gallery:noVideosFound')}</h3>
          <p className="text-gray-500 text-sm mt-1">
            {searchQuery ? t('gallery:tryDifferentSearch') : t('gallery:noVideosInFolder')}
          </p>
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      <MoveCollectionModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        onMove={handleMoveSubmit}
        count={selectedIds.size}
      />

      <RenameFolderModal
        isOpen={isRenameModalOpen}
        currentName={folderTitle}
        onClose={() => setIsRenameModalOpen(false)}
        onRename={handleRenameFolder}
      />

      {isMoveFolderModalOpen && folderId && (
        <MoveFolderModal
          isOpen={isMoveFolderModalOpen}
          folderId={folderId}
          folderName={folderTitle}
          folders={folders}
          onClose={() => setIsMoveFolderModalOpen(false)}
          onMove={handleMoveFolder}
        />
      )}

      <ConfirmDeleteModal
        isOpen={isDeleteConfirmOpen}
        folderName={folderTitle}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDeleteFolder}
      />
    </div>
  );
};