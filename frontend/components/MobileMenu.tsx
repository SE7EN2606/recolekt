import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  X, 
  Search, 
  Folder, 
  Plus, 
  LayoutGrid, 
  Heart, 
  Archive, 
  Share2, 
  ChevronRight, 
  HelpCircle, 
  BookOpen, 
  Settings,
  User,
  LogOut,
  SquarePen
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Button } from './Button';
import { InputModal } from './InputModal';
import { ManageCollectionsModal } from './ManageCollectionsModal';

// Custom Icon: Folder Open (Sub Folder)
const FolderIcon = ({ size = 22, className = "" }: {size?: number, className?: string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>
  </svg>
);

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({ isOpen, onClose }) => {
  const { folders, addFolder } = useData();
  const { user, signOut } = useAuth();
  
  const [shouldRender, setShouldRender] = useState(false);
  const [animateOpen, setAnimateOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimateOpen(true));
      });
      document.body.style.overflow = 'hidden';
    } else {
      setAnimateOpen(false);
      const timer = setTimeout(() => setShouldRender(false), 500);
      document.body.style.overflow = '';
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleNewCollection = (name: string, parentId?: string) => {
    addFolder(name, parentId);
    setIsModalOpen(false);
  };

  const handleNav = (path: string) => {
    navigate(path);
    onClose();
  };

  const systemIds = ['all', 'favorites', 'shared', 'archive'];
  const customFolders = (folders || []).filter(f => !systemIds.includes(f.id));
  const parentOptions = customFolders.map(f => ({ id: f.id, name: f.name }));

  if (!shouldRender) return null;

  return (
    <>
      <div 
        className={`
          fixed top-0 left-0 w-full z-[100] bg-[#f8fafc] overflow-hidden
          transition-[height] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
          ${animateOpen ? 'h-[100dvh]' : 'h-0'}
        `}
      >
        <div className="flex flex-col h-[100dvh] max-w-[1100px] mx-auto px-4 md:px-6 lg:px-8">
          
          {/* Header */}
          <div className="h-[85px] md:h-[90px] flex items-center justify-between flex-shrink-0 border-b border-gray-100 gap-4">
             {user && (
               <div className="relative flex-1">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                 <input 
                   type="text" 
                   placeholder="Search..." 
                   className="w-full bg-white border border-gray-200 rounded-xl py-3 pl-10 pr-4 text-sm font-medium focus:ring-4 focus:ring-primary-600/10 focus:border-primary-600 outline-none transition-all shadow-sm"
                 />
               </div>
             )}
             
             {!user && <div className="flex-1"></div>}

             <button 
               onClick={onClose}
               className="p-2 -mr-2 text-gray-600 bg-transparent hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
             >
               <X size={24} />
             </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto py-8">
            <div className={`transition-opacity duration-500 delay-100 ${animateOpen ? 'opacity-100' : 'opacity-0'} flex flex-col min-h-full`}>
              
              {!user && (
                <div className="flex flex-col h-full space-y-8 px-2">
                  {/* Navigation Links */}
                  <div className="space-y-2">
                    {[
                      { label: 'Home', path: '/' }, 
                      { label: 'Features', path: '/features' }, 
                      { label: 'Pricing', path: '/billing' }, 
                      { label: 'Guide', path: '/help?section=how-to' }, 
                      { label: 'Support', path: '/help?section=contact' }
                    ].map((link) => (
                      <Link 
                        key={link.path} 
                        to={link.path} 
                        onClick={onClose} 
                        className={`block text-3xl font-black tracking-tight hover:text-primary-600 transition-colors py-2 ${location.pathname === link.path ? 'text-primary-600' : 'text-gray-900'}`}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>

                  {/* ✅ FIXED: Removed Google/Apple buttons, kept only Sign In/Up linking to /auth */}
                  <div className="mt-auto pb-12">
                    <div className="space-y-4">
                      <Button 
                        fullWidth 
                        onClick={() => handleNav('/auth')}
                        className="h-14 text-base font-bold shadow-xl shadow-primary-600/20"
                      >
                        Sign In
                      </Button>
                      <div className="text-center">
                        <p className="text-gray-500 text-sm font-medium">
                          Don't have an account?{' '}
                          <button 
                            onClick={() => handleNav('/auth')}
                            className="text-primary-600 font-bold hover:underline"
                          >
                            Sign Up
                          </button>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {user && (
                <div className="flex-1">
                  <div className="space-y-8">
                    
                    {/* Library */}
                    <section>
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-4 mb-3">Library</h3>
                      <div className="bg-white rounded-[28px] border border-gray-100 overflow-hidden shadow-sm">
                        <button onClick={() => handleNav('/gallery')} className="w-full flex items-center gap-4 p-5 border-b border-gray-50 group transition-all active:bg-gray-50">
                          <LayoutGrid size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                          <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">All my videos</span>
                          <ChevronRight size={18} className="text-gray-300 group-hover:text-primary-300 transition-colors" />
                        </button>
                        <button onClick={() => handleNav('/gallery/favorites')} className="w-full flex items-center gap-4 p-5 group transition-all active:bg-gray-50">
                          <Heart size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                          <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">Favorites</span>
                          <ChevronRight size={18} className="text-gray-300 group-hover:text-primary-300 transition-colors" />
                        </button>
                      </div>
                    </section>

                    {/* Collections */}
                    <section>
                      <div className="flex items-center justify-between px-4 mb-3">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Collections</h3>
                        <div className="flex items-center gap-3">
                           <button 
                             onClick={() => setIsManageModalOpen(true)}
                             className="text-primary-600 hover:text-primary-700 transition-colors"
                             title="Manage Collections"
                           >
                             <SquarePen size={18} />
                           </button>

                           <button onClick={() => setIsModalOpen(true)} className="text-primary-600 active:scale-95 transition-transform">
                             <Plus size={20} strokeWidth={3} />
                           </button>
                        </div>
                      </div>
                      
                      <div className="bg-white rounded-[28px] border border-gray-100 overflow-hidden shadow-sm">
                           {customFolders.length > 0 && customFolders.map((folder) => (
                              <div key={folder.id} className="border-b border-gray-50 last:border-0">
                                <button onClick={() => handleNav(`/gallery/${folder.id}`)} className="w-full flex items-center justify-between p-5 group transition-all active:bg-gray-50">
                                  <div className="flex items-center gap-4">
                                    <Folder size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                                    <span className="text-gray-900 font-bold group-hover:text-primary-600 transition-colors">{folder.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black bg-gray-100 text-gray-500 px-2 py-1 rounded-md tracking-wider group-hover:bg-primary-50 group-hover:text-primary-600 transition-colors">
                                      {(folder as any).itemCount || 0}
                                    </span>
                                  </div>
                                </button>
                                {folder.subFolders && (
                                  <div className="bg-gray-50/50">
                                    {folder.subFolders.map(sub => (
                                      <button key={sub.id} onClick={() => handleNav(`/gallery/${sub.id}`)} className="w-full flex items-center gap-3 pl-14 pr-5 py-3 text-sm group transition-all active:bg-gray-100">
                                        <FolderIcon size={18} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                                        <span className="text-gray-600 font-medium group-hover:text-primary-600 transition-colors">{sub.name}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                           ))}

                           {customFolders.length === 0 && (
                             <div className="text-center p-8 border-b border-gray-50">
                               <p className="text-gray-400 text-sm font-medium">No collections yet.</p>
                               <button onClick={() => setIsModalOpen(true)} className="text-primary-600 font-bold text-sm mt-2">Create one</button>
                             </div>
                           )}

                            <div className="border-b border-gray-50 last:border-0">
                             <button onClick={() => handleNav('/gallery/shared')} className="w-full flex items-center justify-between p-5 group transition-all active:bg-gray-50">
                               <div className="flex items-center gap-4">
                                 <Share2 size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                                 <span className="text-gray-900 font-bold group-hover:text-primary-600 transition-colors">Shared with Me</span>
                               </div>
                               <ChevronRight size={18} className="text-gray-300 group-hover:text-primary-300 transition-colors" />
                             </button>
                           </div>
                           <div className="border-t border-gray-50">
                             <button onClick={() => handleNav('/gallery/archive')} className="w-full flex items-center justify-between p-5 group transition-all active:bg-gray-50">
                               <div className="flex items-center gap-4">
                                 <Archive size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                                 <span className="text-gray-900 font-bold group-hover:text-primary-600 transition-colors">Archive</span>
                               </div>
                               <ChevronRight size={18} className="text-gray-300 group-hover:text-primary-300 transition-colors" />
                             </button>
                           </div>
                      </div>
                    </section>
                    
                    {/* Resources */}
                    <section>
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-4 mb-3">Resources</h3>
                      <div className="bg-white rounded-[28px] border border-gray-100 overflow-hidden shadow-sm">
                        <button onClick={() => handleNav('/help?section=how-to')} className="w-full flex items-center gap-4 p-5 border-b border-gray-50 group transition-all active:bg-gray-50">
                          <BookOpen size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                          <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">Guide</span>
                          <ChevronRight size={18} className="text-gray-300 group-hover:text-primary-300 transition-colors" />
                        </button>
                        <button onClick={() => handleNav('/help?section=contact')} className="w-full flex items-center gap-4 p-5 group transition-all active:bg-gray-50">
                          <HelpCircle size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                          <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">Support</span>
                          <ChevronRight size={18} className="text-gray-300 group-hover:text-primary-300 transition-colors" />
                        </button>
                      </div>
                    </section>

                    {/* Account */}
                    <section>
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-4 mb-3">Account</h3>
                      <div className="bg-white rounded-[28px] border border-gray-100 overflow-hidden shadow-sm">
                        <button onClick={() => handleNav('/settings/app')} className="w-full flex items-center gap-4 p-5 border-b border-gray-50 group transition-all active:bg-gray-50">
                          <Settings size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                          <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">App Settings</span>
                          <ChevronRight size={18} className="text-gray-300 group-hover:text-primary-300 transition-colors" />
                        </button>
                        <button onClick={() => handleNav('/settings/account')} className="w-full flex items-center gap-4 p-5 border-b border-gray-50 group transition-all active:bg-gray-50">
                          <User size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                          <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">My Account</span>
                          <ChevronRight size={18} className="text-gray-300 group-hover:text-primary-300 transition-colors" />
                        </button>
                        <button onClick={() => { signOut(); onClose(); }} className="w-full flex items-center gap-4 p-5 group transition-all active:bg-red-50">
                          <LogOut size={22} className="text-red-400 group-hover:text-red-600 transition-colors" />
                          <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-red-600 transition-colors">Sign Out</span>
                        </button>
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {/* Logo at Bottom */}
              <div className="py-8 mt-auto flex justify-center">
                 <img alt="recolekt_logo" className="h-10" src="https://raw.githubusercontent.com/SE7EN2606/recolekt/refs/heads/main/frontend/assets/recolekt_logo_black.png" />
              </div>

              <div className="h-20 md:h-0"></div>
            </div>
          </div>
        </div>
      </div>

      <InputModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleNewCollection}
        title="New Collection"
        placeholder="Name your collection..."
        parentOptions={parentOptions}
      />

      <ManageCollectionsModal 
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
      />
    </>
  );
};
