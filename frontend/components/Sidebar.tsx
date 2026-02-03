import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { 
  Folder, 
  LayoutGrid, 
  Heart, 
  Archive, 
  Share2, 
  ChevronRight, 
  Download,
  SquarePen,
  FolderPlus
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { Button } from './Button';
import { InputModal } from './InputModal';
import { ManageCollectionsModal } from './ManageCollectionsModal';
import { AddVideoModal } from './AddVideoModal';

// Custom Icon for Subfolders
const FolderIcon = ({ size = 18, className = "" }: {size?: number, className?: string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>
  </svg>
);

export const Sidebar: React.FC = () => {
  const { folders, addFolder } = useData();
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  
  const location = useLocation();

  const handleCreateFolder = (name: string, parentId?: string) => {
    addFolder(name, parentId);
    setIsInputModalOpen(false);
  };

  const customFolders = folders.filter(f => f.id !== 'all' && f.id !== 'favorites' && f.id !== 'shared' && f.id !== 'archive');
  
  const parentOptions = customFolders.map(f => ({
    id: f.id,
    name: f.name
  }));

  const linkClass = (active: boolean) => `
    group flex items-center justify-between w-full p-2.5 rounded-xl transition-all duration-200
    ${active 
      ? 'bg-primary-50 text-primary-900 font-bold shadow-sm ring-1 ring-primary-100' 
      : 'text-gray-600 hover:bg-primary-50 hover:text-primary-900 font-medium'
    }
  `;

  const iconClass = (active: boolean) => `
    transition-colors duration-200 flex-shrink-0
    ${active ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-600'}
  `;

  return (
    <>
      <aside className="hidden md:flex flex-col h-[calc(100vh-100px)] sticky top-24 overflow-y-auto no-scrollbar pr-2 pb-4">
        
        {/* --- Top Action --- */}
        <div className="mb-6">
          <Button
            fullWidth
            variant="primary"
            onClick={() => setIsVideoModalOpen(true)}
            className="shadow-lg shadow-primary-600/20 gap-2 py-3"
          >
            <Download size={18} />
            <span>Save a new video</span>
          </Button>
        </div>

        {/* --- Library Section --- */}
        <div className="mb-6">
          {/* ✅ Edit Button Moved Here */}
          <div className="flex items-center justify-between px-3 mb-3">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
              Library
            </h3>
            <button 
               onClick={() => setIsManageModalOpen(true)}
               className="text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-all p-1.5 rounded-md"
               title="Manage Collections"
            >
               <SquarePen size={18} strokeWidth={2} />
            </button>
          </div>

          <div className="space-y-1">
            <NavLink to="/gallery" end className={({ isActive }) => linkClass(isActive && !location.pathname.includes('favorites') && !location.pathname.includes('shared') && !location.pathname.includes('archive'))}>
              {({ isActive }) => (
                <>
                  <div className="flex items-center gap-3">
                    <LayoutGrid size={20} className={iconClass(isActive && !location.pathname.includes('favorites'))} />
                    <span className="text-sm">All my videos</span>
                  </div>
                </>
              )}
            </NavLink>

            <NavLink to="/gallery/favorites" className={({ isActive }) => linkClass(isActive)}>
              {({ isActive }) => (
                <>
                  <div className="flex items-center gap-3">
                    <Heart size={20} className={iconClass(isActive)} />
                    <span className="text-sm">Favorites</span>
                  </div>
                </>
              )}
            </NavLink>
          </div>
        </div>

        {/* --- Collections Section --- */}
        <div className="mb-6 flex-1">
          <div className="flex items-center justify-between px-3 mb-3">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
              Collections
            </h3>
            
            {/* ✅ New Collection Button (Aligned Right) */}
            <button 
              onClick={() => setIsInputModalOpen(true)}
              className="text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-all p-1.5 rounded-md"
              title="New Collection"
            >
              <FolderPlus size={20} strokeWidth={2} />
            </button>
          </div>

          <div className="space-y-1">
            {customFolders.map(folder => (
              <div key={folder.id}>
                {/* Parent Folder */}
                <NavLink to={`/gallery/${folder.id}`} className={({ isActive }) => linkClass(isActive)}>
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center gap-3 min-w-0">
                        <Folder size={20} className={iconClass(isActive)} />
                        <span className="text-sm truncate">{folder.name}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex-shrink-0 ${isActive ? 'bg-white text-primary-700' : 'bg-gray-100 text-gray-500 group-hover:bg-white group-hover:text-primary-600 transition-colors'}`}>
                        {(folder as any).itemCount || 0}
                      </span>
                    </>
                  )}
                </NavLink>

                {/* Subfolders */}
                {folder.subFolders && folder.subFolders.length > 0 && (
                  <div className="space-y-1 mt-1">
                    {folder.subFolders.map(sub => (
                      <NavLink key={sub.id} to={`/gallery/${sub.id}`} className={({ isActive }) => `
                        flex items-center gap-2 w-full p-2 rounded-xl transition-all duration-200 pl-10 group
                        ${isActive 
                          ? 'bg-primary-50 text-primary-900 font-bold' 
                          : 'text-gray-500 hover:bg-primary-50 hover:text-primary-900 font-medium'
                        }
                      `}>
                        {({ isActive }) => (
                          <>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <FolderIcon size={18} className={iconClass(isActive)} />
                              <span className="text-sm truncate">{sub.name}</span>
                            </div>
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Empty State */}
            {customFolders.length === 0 && (
              <div onClick={() => setIsInputModalOpen(true)} className="p-4 border-2 border-dashed border-gray-100 rounded-xl text-center cursor-pointer hover:border-primary-200 hover:bg-primary-50/30 transition-all group">
                <span className="text-xs font-bold text-gray-400 group-hover:text-primary-500">Create collection</span>
              </div>
            )}

            {/* Shared & Archive */}
            <div className="pt-2 mt-2 border-t border-gray-50 space-y-1">
                <NavLink to="/gallery/shared" className={({ isActive }) => linkClass(isActive)}>
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center gap-3">
                        <Share2 size={20} className={iconClass(isActive)} />
                        <span className="text-sm">Shared with Me</span>
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
                        <span className="text-sm">Archive</span>
                      </div>
                      <ChevronRight size={14} className={`text-gray-300 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`} />
                    </>
                  )}
                </NavLink>
            </div>
          </div>
        </div>

      </aside>

      {/* --- Modals --- */}
      <InputModal 
        isOpen={isInputModalOpen} 
        onClose={() => setIsInputModalOpen(false)} 
        onSubmit={handleCreateFolder}
        title="New Collection"
        placeholder="e.g. Travel Ideas"
        parentOptions={parentOptions}
      />

      <ManageCollectionsModal 
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
      />

      <AddVideoModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
      />
    </>
  );
};