import { API_BASE } from "../utils/api";
import React, { useEffect, useMemo, useState } from 'react';
import {
  X, FolderClosed, FolderOpen, ChevronRight,
  Trash2, Edit2, Plus, Check, Folder
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { Folder as FolderType } from '../types';
import { useTranslation } from 'react-i18next'; // 🔥 IMPORTED

interface ManageCollectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SYSTEM_FOLDER_IDS = new Set(['all', 'favorites', 'shared', 'archive', 'default']);

const isSystemOrAllVideos = (folder: FolderType) => {
  const name = String(folder?.name || '').trim().toLowerCase();
  const id = String(folder?.id || '');
  return SYSTEM_FOLDER_IDS.has(id) || Boolean((folder as any)?.isSystem) || name === 'all videos';
};

const sanitizeFolderTree = (list: FolderType[]): FolderType[] => {
  const safe = Array.isArray(list) ? list : [];
  return safe
    .filter((f) => f && !isSystemOrAllVideos(f))
    .map((f) => ({
      ...f,
      subFolders: sanitizeFolderTree((f.subFolders || []) as FolderType[]),
    }));
};

const flattenFolders = (
  folders: FolderType[],
  depth = 0,
): { folder: FolderType; depth: number }[] => {
  const result: { folder: FolderType; depth: number }[] = [];
  for (const folder of folders) {
    result.push({ folder, depth });
    if (folder.subFolders && folder.subFolders.length > 0) {
      result.push(...flattenFolders(folder.subFolders as FolderType[], depth + 1));
    }
  }
  return result;
};

const buildExpandedMap = (list: FolderType[]) => {
  const expanded: Record<string, boolean> = {};
  const walk = (folders: FolderType[]) => {
    for (const f of folders) {
      const hasSubs = !!(f.subFolders && f.subFolders.length > 0);
      if (hasSubs) { expanded[f.id] = true; walk(f.subFolders as FolderType[]); }
    }
  };
  walk(list);
  return expanded;
};

export const ManageCollectionsModal: React.FC<ManageCollectionsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { folders, addFolder, updateFolder, deleteFolder } = useData();
  const { t } = useTranslation(['modals', 'common']); // 🔥 INITIALIZED

  const [isVisible, setIsVisible] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [parentForNew, setParentForNew] = useState<string | null>(null);

  const cleanedFolders = useMemo(
    () => sanitizeFolderTree((folders || []) as FolderType[]),
    [folders],
  );

  const parentOptions = useMemo(
    () => flattenFolders(cleanedFolders),
    [cleanedFolders],
  );

  // Visibility animation
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = 'unset';
      setEditingId(null);
      setDeleteConfirmId(null);
      setIsCreating(false);
      setNewFolderName('');
      setParentForNew(null);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Auto-expand folders with children on open
  useEffect(() => {
    if (!isOpen) return;
    setExpanded((prev) => {
      if (prev && Object.keys(prev).length > 0) return prev;
      return buildExpandedMap(cleanedFolders);
    });
  }, [isOpen, cleanedFolders]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const startEdit = (folder: FolderType) => {
    if (isSystemOrAllVideos(folder)) return;
    setEditingId(folder.id);
    setEditName(folder.name);
    setDeleteConfirmId(null);
  };

  const saveEdit = () => {
    if (editingId && editName.trim()) {
      updateFolder(editingId, editName.trim());
      setEditingId(null);
      setEditName('');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const requestDelete = (folder: FolderType) => {
    if (isSystemOrAllVideos(folder)) return;
    setDeleteConfirmId(folder.id);
    setEditingId(null);
  };

  const confirmDelete = (id: string) => {
    deleteFolder(id);
    setDeleteConfirmId(null);
  };

  const handleCreate = () => {
    const name = newFolderName.trim();
    if (!name) return;
    addFolder(name, parentForNew ?? undefined);
    setNewFolderName('');
    setIsCreating(false);
    setParentForNew(null);
  };

  const renderFolder = (folder: FolderType, depth = 0) => {
    const hasSubs = !!(folder.subFolders && folder.subFolders.length > 0);
    const isExpanded = !!expanded[folder.id];
    const isEditing = editingId === folder.id;
    const isDeleting = deleteConfirmId === folder.id;
    const Icon = depth === 0 ? FolderClosed : FolderOpen;

    return (
      <div key={folder.id}>
        <div
          className={`
            group flex items-center py-2 px-2 rounded-xl transition-all
            ${isEditing ? 'bg-primary-50 border border-primary-100' : 'hover:bg-white/40 border border-transparent'}
            ${depth > 0 ? 'ml-6 border-l border-white/20' : ''}
          `}
        >
          {/* Expand toggle */}
          <button
            onClick={() => hasSubs && toggleExpand(folder.id)}
            className={`p-1 mr-1 text-gray-400 hover:text-gray-600 rounded transition-colors ${!hasSubs ? 'opacity-0 cursor-default' : ''}`}
          >
            <ChevronRight
              size={14}
              className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
          </button>

          {/* Icon + Name / Input */}
          <div className="flex-1 flex items-center gap-2 min-w-0 mr-3">
            <Icon size={16} className="text-primary-600 flex-shrink-0" />

            {isEditing ? (
              <input
                autoFocus
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                className="flex-1 bg-white border border-primary-200 rounded-lg px-3 py-1.5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-primary-500 outline-none"
              />
            ) : (
              <div className="min-w-0">
                <div className="font-bold text-sm text-gray-900 truncate">{folder.name}</div>
                <div className="text-[10px] text-gray-400 font-medium">{folder.itemCount ?? 0} {t('modals:items')}</div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {isEditing ? (
              <>
                <button onClick={saveEdit} className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors">
                  <Check size={16} />
                </button>
                <button onClick={cancelEdit} className="p-2 text-gray-400 hover:bg-white/50 rounded-lg transition-colors">
                  <X size={16} />
                </button>
              </>
            ) : isDeleting ? (
              <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg">
                <span className="text-[10px] font-bold text-red-600 pl-2">{t('common:sure')}</span>
                <button onClick={() => confirmDelete(folder.id)} className="p-1.5 bg-white text-red-600 rounded-md shadow-sm hover:bg-red-100">
                  <Check size={14} />
                </button>
                <button onClick={() => setDeleteConfirmId(null)} className="p-1.5 text-gray-400 hover:bg-white rounded-md">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    setParentForNew(folder.id);
                    setIsCreating(true);
                    setExpanded((prev) => ({ ...prev, [folder.id]: true }));
                  }}
                  className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-white/50 rounded-lg transition-colors"
                  title={t('modals:addSubfolder')}
                >
                  <Plus size={14} />
                </button>
                <button
                  onClick={() => startEdit(folder)}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title={t('common:rename')}
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => requestDelete(folder)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title={t('common:delete')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Subfolders */}
        {hasSubs && isExpanded && (
          <div className="mt-1">
            {folder.subFolders!.map((sub) => renderFolder(sub as FolderType, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!isVisible) return null;

  return (
    <div className={`fixed inset-0 z-[200] flex items-center justify-center px-4 transition-all duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`
        relative bg-white/90 backdrop-blur-xl border border-white/40
        w-full max-w-lg rounded-2xl shadow-2xl
        flex flex-col max-h-[85vh]
        transform transition-all duration-300
        ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
      `}>

        {/* Header */}
        <div className="p-6 border-b border-white/20 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{t('modals:manageCollections')}</h3>
            <p className="text-gray-500 text-sm mt-1">{t('modals:manageCollectionsDesc')}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-gray-400 hover:bg-white/50 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Folder Tree */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {cleanedFolders.length === 0 ? (
            <div className="text-center py-10">
              <Folder size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-400 font-medium">{t('modals:noCollectionsYet')}</p>
            </div>
          ) : (
            cleanedFolders.map((folder) => renderFolder(folder))
          )}
        </div>

        {/* Footer / Create New */}
        <div className="p-4 border-t border-white/20 bg-white/30 rounded-b-2xl backdrop-blur-sm">
          {isCreating ? (
            <div className="space-y-3">
              {/* Parent selector */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {t('modals:parentCollection')}
                </label>
                <select
                  className="w-full bg-white/60 border border-white/40 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 backdrop-blur-sm"
                  value={parentForNew ?? ''}
                  onChange={(e) => setParentForNew(e.target.value || null)}
                >
                  <option value="">{t('modals:noParent')}</option>
                  {parentOptions.map(({ folder, depth }) => (
                    <option key={folder.id} value={folder.id}>
                      {`${'— '.repeat(depth)}${folder.name}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Name + actions */}
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  placeholder={parentForNew ? t('modals:subCollectionNamePlaceholder') : t('modals:collectionNamePlaceholder')}
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setIsCreating(false); setParentForNew(null); setNewFolderName(''); } }}
                  className="flex-1 bg-white/60 border border-white/40 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 backdrop-blur-sm"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newFolderName.trim()}
                  className="bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary-700 disabled:opacity-50 shadow-sm shadow-primary-600/20 transition-colors"
                >
                  {t('common:add')}
                </button>
                <button
                  onClick={() => { setIsCreating(false); setParentForNew(null); setNewFolderName(''); }}
                  className="px-3 py-2 text-sm font-medium text-gray-500 hover:bg-white/50 rounded-xl transition-colors"
                >
                  {t('common:cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setParentForNew(null); setIsCreating(true); }}
              className="w-full py-2.5 flex items-center justify-center gap-2 text-primary-600 font-bold hover:bg-white/50 border border-transparent hover:border-white/40 rounded-xl transition-all"
            >
              <Plus size={18} />
              {t('modals:createNewCollection')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};