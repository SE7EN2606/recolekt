// src/components/ManageCollectionsModal.tsx

import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  FolderClosed,
  FolderOpen,
  ChevronRight,
  Trash2,
  Edit2,
  Plus,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { Folder } from '../types';

interface ManageCollectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SYSTEM_FOLDER_IDS = new Set(['all', 'favorites', 'shared', 'archive', 'default']);

const isSystemOrAllVideos = (folder: Folder) => {
  const name = String(folder?.name || '').trim().toLowerCase();
  const id = String(folder?.id || '');
  const isSystemFlag = Boolean((folder as any)?.isSystem);
  return SYSTEM_FOLDER_IDS.has(id) || isSystemFlag || name === 'all videos';
};

const sanitizeFolderTree = (list: Folder[]): Folder[] => {
  const safe = Array.isArray(list) ? list : [];
  return safe
    .filter((f) => f && !isSystemOrAllVideos(f))
    .map((f) => ({
      ...f,
      subFolders: sanitizeFolderTree((f.subFolders || []) as Folder[]),
    }));
};

// Flatten the folder tree so we can show a "Parent collection" dropdown
const flattenFolders = (
  folders: Folder[],
  depth = 0,
): { folder: Folder; depth: number }[] => {
  const result: { folder: Folder; depth: number }[] = [];
  for (const folder of folders) {
    result.push({ folder, depth });
    if (folder.subFolders && folder.subFolders.length > 0) {
      result.push(...flattenFolders(folder.subFolders, depth + 1));
    }
  }
  return result;
};

const buildExpandedMap = (list: Folder[]) => {
  const expanded: Record<string, boolean> = {};
  const walk = (folders: Folder[]) => {
    for (const f of folders) {
      const hasSubs = !!(f.subFolders && f.subFolders.length > 0);
      if (hasSubs) expanded[f.id] = true;
      if (hasSubs) walk(f.subFolders as Folder[]);
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

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // State for creating new folders
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [parentForNew, setParentForNew] = useState<string | null>(null);

  const cleanedFolders = useMemo(
    () => sanitizeFolderTree((folders || []) as Folder[]),
    [folders],
  );

  // Options for "Parent collection" dropdown (flattened tree)
  const parentOptions = useMemo(
    () => flattenFolders(cleanedFolders),
    [cleanedFolders],
  );

  // Expand by default when opening (only if user hasn't toggled anything yet)
  useEffect(() => {
    if (!isOpen) return;
    setExpanded((prev) => {
      if (prev && Object.keys(prev).length > 0) return prev;
      return buildExpandedMap(cleanedFolders);
    });
  }, [isOpen, cleanedFolders]);

  if (!isOpen) return null;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const startEdit = (folder: Folder) => {
    if (isSystemOrAllVideos(folder)) return;
    setEditingId(folder.id);
    setEditName(folder.name);
  };

  const saveEdit = () => {
    if (editingId && editName.trim()) {
      updateFolder(editingId, editName.trim());
      setEditingId(null);
      setEditName('');
    }
  };

  const handleCreate = () => {
    const name = newFolderName.trim();
    if (!name) return;

    addFolder(name, parentForNew);
    setNewFolderName('');
    setIsCreating(false);
    setParentForNew(null);
  };

  const handleDelete = (id: string) => {
    if (SYSTEM_FOLDER_IDS.has(String(id))) return;

    if (
      window.confirm('Are you sure? This will delete the folder and all sub-folders.')
    ) {
      deleteFolder(id);
    }
  };

  // Recursive render
  const renderFolder = (folder: Folder, depth = 0) => {
    const hasSubs = !!(folder.subFolders && folder.subFolders.length > 0);
    const isExpanded = !!expanded[folder.id];
    const isEditing = editingId === folder.id;

    // RULE:
    // - main folder icon: FolderClosed (always)
    // - subfolder icon: FolderOpen
    const Icon = depth === 0 ? FolderClosed : FolderOpen;

    return (
      <div key={folder.id}>
        {/* Folder Row */}
        <div
          className={`flex items-center group py-2 px-2 rounded-lg hover:bg-gray-50 ${
            depth > 0 ? 'ml-6 border-l border-gray-100' : ''
          }`}
        >
          {/* Expand/Collapse ChevronRight (rotate) */}
          <button
            onClick={() => hasSubs && toggleExpand(folder.id)}
            className={`p-1 mr-1 text-gray-400 hover:text-gray-600 rounded transition-colors ${
              !hasSubs ? 'opacity-0 cursor-default' : ''
            }`}
            aria-label={hasSubs ? 'Toggle folder' : undefined}
          >
            <ChevronRight
              size={14}
              className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
          </button>

          {/* Folder Name or Input */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <Icon size={16} className="text-primary-600 flex-shrink-0" />

            {isEditing ? (
              <input
                autoFocus
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                className="flex-1 bg-white border border-primary-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-primary-500"
              />
            ) : (
              <span className="text-sm font-medium text-gray-700 truncate">
                {folder.name}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => {
                setParentForNew(folder.id);
                setIsCreating(true);
                setExpanded((prev) => ({ ...prev, [folder.id]: true }));
              }}
              className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
              title="Add Subfolder"
            >
              <Plus size={14} />
            </button>

            <button
              onClick={() => startEdit(folder)}
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
              title="Rename"
            >
              <Edit2 size={14} />
            </button>

            <button
              onClick={() => handleDelete(folder.id)}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Render Subfolders */}
        {hasSubs && isExpanded && (
          <div className="mt-1">
            {folder.subFolders!.map((sub) => renderFolder(sub, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header (match Move to Collection typography) */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.25em]">
            Manage Collections
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Folder Tree */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {cleanedFolders.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No collections yet. Create one!
            </div>
          ) : (
            cleanedFolders.map((folder) => renderFolder(folder))
          )}
        </div>

        {/* Footer / Create New */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          {isCreating ? (
            <div className="space-y-3">
              {/* Parent selector */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Parent collection
                </label>
                <select
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={parentForNew ?? ''}
                  onChange={(e) => setParentForNew(e.target.value || null)}
                >
                  <option value="">No parent (top level)</option>
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
                  placeholder={
                    parentForNew ? 'New sub-collection name...' : 'New collection name...'
                  }
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  onClick={handleCreate}
                  className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-60"
                  disabled={!newFolderName.trim()}
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setParentForNew(null);
                    setNewFolderName('');
                  }}
                  className="text-gray-500 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                setParentForNew(null);
                setIsCreating(true);
              }}
              className="w-full py-2.5 flex items-center justify-center gap-2 text-primary-600 font-bold hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 rounded-xl transition-all"
            >
              <Plus size={18} />
              Create New Collection
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
