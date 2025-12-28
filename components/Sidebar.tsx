import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutGrid, Heart, Archive, Share2, Plus, ChevronDown } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Button } from './Button';


// Custom Icon: House (Root Collection)
const CollectionRootIcon = ({ size = 18, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
    <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);


// Custom Icon: Folders (Main Folder)
const FoldersIcon = ({ size = 18, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M20 5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2.5a1.5 1.5 0 0 1 1.2.6l.6.8a1.5 1.5 0 0 0 1.2.6z"/>
    <path d="M3 8.268a2 2 0 0 0-1 1.738V19a2 2 0 0 0 2 2h11a2 2 0 0 0 1.732-1"/>
  </svg>
);


// Custom Icon: Folder (Sub Folder)
const FolderIcon = ({ size = 18, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
  </svg>
);


// ✅ Modal Component for Creating Collection with Parent Folder Selection
interface CreateCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, parentId: string | null) => void;
  folders: any[];
}

const CreateCollectionModal: React.FC<CreateCollectionModalProps> = ({ isOpen, onClose, onSubmit, folders }) => {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim(), parentId);
      setName('');
      setParentId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Collection</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Collection Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Summer Trip"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              autoFocus
            />
          </div>

          {/* ✅ Only show if there are existing folders */}
          {folders.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Parent Folder (Optional)
              </label>
              <select
                value={parentId || ''}
                onChange={(e) => setParentId(e.target.value || null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                {/* ✅ Only show existing folders, no "None" option */}
                <option value="">-- Select a folder --</option>
                {folders.map(folder => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Leave empty to create a main folder
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


export const Sidebar: React.FC = () => {
  const { folders, addFolder } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCustomCollectionsOpen, setIsCustomCollectionsOpen] = useState(true);

  useEffect(() => {
    console.log('📁 Sidebar folders:', folders);
  }, [folders]);

  const handleCreateCollection = (name: string, parentId: string | null) => {
    addFolder(name, parentId);
    setIsModalOpen(false);
  };

  const customFolders = folders;

  return (
    <>
      <aside className="flex flex-col h-[calc(100vh-120px)] sticky top-24 overflow-y-auto no-scrollbar pr-4">
        
        <div className="mb-6">
          <Button 
            fullWidth 
            variant="primary" 
            onClick={() => setIsModalOpen(true)}
            className="shadow-lg shadow-primary-600/20 gap-2 py-3"
          >
            <Plus size={18} />
            <span>New Collection</span>
          </Button>
        </div>

        <div className="space-y-8">
          {/* Main Collections */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-3">My Collections</h3>
            <div className="space-y-1">
              <NavLink 
                to="/gallery" 
                end
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
              >
                <LayoutGrid size={18} />
                All my videos
              </NavLink>
              <NavLink 
                to="/gallery/favorites" 
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
              >
                <Heart size={18} />
                Favorites
              </NavLink>
              
              {/* Collapsible Folder Tree Root */}
              {customFolders.length > 0 && (
                <div className="pt-1">
                  <button 
                    onClick={() => setIsCustomCollectionsOpen(!isCustomCollectionsOpen)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 text-sm font-medium group"
                  >
                    <div className="flex items-center gap-3">
                      <CollectionRootIcon size={18} />
                      <span>Custom Collections</span>
                    </div>
                    <ChevronDown 
                      size={16} 
                      className={`text-gray-400 transition-transform ${isCustomCollectionsOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  
                  {/* Subfolders */}
                  {isCustomCollectionsOpen && (
                    <div className="pt-1 space-y-1">
                      {customFolders.map(folder => (
                        <div key={folder.id}>
                          <NavLink 
                            to={`/gallery/${folder.id}`}
                            className={({ isActive }) => `flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 hover:text-primary-600 cursor-pointer text-sm transition-colors ${isActive ? 'text-primary-600 font-medium bg-primary-50' : 'text-gray-600'}`}
                          >
                            <div className="flex items-center gap-3">
                              <FoldersIcon size={18} />
                              {folder.name}
                            </div>
                          </NavLink>
                          {folder.subFolders && folder.subFolders.length > 0 && (
                            <div className="pl-4 space-y-1">
                              {folder.subFolders.map(sub => (
                                <NavLink
                                  key={sub.id} 
                                  to={`/gallery/${sub.id}`}
                                  className={({ isActive }) => `flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${isActive ? 'text-primary-600 font-medium' : 'text-gray-500 hover:text-primary-600'}`}
                                >
                                  <FolderIcon size={16} />
                                  {sub.name}
                                </NavLink>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <NavLink 
                to="/gallery/shared" 
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
              >
                <Share2 size={18} />
                Shared with Me
              </NavLink>
            </div>
          </div>

          {/* Team Collections */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-3">Team Collections</h3>
            <div className="space-y-1">
              <NavLink 
                to="/gallery/archive" 
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
              >
                <Archive size={18} />
                Archive
              </NavLink>
            </div>
          </div>
        </div>
      </aside>

      {/* ✅ Updated Modal with Parent Folder Selection */}
      <CreateCollectionModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateCollection}
        folders={customFolders}
      />
    </>
  );
};

