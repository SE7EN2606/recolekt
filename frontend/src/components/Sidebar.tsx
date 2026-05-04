import { API_BASE } from "../utils/api";
import React, { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutGrid, Heart, Archive, Share2,
  Download, SquarePen, FolderPlus, CornerDownRight, FolderClosed, Inbox,
  FolderOpen, MapPin, ShoppingCart,
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
  const { folders, addFolder, videos, moveVideos, groceryList } = useData();
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

  // Items still to buy (not marked as "have it")
  const getGroceryCount = () => (groceryList || []).filter((i: any) => !i.have).length;

  const linkClass = (active: boolean) =>
    `flex items-center justify-between pl-3 pr-3.5 py-3 rounded-xl transition-all duration-200 group border ${
      active
        ? 'bg-primary-50 text-primary-700 shadow-sm border-primary-100/50'
        : 'text-gray-600 hover:bg-primary-50 hover:text-primary-600 border-transparent'
    }`;

  const favLinkClass = (active: boolean) =>
    `flex items-center justify-between pl-3 pr-3.5 py-3 rounded-xl transition-all duration-200 group border ${
      active
        ? 'bg-red-50 text-red-600 shadow-sm border-red-100/50'
        : 'text-gray-600 hover:bg-red-50 hover:text-red-600 border-transparent'
    }`;

  const placesLinkClass = (active: boolean) =>
    `flex items-center justify-between pl-3 pr-3.5 py-3 rounded-xl transition-all duration-200 group border ${
      active
        ? 'bg-teal-50 text-teal-700 shadow-sm border-teal-100/50'
        : 'text-gray-600 hover:bg-teal-50 hover:text-teal-700 border-transparent'
    }`;

  const groceryLinkClass = (active: boolean) =>
    `flex items-center justify-between pl-3 pr-3.5 py-3 rounded-xl transition-all duration-200 group border ${
      active
        ? 'bg-green-50 text-green-700 shadow-sm border-green-100/50'
        : 'text-gray-600 hover:bg-green-50 hover:text-green-700 border-transparent'
    }`;

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
      <aside className="hidden md:flex flex-col w-[280px] shrink-0 sticky top-24 self-start z-20 bg-white/70 backdrop-blur-2xl border border-white/80 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] rounded-[2rem] p-4 pb-4 transition-all max-h-[calc(100vh-7rem)]">

        {/* Fixed Top Section */}
        <div className="mb-6 px-0.5 shrink-0">
          <Button
            fullWidth
            variant="primary"
            onClick={() => setIsVideoModalOpen(true)}
            className="shadow-xl shadow-primary-600/20 gap-2.5 py-4 rounded-2xl text-sm font-bold bg-gray-900/90 backdrop-blur-md hover:bg-black text-white transition-all border border-white/20"
          >
            <Download size={18} strokeWidth={2.5} />
            <span>{t('sidebar:saveNewVideo', 'Save New Video')}</span>
          </Button>
        </div>

        {/* Scrollable Inner Section */}
        <div className="flex-1 overflow-y-auto space-y-8 pb-4 pr-1 -mr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          <div>
            <div className="mb-2 px-0.5">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('sidebar:library', 'Library')}</h3>
            </div>

            <div className="space-y-1">
              <NavLink to="/gallery" end className={({ isActive }) => linkClass(isActive && !location.pathname.includes('favorites') && !location.pathname.includes('unsorted'))}>
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <LayoutGrid size={20} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-600'} />
                      <span className="text-[15px] font-semibold">{t('gallery:myVideos', 'All Videos')}</span>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-primary-50 text-primary-600 border border-primary-100/50">
                      {videos.length}
                    </span>
                  </>
                )}
              </NavLink>

              {false && <NavLink to="/organizer" className={({ isActive }) => linkClass(isActive)}>
                {({ isActive }) => (
                  <div className="flex items-center gap-3">
                    <FolderOpen size={20} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-600'} />
                    <span className="text-[15px] font-semibold">{t('sidebar:organizer', 'Organizer')}</span>
                  </div>
                )}
              </NavLink>}

              <NavLink to="/gallery/unsorted" className={({ isActive }) => linkClass(isActive)}>
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <Inbox size={20} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-600'} />
                      <span className="text-[15px] font-semibold">{t('sidebar:unsorted', 'Unsorted')}</span>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-primary-50 text-primary-600 border border-primary-100/50">
                      {getDirectVideoCount('unsorted')}
                    </span>
                  </>
                )}
              </NavLink>

              <NavLink to="/gallery/favorites" className={({ isActive }) => favLinkClass(isActive)}>
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <Heart size={20} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-red-600' : 'text-gray-400 group-hover:text-red-600'} />
                      <span className="text-[15px] font-semibold">{t('gallery:favorites', 'Favorites')}</span>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-red-50 text-red-600 border border-red-100/50">
                      {getFavoritesCount()}
                    </span>
                  </>
                )}
              </NavLink>

              {/* Grocery List */}
              <NavLink to="/grocery-list" className={({ isActive }) => groceryLinkClass(isActive)}>
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <ShoppingCart
                        size={20}
                        strokeWidth={isActive ? 2.5 : 2}
                        className={isActive ? 'text-green-600' : 'text-gray-400 group-hover:text-green-600'}
                      />
                      <span className="text-[15px] font-semibold">
                        {t('sidebar:groceryList', 'Grocery List')}
                      </span>
                    </div>
                    {getGroceryCount() > 0 && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-green-50 text-green-700 border border-green-100/50">
                        {getGroceryCount()}
                      </span>
                    )}
                  </>
                )}
              </NavLink>

              {/* Saved Places */}
              {false && <NavLink to="/places" className={({ isActive }) => placesLinkClass(isActive)}>
                {({ isActive }) => (
                  <div className="flex items-center gap-3">
                    <MapPin
                      size={20}
                      strokeWidth={isActive ? 2.5 : 2}
                      className={isActive ? 'text-teal-600' : 'text-gray-400 group-hover:text-teal-600'}
                      aria-hidden="true"
                    />
                    <span className="text-[15px] font-semibold">{t('sidebar:savedPlaces', 'Saved Places')}</span>
                  </div>
                )}
              </NavLink>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 pl-0.5 pr-3.5">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('sidebar:collections', 'Collections')}</h3>
              <button onClick={() => setIsInputModalOpen(true)} className="p-1 hover:bg-primary-50 rounded text-gray-400 hover:text-primary-600 transition-colors" title={t('sidebar:newCollection')}>
                <FolderPlus size={18} />
              </button>
            </div>

            <div className="space-y-1">
              {customFolders.map((folder: any) => {
                const hasSubs = !!(folder.subFolders && folder.subFolders.length > 0);
                const folderPath = `/gallery/${folder.id}`;

                return (
                  <div key={folder.id} className="mb-1">
                    <div
                      onDragOver={handleDragOver}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, folder.id)}
                      className="rounded-xl transition-all duration-200"
                    >
                      <NavLink to={folderPath} className={({ isActive }) => linkClass(isActive)}>
                        {({ isActive }) => (
                          <>
                            <div className="flex items-center gap-3 min-w-0 pointer-events-none">
                              <FolderOpen size={20} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-600'} />
                              <span className="text-[15px] font-semibold truncate">{folder.name}</span>
                            </div>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-primary-50 text-primary-600 border border-primary-100/50 pointer-events-none">
                              {getDirectVideoCount(folder.id)}
                            </span>
                          </>
                        )}
                      </NavLink>
                    </div>

                    {hasSubs && (
                      <div className="space-y-1 mt-1">
                        {folder.subFolders.map((sub: any) => {
                          const subPath = `/gallery/${sub.id}`;
                          return (
                            <div
                              key={sub.id}
                              onDragOver={handleDragOver}
                              onDragEnter={handleDragEnter}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, sub.id)}
                              className="rounded-xl transition-all duration-200"
                            >
                              <NavLink
                                to={subPath}
                                className={({ isActive }) =>
                                  `group flex items-center gap-2.5 py-2.5 pr-3 rounded-xl text-[14px] transition-all border pl-7 ${
                                    isActive
                                      ? 'text-primary-700 border-primary-100/30 bg-primary-50/30'
                                      : 'text-gray-500 hover:text-primary-600 hover:bg-primary-50 border-transparent'
                                  }`
                                }
                              >
                                {({ isActive }) => (
                                  <>
                                    <CornerDownRight size={14} className={isActive ? 'text-primary-600' : 'text-gray-300 group-hover:text-primary-600'} strokeWidth={isActive ? 2.5 : 2} />
                                    <span className="truncate font-medium">{sub.name}</span>
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

          <div>
            <div className="mb-2 px-0.5">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('sidebar:others', 'Others')}</h3>
            </div>
            <div className="space-y-1">
              <NavLink to="/gallery/shared" className={({ isActive }) => linkClass(isActive)}>
                {({ isActive }) => (
                  <div className="flex items-center gap-3">
                    <Share2 size={20} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-600'} />
                    <span className="text-[15px] font-semibold">{t('sidebar:shared', 'Shared')}</span>
                  </div>
                )}
              </NavLink>
              <NavLink to="/gallery/archive" className={({ isActive }) => linkClass(isActive)}>
                {({ isActive }) => (
                  <div className="flex items-center gap-3">
                    <Archive size={20} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-600'} />
                    <span className="text-[15px] font-semibold">{t('sidebar:archive', 'Archive')}</span>
                  </div>
                )}
              </NavLink>
            </div>
          </div>
        </div>
      </aside>

      <InputModal
        isOpen={isInputModalOpen}
        onClose={() => setIsInputModalOpen(false)}
        onSubmit={handleAddFolderSubmit}
        title={t('sidebar:newCollection', 'New Collection')}
        parentOptions={customFolders.map((f: any) => ({ id: f.id, name: f.name }))}
      />
      <ManageCollectionsModal isOpen={isManageModalOpen} onClose={() => setIsManageModalOpen(false)} />
      <AddVideoModal isOpen={isVideoModalOpen} onClose={() => setIsVideoModalOpen(false)} />
    </>
  );
};