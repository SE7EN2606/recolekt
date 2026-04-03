import { API_BASE } from "../utils/api";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { VideoCard } from '../components/VideoCard';
import { Button } from '../components/Button';
import { Search, Settings2, Trash2, CircleX, MoreVertical, Pencil, FolderInput, ChevronRight } from 'lucide-react';
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
// useSearch — server-side full-text search hook
// Falls back gracefully to null if the endpoint isn't available yet,
// so the client-side index in displayedVideos stays as a safety net.
// ─────────────────────────────────────────────────────────────────────────────
function useSearch(query: string, folderId: string | undefined) {
  const [results, setResults]     = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);  // empty query → let local index take over
      return;
    }

    const controller = new AbortController();

    // 300 ms debounce — fires only after the user pauses typing
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: query.trim() });
        if (folderId) params.set('folder_id', folderId);

        const res = await fetch(`${API_BASE}/search?${params}`, {
          signal: controller.signal,
          credentials: 'include',   // sends session cookie for Flask auth
          headers: { 'Content-Type': 'application/json' },
        });

        if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch (err: any) {
        if (err.name === 'AbortError') return;   // user typed again — ignore
        console.warn('[useSearch] falling back to client index:', err.message);
        setResults(null);   // fall back to local search index on any error
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, folderId]);

  // Reset when query is cleared
  useEffect(() => {
    if (!query.trim()) setResults(null);
  }, [query]);

  return { results, searching };
}

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
        <h2 className="text-lg font-bold text-gray-900 mb-4">Edit Collection</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            placeholder="Collection name"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
            <button type="submit" disabled={saving || !name.trim()} className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Move Collection Modal
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
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const [moving, setMoving] = useState(false);

  useEffect(() => { if (isOpen) { setSelectedParent(null); setStep('pick'); } }, [isOpen]);

  if (!isOpen) return null;

  const flattenFolders = (list: any[], parentId: string | null = null): any[] => {
    const result: any[] = [];
    for (const f of list) {
      result.push({ ...f, parent_id: f.parent_id ?? parentId });
      if (f.subFolders?.length) {
        result.push(...flattenFolders(f.subFolders, f.id));
      }
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
      for (const child of children) {
        result.push(child.id);
        queue.push(child.id);
      }
    }
    return result;
  };

  const descendantIds = getDescendantIds(folderId);
  const invalidIds = new Set([folderId, ...descendantIds]);
  const allEligible = flatFolders.filter((f: any) => !invalidIds.has(f.id));

  const selectedName = selectedParent === null
    ? 'Root (Main Library)'
    : flatFolders.find((f: any) => f.id === selectedParent)?.name || '';

  const targetHasChildren = selectedParent !== null && flatFolders.some((f: any) =>
    f.parent_id === selectedParent && !invalidIds.has(f.id)
  );

  const currentFolder = flatFolders.find((f: any) => f.id === folderId);
  const currentParentId = currentFolder?.parent_id || null;
  const hasSubFolders = flatFolders.some((f: any) => f.parent_id === folderId);

  const [initialised, setInitialised] = useState(false);
  useEffect(() => {
    if (isOpen && !initialised) {
      setSelectedParent(currentParentId);
      setInitialised(true);
    }
    if (!isOpen) setInitialised(false);
  }, [isOpen, currentParentId, initialised]);

  const handleConfirm = async () => {
    setMoving(true);
    try { await onMove(selectedParent); onClose(); } finally { setMoving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
        {step === 'pick' ? (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Move Collection</h2>
            <p className="text-sm text-gray-500 mb-5">
              Where should <span className="font-semibold text-gray-700">"{folderName}"</span> live?
            </p>

            <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
              <button
                onClick={() => setSelectedParent(null)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-all ${
                  selectedParent === null
                    ? 'border-primary-400 bg-primary-50 text-primary-700 font-medium'
                    : 'border-gray-100 bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="text-base">🏠</span>
                <div className="flex-1 text-left">
                  <p className="font-medium">Root — Main Library</p>
                  <p className="text-xs text-gray-400 mt-0.5">Make this a top-level collection</p>
                </div>
                {selectedParent === null && <div className="w-2 h-2 rounded-full bg-primary-500" />}
              </button>

              {allEligible.length > 0 && (
                <p className="text-xs text-gray-400 font-medium px-1 pt-2 pb-1">Or nest inside a collection:</p>
              )}

              {allEligible.map((f: any) => {
                const isSubFolder = !!f.parent_id;
                const parentName = isSubFolder ? flatFolders.find((p: any) => p.id === f.parent_id)?.name : null;
                const isSelected = selectedParent === f.id;
                const isCurrent = f.id === currentParentId;
                return (
                  <button
                    key={f.id}
                    onClick={() => setSelectedParent(f.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-all ${
                      isSelected
                        ? 'border-primary-400 bg-primary-50 text-primary-700 font-medium'
                        : 'border-gray-100 bg-gray-50 text-gray-700 hover:bg-gray-100'
                    } ${isSubFolder ? 'ml-4' : ''}`}
                  >
                    {isSubFolder && <ChevronRight size={12} className="text-gray-300 flex-shrink-0 -ml-1" />}
                    <span className="text-base">📁</span>
                    <div className="flex-1 text-left">
                      <p className="font-medium">{f.name}</p>
                      {isSubFolder && parentName && (
                        <p className="text-xs text-gray-400 mt-0.5">inside {parentName}</p>
                      )}
                    </div>
                    {isCurrent && !isSelected && (
                      <span className="text-xs text-gray-400 italic">current</span>
                    )}
                    {isSelected && <div className="w-2 h-2 rounded-full bg-primary-500" />}
                  </button>
                );
              })}

              {allEligible.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No other collections available.</p>
              )}
            </div>

            {targetHasChildren && selectedParent !== null && selectedParent !== currentParentId && (
              <div className="mt-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                ⚠️ This collection already has sub-collections. Your collection will be nested alongside them.
              </div>
            )}

            {hasSubFolders && selectedParent !== null && selectedParent !== currentParentId && (
              <div className="mt-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                ⚠️ <strong>"{folderName}"</strong> has sub-collections. Moving it will also move all its sub-collections with it.
              </div>
            )}

            <div className="flex gap-2 justify-end mt-5">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
              <button
                onClick={() => setStep('confirm')}
                disabled={selectedParent === currentParentId}
                className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-40 transition-colors"
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Confirm Move</h2>
            <p className="text-sm text-gray-600 mb-2">
              Move <span className="font-semibold text-gray-800">"{folderName}"</span> to{' '}
              <span className="font-semibold text-primary-600">"{selectedName}"</span>?
            </p>
            {hasSubFolders && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
                ⚠️ All sub-collections inside <strong>"{folderName}"</strong> will move with it.
              </p>
            )}
            <p className="text-xs text-gray-400 mb-5">This will update your library structure immediately.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setStep('pick')} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Back</button>
              <button onClick={handleConfirm} disabled={moving} className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors">
                {moving ? 'Moving…' : 'Confirm Move'}
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
        <h2 className="text-lg font-bold text-gray-900 mb-2">Delete Collection</h2>
        <p className="text-sm text-gray-500 mb-1">
          Delete <span className="font-semibold text-gray-700">"{folderName}"</span>?
        </p>
        <p className="text-sm text-gray-400 mb-6">
          Your videos won't be deleted — they'll be moved back to your main library.
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
          <button onClick={handleConfirm} disabled={deleting} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors">
            {deleting ? 'Deleting…' : 'Delete'}
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
  const { folderId } = useParams<{ folderId?: string }>();
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
  const { t } = useTranslation(['gallery', 'common', 'sidebar']);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);

  const [msgIndex, setMsgIndex] = useState(0);
  const [scanState, setScanState] = useState<'h-active' | 'v-active'>('h-active');

  // Folder menu
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isMoveFolderModalOpen, setIsMoveFolderModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Server-side search ────────────────────────────────────────────────────
  // Results come back ranked by relevance from Postgres FTS.
  // Falls back to null on any error → client index takes over seamlessly.
  const { results: searchResults, searching } = useSearch(searchQuery, folderId);

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
    setShowFolderMenu(false);
    setSearchQuery('');
  }, [folderId, location.pathname, location.key]);

  useEffect(() => {
    const hasProcessing = videos.some((v: any) => v.category === 'Processing' || v.status === 'processing');
    if (!hasProcessing) return;
    const msgInterval = setInterval(() => setMsgIndex(p => (p + 1) % PROCESSING_MESSAGES.length), 2000);
    const scanSequencer = setInterval(() => setScanState(p => p === 'h-active' ? 'v-active' : 'h-active'), 4000);
    return () => { clearInterval(msgInterval); clearInterval(scanSequencer); };
  }, [videos]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowFolderMenu(false);
    };
    if (showFolderMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFolderMenu]);

  const isFavoritesView = folderId === 'favorites';
  const isAllView = !folderId || folderId === 'all';
  const isUnsortedView = folderId === 'unsorted';
  const isCustomFolder = !isFavoritesView && !isAllView && !isUnsortedView && !!folderId;

  // ── Client-side search index (fallback) ───────────────────────────────────
  // Built once when videos load. Recursively extracts every string from every
  // video object so no field is ever missed regardless of nesting shape.
  // Only used when the server search endpoint returns null (error / not yet deployed).
  const SKIP_KEYS = new Set([
    'id', 'process_id', 'processId', 'folderId', 'folder_id',
    'userId', 'user_id', 'thumbnail', 'thumbnailUrl', 'url', 'videoUrl',
    'savedAt', 'created_at', 'updated_at', 'status', 'isFavorite',
  ]);

  const searchIndex = useMemo(() => {
    const extractStrings = (val: unknown, depth = 0): string => {
      if (depth > 6) return '';
      if (typeof val === 'string') return val;
      if (Array.isArray(val)) return val.map(item => extractStrings(item, depth + 1)).join(' ');
      if (val !== null && typeof val === 'object') {
        return Object.entries(val as Record<string, unknown>)
          .filter(([k]) => !SKIP_KEYS.has(k))
          .map(([, v]) => extractStrings(v, depth + 1))
          .join(' ');
      }
      return '';
    };

    const map = new Map<string, string>();
    for (const v of videos) {
      const videoId = v?.id ?? v?.process_id ?? v?.processId ?? '';
      if (!videoId) continue;
      map.set(videoId, extractStrings(v).toLowerCase());
    }
    return map;
  }, [videos]);

  // ── Displayed videos ──────────────────────────────────────────────────────
  // Priority: server results (ranked) > client index > unfiltered local list
  const displayedVideos = useMemo(() => {
    // Server search returned results → use them directly (already ranked + filtered)
    if (searchResults !== null) return searchResults;

    // Filter by current view
    let filtered = videos.filter((v: any) => {
      if (isFavoritesView) return v.isFavorite;
      if (isAllView)       return true;
      if (isUnsortedView)  return !v.folderId || v.folderId === 'unsorted' || v.folderId === 'all';
      return v.folderId === folderId;
    });

    // Client-side index fallback (when server search is unavailable)
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((v: any) => {
        const videoId = v?.id ?? v?.process_id ?? v?.processId ?? '';
        const haystack = searchIndex.get(videoId) ?? '';
        return haystack.includes(q);
      });
    }

    // Sort (only when not using server results — server already sorts by rank)
    return [...filtered].sort((a: any, b: any) => {
      const aP = a.category === 'Processing' || a.status === 'processing';
      const bP = b.category === 'Processing' || b.status === 'processing';
      if (aP && !bP) return -1;
      if (!aP && bP) return 1;
      const dA = new Date(a.savedAt || a.created_at || 0).getTime();
      const dB = new Date(b.savedAt || b.created_at || 0).getTime();
      return sortOrder === 'desc' ? dB - dA : dA - dB;
    });
  }, [videos, searchResults, folderId, isFavoritesView, isAllView, isUnsortedView, searchQuery, sortOrder, searchIndex]);

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

  const resolveFolderName = (): string => {
    if (!folderId) return '';
    const flat = (list: any[]): any[] => list.flatMap(f => [f, ...(f.subFolders ? flat(f.subFolders) : [])]);
    const found = flat(folders).find((f: any) => f.id === folderId);
    return found?.name || folderId;
  };

  const handleRenameFolder = async (newName: string) => {
    if (!folderId) return;
    await updateFolder(folderId, newName);
    await refreshVideos();
  };

  const handleMoveFolder = async (newParentId: string | null) => {
    if (!folderId) return;
    const currentName = resolveFolderName();
    await updateFolder(folderId, currentName, newParentId);
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
    const flat = (list: any[]): any[] => list.flatMap(f => [f, ...(f.subFolders ? flat(f.subFolders) : [])]);
    const found = flat(folders).find((f: any) => f.id === folderId);
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
                    <div className="relative flex-shrink-0" ref={menuRef}>
                      <button
                        onClick={() => setShowFolderMenu(v => !v)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Collection options"
                      >
                        <MoreVertical size={18} />
                      </button>

                      {showFolderMenu && (
                        <div className="absolute left-0 top-full mt-1.5 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-50 py-1.5 animate-fade-in">
                          <button
                            onClick={() => { setIsRenameModalOpen(true); setShowFolderMenu(false); }}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Pencil size={14} />
                            <span>Edit Collection</span>
                          </button>
                          <button
                            onClick={() => { setIsMoveFolderModalOpen(true); setShowFolderMenu(false); }}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <FolderInput size={14} />
                            <span>Move Collection</span>
                          </button>
                          <div className="mx-3 my-1 border-t border-gray-100" />
                          <button
                            onClick={() => { setIsDeleteConfirmOpen(true); setShowFolderMenu(false); }}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={14} />
                            <span>Delete Collection</span>
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

          {/* RIGHT: video count pill + manage/selection controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {!selectionMode && (
              <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-bold tracking-wide">
                {displayedVideos.length} videos
              </span>
            )}
            <div className="flex items-center gap-1.5">
              {selectionMode ? (
                <>
                  <button
                    onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                    title={t('common:cancel', 'Cancel')}
                  >
                    <CircleX size={26} strokeWidth={1.5} />
                  </button>
                  <Button
                    variant="primary"
                    size="sm"
                    className="h-10 px-3 md:px-6 gap-1.5 whitespace-nowrap"
                    disabled={selectedIds.size === 0}
                    onClick={() => setIsMoveModalOpen(true)}
                  >
                    <span className="truncate max-w-[60px] md:max-w-none">{t('gallery:move')}</span>
                    {selectedIds.size > 0 && (
                      <span className="flex-shrink-0 bg-white/20 px-1.5 py-0.5 rounded text-[10px] font-bold min-w-[20px] text-center">
                        {selectedIds.size}
                      </span>
                    )}
                  </Button>
                  <button
                    onClick={handleDelete}
                    disabled={selectedIds.size === 0}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
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
                  <span className="text-sm font-medium whitespace-nowrap">{t('gallery:manage', 'Manage')}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Search + sort ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={t('common:search')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-3 bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none shadow-sm transition-all hover:bg-white/80"
            />
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />

            {/* Spinner while server search is in flight */}
            {searching && !!searchQuery && (
              <div className="absolute right-9 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin pointer-events-none" />
            )}

            {/* Clear button */}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Clear search"
              >
                <CircleX size={16} />
              </button>
            )}
          </div>
          <button
            onClick={() => setSortOrder(p => p === 'desc' ? 'asc' : 'desc')}
            className="p-3 bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl hover:bg-white/80 transition-colors text-gray-600 shadow-sm h-[46px] w-[46px] flex-shrink-0 flex items-center justify-center"
            title={sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
          >
            {sortOrder === 'desc' ? <CalendarArrowUp size={20} /> : <CalendarArrowDown size={20} />}
          </button>
        </div>
      </div>

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

      {!dataLoading && !searching && displayedVideos.length === 0 && (
        <div className="py-20 text-center animate-fade-in">
          <div className="w-16 h-16 bg-white/40 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4 border border-white/40">
            <Search className="text-gray-400" size={24} />
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