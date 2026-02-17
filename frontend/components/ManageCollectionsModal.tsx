// src/components/ManageCollectionsModal.tsx

import React, { useMemo, useState } from 'react';
import {
  X,
  Folder as FolderIcon,
  ChevronRight,
  ChevronDown,
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

  // Options for "Parent collection" dropdown (flattened tree)
  const parentOptions = useMemo(
    () => flattenFolders(folders),
    [folders],
  );

  if (!isOpen) return null;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const startEdit = (folder: Folder) => {
    setEditingId(folder.id);
    setEditName(folder.name);
  };

  const saveEdit = () => {
    if (editingId && editName.trim()) {
      updateFolder(editingId, editName);
      setEditingId(null);
      setEditName('');
    }
  };

  const handleCreate = () => {
    if (newFolderName.trim()) {
      addFolder(newFolderName.trim(), parentForNew);
      setNewFolderName('');
      setIsCreating(false);
      setParentForNew(null);
    }
  };

  const handleDelete = (id: string) => {
    if (
      window.confirm(
        'Are you sure? This will delete the folder and all sub-folders.',
      )
    ) {
      deleteFolder(id);
    }
  };

  // Recursive render
  const renderFolder = (folder: Folder, depth = 0) => {
    const hasSubs = folder.subFolders && folder.subFolders.length > 0;
    const isExpanded = expanded[folder.id];
    const isEditing = editingId === folder.id;

    return (
      <div key={folder.id}>
        {/* Folder Row */}
        <div
          className={`flex items-center group py-2 px-2 rounded-lg hover:bg-gray-50 ${
            depth > 0 ? 'ml-6 border-l border-gray-100' : ''
          }`}
        >
          {/* Expand/Collapse Icon */}
          <button
            onClick={() => hasSubs && toggleExpand(folder.id)}
            className={`p-1 mr-1 text-gray-400 hover:text-gray-600 rounded transition-colors ${
              !hasSubs ? 'opacity-0 cursor-default' : ''
            }`}
          >
            {hasSubs ? (
              isExpanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )
            ) : (
              <ChevronRight size={14} />
            )}
          </button>

          {/* Folder Name or Input */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <FolderIcon
              size={16}
              className="text-primary-500 fill-primary-500/20 flex-shrink-0"
            />

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
                // Create a sub-collection under this folder
                setParentForNew(folder.id);
                setIsCreating(true);
                setExpanded((prev) => ({
                  ...prev,
                  [folder.id]: true,
                }));
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
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">
            Manage Collections
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Folder Tree */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {folders.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No collections yet. Create one!
            </div>
          ) : (
            folders.map((folder) => renderFolder(folder))
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
                  onChange={(e) =>
                    setParentForNew(e.target.value || null)
                  }
                >
                  <option value="">
                    No parent (top level)
                  </option>
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
                    parentForNew
                      ? 'New sub-collection name...'
                      : 'New collection name...'
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
                // Default to top-level when starting from footer button
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
