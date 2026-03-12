import { API_BASE } from "../utils/api";
import React, { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutGrid, Heart, Archive, Share2,
  Download, SquarePen, FolderPlus, CornerDownRight, FolderClosed, Inbox,
  FolderOpen
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { Button } from './Button';
import { InputModal } from './InputModal';
import { ManageCollectionsModal } from './ManageCollectionsModal';
import { AddVideoModal } from './AddVideoModal';
import { useTranslation } from 'react-i18next';

const SYSTEM_FOLDER_IDS = new Set(['all', 'favorites', 'shared', 'archive', 'default', 'unsorted']);

const isSystemOrAllVideos = (folder: any) => {
  const name = String(folder?.name || '').trim().toLowerCase();
  const id = String(folder?.id || '');
  return SYSTEM_FOLDER_IDS.has(id) || Boolean(folder?.isSystem) || name === 'all videos' || name === 'my videos';
};

export const Sidebar: React.FC = () => {
  const { folders, addFolder, videos, moveVideos } = useData();
  const [isInputModalOpen, setIsInputModalOpen] = React.useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = React.useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = React.useState(false);
  const location = useLocation();
  const { t } = useTranslation(['sidebar', 'gallery']);

  const customFolders = useMemo(
    () => (folders || []).filter((f: any) => !isSystemOrAllVideos(f)),
    [folders]
  );

  const getDirectVideoCount = (folderId: string) => {
    if (folderId === 'unsorted') {
      return (videos || []).filter((v: any) => !v.folderId || v.folderId === 'unsorted' || v.folderId === 'all').length;
    }
    return (videos || []).filter((v: any) => v.folderId === folderId).length;
  };
  
  const getFavoritesCount = () => (videos || []).filter((v: any) => v.isFavorite).length;

  // ✅ CSS FIXED: Added the light purple background hover (hover:bg-primary-50)
  const linkClass = (active: boolean) =>
    `group flex items-center justify-between w-full p-3 rounded-xl transition-all duration-200 border ${
      active
        ? 'bg-primary-50 text-primary-900 font-bold border-primary-100 shadow-sm'
        : 'bg-transparent text-gray-600 border-transparent hover:bg-primary-50 hover:text-primary-600'
    }`;

  // ✅ CSS FIXED: Red background hover for favorites
  const favLinkClass = (active: boolean) =>
    `group flex items-center justify-between w-full p-3 rounded-xl transition-all duration-200 border ${
      active
        ? 'bg-white text-red-600 font-bold border-gray-200 shadow-sm'
        : 'bg-transparent text-gray-600 border-transparent hover:bg-red-50 hover:text-red-600'
    }`;

  const headerBtnClass = "w-7 h-7 flex items-center justify-center text-gray-400 hover:text-primary-600 hover:bg-primary-100/80 rounded-md transition-all active:scale-95";

  const handleAddFolderSubmit = async (name: string, pid?: string) => {
    await addFolder(name, pid || null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('bg-primary-50', 'scale-[1.02]', 'shadow-sm', 'border-primary-200');
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-primary-50', 'scale-[1.02]', 'shadow-sm', 'border-primary-200');
  };

  const handleDrop = async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-primary-50', 'scale-[1.02]', 'shadow-sm', 'border-primary-200');
    
    const videoIdsStr = e.dataTransfer.getData('videoIds');
    const oldSingleVideoId = e.dataTransfer.getData('videoId');
    const sourceId = e.dataTransfer.getData('sourceId');
    
    let idsToMove: string[] = [];
    if (videoIdsStr) {
      try { idsToMove = JSON.parse(videoIdsStr); } catch (err) {}
    } else if (oldSingleVideoId) {
      idsToMove = [oldSingleVideoId];
    }
    
    if (idsToMove.length > 0 && sourceId !== targetFolderId) {
      await moveVideos(idsToMove, targetFolderId);
      window.dispatchEvent(new CustomEvent('app-video-moved', {
        detail: { videoIds: idsToMove, fromFolderId: sourceId, toFolderId: targetFolderId }
      }));
    }
  };

  return (
    <>
      <aside className="hidden md:flex flex-col w-[280px] h-fit min-h-[calc(100vh-110px)] sticky top-24 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] glass-sidebar rounded-3xl p-4 pb-6">
        
        <div className="mb-8 px-0.5">
          <Button
            fullWidth
            variant="primary"
            onClick={() => setIsVideoModalOpen(true)}
            className="shadow-xl shadow-primary-600/20 gap-2.5 py-4 rounded-2xl text-sm font-bold bg-gray-900/90 backdrop-blur-md hover:bg-black text-white transition-all border border-white/20"
          >
            <Download size={18} strokeWidth={2.5} />
            <span>{t('sidebar:saveNewVideo')}</span>
          </Button>
        </div>

        <div className="space-y-8">
          <div>
            <div className="flex items-center justify-between px-3 mb-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('sidebar:library')}</h3>
              <button onClick={() => setIsManageModalOpen(true)} className={headerBtnClass}>
                <SquarePen size={15} />
              </button>
            </div>

            <div className="space-y-1">
              <NavLink to="/gallery" end className={({ isActive }) => linkClass(isActive && !location.pathname.includes('favorites') && !location.pathname.includes('unsorted'))}>
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-xl transition-all duration-200 group-hover:scale-110 ${isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-600 group-hover:bg-white group-hover:shadow-sm'}`}>
                        <LayoutGrid size={20} />
                      </div>
                      <span className="text-sm pl-1">{t('gallery:myVideos', 'My videos')}</span>
                    </div>
                    <div className="w-7 flex justify-center flex-shrink-0">
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-primary-100 text-primary-600">
                        {videos.length}
                      </span>
                    </div>
                  </>
                )}
              </NavLink>

              <NavLink to="/organizer" className={({ isActive }) => linkClass(isActive)}>
                {({ isActive }) => (
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-xl transition-all duration-200 group-hover:scale-110 ${isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-600 group-hover:bg-white group-hover:shadow-sm'}`}>
                      <FolderOpen size={20} />
                    </div>
                    <span className="text-sm pl-1">{t('sidebar:organizer', 'Organizer')}</span>
                  </div>
                )}
              </NavLink>

              <NavLink to="/gallery/unsorted" className={({ isActive }) => linkClass(isActive)}>
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-xl transition-all duration-200 group-hover:scale-110 ${isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-600 group-hover:bg-white group-hover:shadow-sm'}`}>
                        <Inbox size={20} />
                      </div>
                      <span className="text-sm pl-1">{t('sidebar:unsorted', 'Unsorted')}</span>
                    </div>
                    <div className="w-7 flex justify-center flex-shrink-0">
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-primary-100 text-primary-600">
                        {getDirectVideoCount('unsorted')}
                      </span>
                    </div>
                  </>
                )}
              </NavLink>

              <NavLink to="/gallery/favorites" className={({ isActive }) => favLinkClass(isActive)}>
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-xl transition-all duration-200 group-hover:scale-110 ${isActive ? 'text-red-500' : 'text-gray-400 group-hover:text-red-500 group-hover:bg-white group-hover:shadow-sm'}`}>
                        <Heart size={20} />
                      </div>
                      <span className="text-sm pl-1">{t('gallery:favorites')}</span>
                    </div>
                    <div className="w-7 flex justify-center flex-shrink-0">
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md transition-colors ${isActive ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500 group-hover:bg-red-50 group-hover:text-red-600'}`}>
                        {getFavoritesCount()}
                      </span>
                    </div>
                  </>
                )}
              </NavLink>
            </div>
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between px-3 mb-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('sidebar:collections')}</h3>
              <button onClick={() => setIsInputModalOpen(true)} className={headerBtnClass}>
                <FolderPlus size={16} />
              </button>
            </div>

            <div className="space-y-1">
              {customFolders.map((folder: any) => {
                const anySubActive = folder.subFolders?.some((sub: any) => location.pathname === `/gallery/${sub.id}`);
                const hasSubs = !!(folder.subFolders && folder.subFolders.length > 0);
                
                return (
                  <div key={folder.id} className="mb-1">
                    <div 
                      onDragOver={handleDragOver} 
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave} 
                      onDrop={(e) => handleDrop(e, folder.id)}
                      className="rounded-xl transition-all duration-200"
                    >
                      <NavLink to={`/gallery/${folder.id}`} className={({ isActive }) => linkClass(isActive)}>
                        {({ isActive }) => (
                          <>
                            <div className="flex items-center gap-2 min-w-0 pointer-events-none">
                              <div className={`p-1.5 rounded-xl transition-all duration-200 group-hover:scale-110 ${isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-600 group-hover:bg-white group-hover:shadow-sm'}`}>
                                <FolderClosed size={20} />
                              </div>
                              <span className="text-sm truncate pl-1">{folder.name}</span>
                            </div>
                            
                            <div className="w-7 flex justify-center flex-shrink-0 pointer-events-none">
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md transition-all duration-200 
                                ${anySubActive ? 'opacity-0 group-hover:opacity-100 bg-primary-100 text-primary-600 hover:bg-primary-200' : 'bg-primary-100 text-primary-600 opacity-100 hover:bg-primary-200'}`}>
                                {getDirectVideoCount(folder.id)}
                              </span>
                            </div>
                          </>
                        )}
                      </NavLink>
                    </div>

                    {hasSubs && (
                      <div className="space-y-1 mt-1">
                        {folder.subFolders.map((sub: any) => {
                          const isSubActive = location.pathname === `/gallery/${sub.id}`;
                          return (
                            <div 
                              key={sub.id}
                              onDragOver={handleDragOver} 
                              onDragEnter={handleDragEnter}
                              onDragLeave={handleDragLeave} 
                              onDrop={(e) => handleDrop(e, sub.id)}
                              className="rounded-xl transition-all duration-200"
                            >
                              <NavLink to={`/gallery/${sub.id}`} 
                                className={({ isActive }) => `group flex items-center justify-between w-full py-2.5 pl-8 pr-3 rounded-xl border transition-all ${isActive ? 'bg-primary-50 text-primary-900 font-bold border-primary-100 shadow-sm' : 'bg-transparent text-gray-500 border-transparent hover:bg-primary-50 hover:text-primary-600'}`}
                              >
                                {({ isActive }) => (
                                  <>
                                    <div className="flex items-center gap-1 min-w-0 pointer-events-none">
                                      <div className={`p-1 rounded-xl transition-all duration-200 group-hover:scale-110 ${isActive ? 'text-primary-600' : 'text-gray-300 group-hover:text-primary-600 group-hover:bg-white group-hover:shadow-sm'}`}>
                                        <CornerDownRight size={14} strokeWidth={2.5} />
                                      </div>
                                      <span className="text-sm truncate">{sub.name}</span>
                                    </div>
                                    <div className="w-7 flex justify-center flex-shrink-0 pointer-events-none">
                                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md transition-all duration-200 hover:bg-gray-300
                                        ${isActive ? 'bg-gray-200 text-gray-700 opacity-100' : 'bg-gray-100 text-gray-500 opacity-0 group-hover:opacity-100'}`}>
                                        {getDirectVideoCount(sub.id)}
                                      </span>
                                    </div>
                                  </>
                                )}
                              </NavLink>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-2 mt-2 border-t border-white/40 space-y-1">
            <NavLink to="/gallery/shared" className={({ isActive }) => linkClass(isActive)}>
              {({ isActive }) => (
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-xl transition-all duration-200 group-hover:scale-110 ${isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-600 group-hover:bg-white group-hover:shadow-sm'}`}>
                    <Share2 size={20} />
                  </div>
                  <span className="text-sm pl-1">{t('sidebar:shared')}</span>
                </div>
              )}
            </NavLink>
            <NavLink to="/gallery/archive" className={({ isActive }) => linkClass(isActive)}>
              {({ isActive }) => (
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-xl transition-all duration-200 group-hover:scale-110 ${isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-600 group-hover:bg-white group-hover:shadow-sm'}`}>
                    <Archive size={20} />
                  </div>
                  <span className="text-sm pl-1">{t('sidebar:archive')}</span>
                </div>
              )}
            </NavLink>
          </div>
        </div>
      </aside>

      <InputModal
        isOpen={isInputModalOpen}
        onClose={() => setIsInputModalOpen(false)}
        onSubmit={handleAddFolderSubmit}
        title={t('sidebar:newCollection')}
        parentOptions={customFolders.map((f: any) => ({ id: f.id, name: f.name }))}
      />
      <ManageCollectionsModal isOpen={isManageModalOpen} onClose={() => setIsManageModalOpen(false)} />
      <AddVideoModal isOpen={isVideoModalOpen} onClose={() => setIsVideoModalOpen(false)} />
    </>
  );
};