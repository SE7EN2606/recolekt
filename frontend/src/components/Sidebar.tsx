import React, { useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { FolderOpen, FolderClosed, LayoutGrid, Heart, Archive, Share2, ChevronRight, Download, SquarePen, FolderPlus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Button } from './Button';
import { InputModal } from './InputModal';
import { ManageCollectionsModal } from './ManageCollectionsModal';
import { AddVideoModal } from './AddVideoModal';
import { useTranslation } from 'react-i18next'; // 🔥 IMPORT

const SYSTEM_FOLDER_IDS = new Set(['all', 'favorites', 'shared', 'archive', 'default']);

const isSystemOrAllVideos = (folder: any) => {
  const name = String(folder?.name || '').trim().toLowerCase();
  const id = String(folder?.id || '');
  const isSystemFlag = Boolean(folder?.isSystem);
  return SYSTEM_FOLDER_IDS.has(id) || isSystemFlag || name === 'all videos';
};

export const Sidebar: React.FC = () => {
  const { folders, addFolder, videos } = useData();
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const location = useLocation();
  const { t } = useTranslation(['sidebar', 'gallery']); // 🔥 HOOK

  const handleCreateFolder = (name: string, parentId?: string) => {
    addFolder(name, parentId);
    setIsInputModalOpen(false);
  };

  const customFolders = useMemo(() => (folders || []).filter((f: any) => !isSystemOrAllVideos(f)), [folders]);
  const parentOptions = useMemo(() => customFolders.map((f: any) => ({ id: f.id, name: f.name })), [customFolders]);

  const getVideoCount = (folderId: string) => {
    return (videos || []).filter((v: any) => v.folderId === folderId).length;
  };

  const linkClass = (active: boolean) => `group flex items-center justify-between w-full p-2.5 rounded-xl transition-all duration-200 border ${active ? 'bg-primary-50 text-primary-900 font-bold border-primary-100' : 'bg-transparent text-gray-600 border-transparent hover:bg-gray-50 hover:text-primary-900'}`;
  const iconClass = (active: boolean) => `transition-colors duration-200 flex-shrink-0 ${active ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-600'}`;

  return (
    <>
      <aside className="hidden md:flex flex-col h-[calc(100vh-100px)] sticky top-24 overflow-y-auto overflow-x-visible no-scrollbar pr-2 pb-4">
        <div className="mb-6">
          <Button fullWidth variant="primary" onClick={() => setIsVideoModalOpen(true)} className="shadow-lg shadow-primary-600/20 gap-2 py-3">
            <Download size={18} />
            <span>{t('sidebar:saveNewVideo')}</span>
          </Button>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between px-3 mb-3">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('sidebar:library')}</h3>
            <button onClick={() => setIsManageModalOpen(true)} className="text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-all p-1.5 rounded-md" title={t('sidebar:manageCollections')}>
              <SquarePen size={18} strokeWidth={2} />
            </button>
          </div>

          <div className="space-y-1 px-2">
            <NavLink to="/gallery" end className={({ isActive }) => linkClass(isActive && !location.pathname.includes('favorites') && !location.pathname.includes('shared') && !location.pathname.includes('archive'))}>
              {({ isActive }) => (
                <div className="flex items-center gap-3">
                  <LayoutGrid size={20} className={iconClass(isActive && !location.pathname.includes('favorites'))} />
                  <span className="text-sm">{t('gallery:allVideos')}</span>
                </div>
              )}
            </NavLink>

            <NavLink to="/gallery/favorites" className={({ isActive }) => linkClass(isActive)}>
              {({ isActive }) => (
                <div className="flex items-center gap-3">
                  <Heart size={20} className={iconClass(isActive)} />
                  <span className="text-sm">{t('gallery:favorites')}</span>
                </div>
              )}
            </NavLink>
          </div>
        </div>

        <div className="mb-6 flex-1">
          <div className="flex items-center justify-between px-3 mb-3">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('sidebar:collections')}</h3>
            <button onClick={() => setIsInputModalOpen(true)} className="text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-all p-1.5 rounded-md" title={t('sidebar:newCollection')}>
              <FolderPlus size={20} strokeWidth={2} />
            </button>
          </div>

          <div className="space-y-1 px-2">
            {customFolders.map((folder: any) => {
              const hasSubs = !!(folder.subFolders && folder.subFolders.length > 0);
              return (
                <div key={folder.id}>
                  <NavLink to={`/gallery/${folder.id}`} className={({ isActive }) => linkClass(isActive)}>
                    {({ isActive }) => (
                      <>
                        <div className="flex items-center gap-3 min-w-0">
                          <FolderClosed size={20} className={iconClass(isActive)} />
                          <span className="text-sm truncate">{folder.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md flex-shrink-0 bg-primary-50 text-primary-600 group-hover:bg-primary-100 transition-colors">
                            {getVideoCount(folder.id)}
                          </span>
                          {hasSubs && <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />}
                        </div>
                      </>
                    )}
                  </NavLink>
                  {hasSubs && (
                    <div className="space-y-1 mt-1">
                      {folder.subFolders.map((sub: any) => (
                        <NavLink key={sub.id} to={`/gallery/${sub.id}`} className={({ isActive }) => `group flex items-center gap-2 w-full p-2 rounded-xl transition-all duration-200 pl-10 border ${isActive ? 'bg-primary-50 text-primary-900 font-bold border-primary-100' : 'bg-transparent text-gray-500 border-transparent hover:bg-gray-50 hover:text-primary-900'}`}>
                          {({ isActive }) => (
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <FolderOpen size={18} className={iconClass(isActive)} />
                              <span className="text-sm truncate">{sub.name}</span>
                            </div>
                          )}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {customFolders.length === 0 && (
              <div onClick={() => setIsInputModalOpen(true)} className="p-4 border-2 border-dashed border-gray-100 rounded-xl text-center cursor-pointer hover:border-primary-200 hover:bg-primary-50/30 transition-all group">
                <span className="text-xs font-bold text-gray-400 group-hover:text-primary-500">{t('sidebar:createCollection')}</span>
              </div>
            )}

            <div className="pt-2 mt-2 border-t border-gray-50 space-y-1">
              <NavLink to="/gallery/shared" className={({ isActive }) => linkClass(isActive)}>
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <Share2 size={20} className={iconClass(isActive)} />
                      <span className="text-sm">{t('sidebar:shared')}</span>
                    </div>
                    <ChevronRight size={14} className={`text-gray-300 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`} />
                  </>
                )}
              </NavLink>

              <NavLink to="/gallery/archive" className={({ isActive }) => linkClass(isActive)}>
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <Archive size={20} className={iconClass(isActive)} />
                      <span className="text-sm">{t('sidebar:archive')}</span>
                    </div>
                    <ChevronRight size={14} className={`text-gray-300 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`} />
                  </>
                )}
              </NavLink>
            </div>
          </div>
        </div>
      </aside>

      <InputModal isOpen={isInputModalOpen} onClose={() => setIsInputModalOpen(false)} onSubmit={handleCreateFolder} title={t('sidebar:newCollection')} placeholder={t('sidebar:travelIdeas')} parentOptions={parentOptions} />
      <ManageCollectionsModal isOpen={isManageModalOpen} onClose={() => setIsManageModalOpen(false)} />
      <AddVideoModal isOpen={isVideoModalOpen} onClose={() => setIsVideoModalOpen(false)} />
    </>
  );
};