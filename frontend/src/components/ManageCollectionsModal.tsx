import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Trash2, Edit2, Check, Folder, 
  CornerDownRight, Plus, FolderPlus, 
  AlertTriangle, FolderClosed 
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { Folder as FolderType } from '../types';
import { useTranslation } from 'react-i18next';

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

export const ManageCollectionsModal: React.FC<ManageCollectionsModalProps> = ({
  isOpen,
  onClose
}) => {
  const { folders, addFolder, updateFolder, deleteFolder, videos } = useData();
  const { t } = useTranslation(['modals', 'common']);
  const [isVisible, setIsVisible] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [addingRoot, setAddingRoot] = useState(false);
  const [addingSubToId, setAddingSubToId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const customFolders = useMemo(() => 
    (folders || []).filter(f => f && !isSystemOrAllVideos(f)),
    [folders]
  );

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = 'unset';
      resetState();
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const resetState = () => {
    setEditingId(null);
    setEditName('');
    setAddingRoot(false);
    setAddingSubToId(null);
    setNewName('');
    setDeleteConfirmId(null);
  };

  const getVideoCount = (folderId: string) => {
    const directCount = (videos || []).filter((v: any) => v.folderId === folderId).length;
    const folder = (folders || []).find((f: any) => f.id === folderId);
    const subFolderCount = (folder?.subFolders || []).reduce((acc: number, sub: any) => 
      acc + (videos || []).filter((v: any) => v.folderId === sub.id).length, 0);
    return directCount + subFolderCount;
  };

  const handleAddRoot = () => {
    if (newName.trim()) {
      addFolder(newName.trim());
      setNewName('');
      setAddingRoot(false);
    }
  };

  const handleAddSub = (parentId: string) => {
    if (newName.trim()) {
      addFolder(newName.trim(), parentId);
      setNewName('');
      setAddingSubToId(null);
    }
  };

  const handleUpdate = (id: string) => {
    if (editName.trim()) {
      updateFolder(id, editName.trim());
      setEditingId(null);
      setEditName('');
    }
  };

  const handleDelete = (id: string) => {
    deleteFolder(id);
    setDeleteConfirmId(null);
  };

  const renderFolderRow = (folder: FolderType, isSub: boolean = false) => {
    const isEditing = editingId === folder.id;
    const isDeleting = deleteConfirmId === folder.id;
    const isAddingSub = addingSubToId === folder.id;

    return (
      <div className="group">
        <div className={`
          flex items-center justify-between p-2.5 rounded-xl transition-all border
          ${isEditing ? 'bg-primary-50 border-primary-100' : 'bg-transparent border-transparent hover:bg-primary-50/50 hover:border-primary-100/50'}
          ${isSub ? 'ml-6' : ''}
        `}>
          <div className="flex-1 flex items-center gap-3 min-w-0 mr-2">
             <div className={`flex items-center justify-center shrink-0 transition-colors ${isEditing ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-600'}`}>
                {isSub ? <CornerDownRight size={18} strokeWidth={2.5} className="shrink-0" /> : <FolderClosed size={20} className="shrink-0" />}
             </div>
             
             {isEditing ? (
               <input 
                 autoFocus
                 type="text" 
                 value={editName}
                 onChange={(e) => setEditName(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && handleUpdate(folder.id)}
                 className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-primary-500 outline-none min-w-0"
               />
             ) : (
               <div className="min-w-0 flex-1">
                 <div className="font-bold text-sm text-gray-900 truncate transition-colors group-hover:text-primary-900">{folder.name}</div>
                 <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider transition-colors group-hover:text-primary-600/70">
                   {getVideoCount(folder.id)} {t('modals:items', 'items')}
                 </div>
               </div>
             )}
          </div>

          <div className="flex items-center gap-1">
            {isEditing ? (
              <>
                <button onClick={() => handleUpdate(folder.id)} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-colors">
                  <Check size={16} className="shrink-0" />
                </button>
                <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors">
                  <X size={16} className="shrink-0" />
                </button>
              </>
            ) : (
              <div className={`flex items-center gap-0.5 ${isDeleting ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'} transition-all`}>
                {!isSub && (
                  <button 
                    onClick={() => { setAddingSubToId(folder.id); setNewName(''); setAddingRoot(false); }} 
                    className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-100/50 rounded-lg transition-colors"
                  >
                    <Plus size={16} className="shrink-0" />
                  </button>
                )}
                
                <button 
                  onClick={() => { setEditingId(folder.id); setEditName(folder.name); setDeleteConfirmId(null); }} 
                  className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-100/50 rounded-lg transition-colors"
                  title={t('common:rename', 'Rename')}
                >
                  <Edit2 size={16} className="shrink-0" />
                </button>

                <button 
                  onClick={() => setDeleteConfirmId(folder.id)} 
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={16} className="shrink-0" />
                </button>
              </div>
            )}
          </div>
        </div>

        {isDeleting && (
          <div className="p-3 bg-red-50 rounded-xl border border-red-100 mt-2 mb-2 mx-2 animate-fade-in flex items-start gap-3">
             <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
             <div className="flex-1">
               <h4 className="text-sm font-bold text-red-700">{t('common:delete', 'Delete')} "{folder.name}"?</h4>
               <div className="flex gap-2 mt-3">
                 <button onClick={() => handleDelete(folder.id)} className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg shadow-sm">{t('common:confirmDelete', 'Confirm')}</button>
                 <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 bg-white border border-red-200 text-red-700 text-xs font-bold rounded-lg hover:bg-red-50 transition-colors">{t('common:cancel', 'Cancel')}</button>
               </div>
             </div>
          </div>
        )}

        {isAddingSub && (
          <div className="ml-8 mr-2 mt-1 mb-2 flex items-center gap-2 p-2 bg-primary-50/50 rounded-xl border border-primary-100 animate-fade-in">
            <CornerDownRight size={16} className="text-primary-400 ml-1 shrink-0" />
            <input 
              autoFocus type="text" placeholder={t('modals:subCollectionNamePlaceholder', 'Sub-folder name...')} value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddSub(folder.id)}
              className="flex-1 bg-white border border-primary-200 rounded-lg px-3 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button onClick={() => handleAddSub(folder.id)} className="p-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700"><Check size={14} className="shrink-0" /></button>
            <button onClick={() => setAddingSubToId(null)} className="p-1.5 text-gray-400 hover:bg-white rounded-lg"><X size={14} className="shrink-0" /></button>
          </div>
        )}
      </div>
    );
  };

  if (!isVisible) return null;

  return (
    <div className={`fixed inset-0 z-[200] flex items-center justify-center px-4 transition-all duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className={`bg-white/95 backdrop-blur-xl border border-white/40 w-full max-w-lg rounded-2xl shadow-2xl transform transition-all duration-300 flex flex-col max-h-[85vh] ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}>
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0 bg-white/50 rounded-t-2xl">
          <div>
            <h3 className="text-lg font-black text-gray-900">{t('modals:manageCollections', 'Manage Collections')}</h3>
            <p className="text-gray-500 text-xs mt-0.5">{t('modals:manageCollectionsDesc', 'Organize your library structure')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => { setAddingRoot(true); setNewName(''); setAddingSubToId(null); }}
              className="flex items-center justify-center w-8 h-8 md:w-auto md:px-3 md:py-1.5 bg-primary-50 text-primary-600 hover:bg-primary-100 border border-transparent hover:border-primary-200 rounded-xl text-xs font-bold transition-all active:scale-95"
            >
              <FolderPlus size={16} strokeWidth={2.5} className="shrink-0 min-w-[16px] min-h-[16px]" />
              <span className="hidden md:inline ml-1.5">{t('common:add', 'Add')}</span>
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"><X size={20} className="shrink-0" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
           {addingRoot && (
             <div className="flex items-center gap-2 p-3 bg-primary-50 rounded-xl border border-primary-100 mb-4 animate-fade-in shadow-sm">
               <Folder size={18} className="text-primary-600 shrink-0" />
               <input autoFocus type="text" placeholder={t('modals:collectionNamePlaceholder', 'Collection name...')} value={newName}
                 onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddRoot()}
                 className="flex-1 bg-white border border-primary-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary-500"
               />
               <button onClick={handleAddRoot} className="p-1.5 bg-primary-600 text-white rounded-lg"><Check size={16} className="shrink-0" /></button>
               <button onClick={() => setAddingRoot(false)} className="p-1.5 text-gray-400"><X size={16} className="shrink-0" /></button>
             </div>
           )}

           {customFolders.length === 0 && !addingRoot && (
              <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/50 mt-2">
                <Folder size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-400 text-sm font-medium">{t('modals:noCollectionsYet', 'No collections yet')}</p>
              </div>
           )}

           {customFolders.map(folder => (
              <div key={folder.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-2">
                {renderFolderRow(folder)}
                {folder.subFolders && folder.subFolders.length > 0 && (
                  <div className="bg-gray-50/30 border-t border-gray-100 pb-1">
                    {folder.subFolders.map(sub => <div key={sub.id}>{renderFolderRow(sub as FolderType, true)}</div>)}
                  </div>
                )}
              </div>
           ))}
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex justify-between items-center">
           <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{customFolders.length} {t('modals:collections', 'collections')}</span>
           <button onClick={onClose} className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl shadow-sm hover:bg-gray-50 transition-all text-sm active:scale-95">
             {t('common:done', 'Done')}
           </button>
        </div>
      </div>
    </div>
  );
};