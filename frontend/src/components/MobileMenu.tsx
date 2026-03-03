import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Search, Folder, Plus, LayoutGrid, Heart, Archive, Share2,
  ChevronRight, HelpCircle, BookOpen, FolderPlus, User, Settings, LogOut
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { Button } from './Button';
import { InputModal } from './InputModal';
import { ManageCollectionsModal } from './ManageCollectionsModal';
import { useTranslation } from 'react-i18next';
import LogoBlack from '../assets/recolekt_logo_black.png';
import { useScrollLock } from '../utils/useScrollLock';

const FolderIcon = ({ size = 22, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>
  </svg>
);

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({ isOpen, onClose }) => {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const { folders, addFolder } = useData();
  const { t } = useTranslation(['common', 'sidebar', 'gallery', 'header', 'modals']);

  const [shouldRender, setShouldRender] = useState(false);
  const [animateOpen, setAnimateOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const meta = (user as any)?.user_metadata;
  const displayName = user?.name || meta?.full_name || 'User';
  const displayPicture = user?.picture || meta?.avatar_url;
  const initials = (displayName?.charAt?.(0) || 'U').toUpperCase();

  useScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimateOpen(true)));
    } else {
      setAnimateOpen(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 500);
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

  const handleLogout = async () => {
    await logout();
    onClose();
    navigate('/');
  };

  const SYSTEM_FOLDER_IDS = new Set(['all', 'favorites', 'shared', 'archive', 'default']);
  const customFolders = (folders || []).filter((f: any) => {
    const id = String(f?.id || '');
    const name = String(f?.name || '').trim().toLowerCase();
    return !SYSTEM_FOLDER_IDS.has(id) && !f?.isSystem && name !== 'all videos';
  });

  const parentOptions = customFolders.map((f: any) => ({ id: f.id, name: f.name }));
  const showAuthedUI = !loading && isAuthenticated;

  if (!shouldRender) return null;

return (
    <>
      <div
        className={`
          fixed inset-0 w-full z-[100] overflow-hidden
          bg-[#f9fafb]/95 backdrop-blur-xl transform-gpu
          transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
          ${animateOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}
        `}
      >
        <div className="flex flex-col h-[100dvh] max-w-[1100px] mx-auto px-4">

          {/* 🔥 FIXED: Margins added so it sits perfectly between Logo and X button */}
          <div className="h-[80px] md:h-[95px] flex items-center flex-shrink-0 border-b border-gray-200">
            {showAuthedUI && (
              <div className="relative w-full ml-[48px] mr-[56px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder={t('common:search', 'Search...')}
                  className="w-full bg-white/80 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium focus:ring-4 focus:ring-primary-600/10 focus:border-primary-600 outline-none transition-all shadow-sm"
                />
              </div>
            )}
            {!showAuthedUI && <div className="flex-1" />}
          </div>

          <div className="flex-1 overflow-y-auto py-8">
            <div className={`transition-opacity duration-500 delay-100 ${animateOpen ? 'opacity-100' : 'opacity-0'} flex flex-col min-h-full`}>

              {!showAuthedUI && (
                <div className="flex flex-col h-full space-y-8 px-2">
                  <div className="space-y-2">
                    {[
                      { label: t('header:home', 'Home'), path: '/' },
                      { label: t('common:features', 'Features'), path: '/features' },
                      { label: t('common:pricing', 'Pricing'), path: '/billing' },
                      { label: t('common:support', 'Support'), path: '/help?section=contact' },
                    ].map((link) => (
                      <Link
                        key={link.path}
                        to={link.path}
                        onClick={onClose}
                        className={`block text-3xl font-black tracking-tight hover:text-primary-600 transition-colors py-2 ${
                          location.pathname === link.path ? 'text-primary-600' : 'text-gray-900'
                        }`}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>

                  <div className="pt-8 border-t border-gray-200 space-y-4">
                    <Button
                      fullWidth
                      variant="primary"
                      onClick={() => handleNav('/auth')}
                      className="h-14 text-base font-bold shadow-xl shadow-primary-600/20"
                    >
                      {t('common:signIn', 'Sign In')}
                    </Button>
                    <p className="text-center text-gray-500 text-sm font-medium">
                      {t('common:noAccount', "Don't have an account?")}{' '}
                      <button
                        onClick={() => handleNav('/auth')}
                        className="text-primary-600 font-bold hover:underline"
                      >
                        {t('common:signUp', 'Sign Up')}
                      </button>
                    </p>
                  </div>
                </div>
              )}

              {showAuthedUI && (
                <div className="flex-1 space-y-8">

                  <div className="flex items-center gap-4 px-2">
                    <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border border-gray-200 shadow-sm">
                      {displayPicture ? (
                        <img src={displayPicture} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center text-white font-bold text-lg">
                          {initials}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-base">{displayName}</p>
                      <p className="text-gray-500 text-sm truncate">{user?.email}</p>
                    </div>
                  </div>

                  <section>
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-4 mb-3">
                      {t('sidebar:library', 'Library')}
                    </h3>
                    <div className="bg-white border border-gray-200 rounded-[28px] overflow-hidden shadow-sm">
                      <button
                        onClick={() => handleNav('/gallery')}
                        className="w-full flex items-center gap-4 p-5 border-b border-gray-100 group transition-all hover:bg-gray-50"
                      >
                        <LayoutGrid size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                        <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">
                          {t('gallery:allVideos', 'All Videos')}
                        </span>
                        <ChevronRight size={18} className="text-gray-300 group-hover:text-primary-300 transition-colors" />
                      </button>
                      <button
                        onClick={() => handleNav('/gallery/favorites')}
                        className="w-full flex items-center gap-4 p-5 group transition-all hover:bg-gray-50"
                      >
                        <Heart size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                        <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">
                          {t('gallery:favorites', 'Favorites')}
                        </span>
                        <ChevronRight size={18} className="text-gray-300 group-hover:text-primary-300 transition-colors" />
                      </button>
                    </div>
                  </section>

                  <section>
                    <div className="flex items-center justify-between px-4 mb-3">
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                        {t('sidebar:collections', 'Collections')}
                      </h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setIsManageModalOpen(true)}
                          className="text-primary-600 text-xs font-bold uppercase tracking-wider"
                        >
                          {t('common:edit', 'Edit')}
                        </button>
                        <button
                          onClick={() => setIsModalOpen(true)}
                          className="text-primary-600 active:scale-95 transition-transform"
                        >
                          <FolderPlus size={24} />
                        </button>
                      </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-[28px] overflow-hidden shadow-sm">
                      {customFolders.map((folder: any) => (
                        <div key={folder.id} className="border-b border-gray-100 last:border-0">
                          <div className="flex items-center w-full pr-4 group transition-all hover:bg-gray-50">
                            <button
                              onClick={() => handleNav(`/gallery/${folder.id}`)}
                              className="flex-1 flex items-center justify-between p-5"
                            >
                              <div className="flex items-center gap-4">
                                <Folder size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                                <span className="text-gray-900 font-bold group-hover:text-primary-600 transition-colors">
                                  {folder.name}
                                </span>
                              </div>
                              <span className="text-[10px] font-black bg-gray-100 text-gray-500 px-2 py-1 rounded-md tracking-wider group-hover:bg-primary-50 group-hover:text-primary-600 transition-colors">
                                {folder.itemCount ?? 0}
                              </span>
                            </button>
                          </div>

                          {folder.subFolders && folder.subFolders.length > 0 && (
                            <div className="bg-gray-50/50">
                              {folder.subFolders.map((sub: any) => (
                                <div key={sub.id} className="flex items-center w-full pr-4 group transition-all hover:bg-gray-100">
                                  <button
                                    onClick={() => handleNav(`/gallery/${sub.id}`)}
                                    className="flex-1 flex items-center gap-3 pl-14 pr-2 py-3 text-sm"
                                  >
                                    <FolderIcon size={18} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                                    <span className="text-gray-600 font-medium group-hover:text-primary-600 transition-colors">
                                      {sub.name}
                                    </span>
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}

                      {customFolders.length === 0 && (
                        <button
                          onClick={() => setIsModalOpen(true)}
                          className="w-full p-5 text-sm text-gray-400 font-medium hover:text-primary-600 transition-colors"
                        >
                          + {t('sidebar:createCollection', 'Create a collection')}
                        </button>
                      )}

                      <div className="border-t border-gray-100">
                        <button
                          onClick={() => handleNav('/gallery/shared')}
                          className="w-full flex items-center justify-between p-5 group transition-all hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-4">
                            <Share2 size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                            <span className="text-gray-900 font-bold group-hover:text-primary-600 transition-colors">
                              {t('sidebar:shared', 'Shared with Me')}
                            </span>
                          </div>
                          <ChevronRight size={18} className="text-gray-300" />
                        </button>
                      </div>

                      <div className="border-t border-gray-100">
                        <button
                          onClick={() => handleNav('/gallery/archive')}
                          className="w-full flex items-center justify-between p-5 group transition-all hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-4">
                            <Archive size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                            <span className="text-gray-900 font-bold group-hover:text-primary-600 transition-colors">
                              {t('sidebar:archive', 'Archive')}
                            </span>
                          </div>
                          <ChevronRight size={18} className="text-gray-300" />
                        </button>
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-4 mb-3">
                      {t('common:account', 'Account')}
                    </h3>
                    <div className="bg-white border border-gray-200 rounded-[28px] overflow-hidden shadow-sm">
                      <button
                        onClick={() => handleNav('/settings/account')}
                        className="w-full flex items-center gap-4 p-5 border-b border-gray-100 group transition-all hover:bg-gray-50"
                      >
                        <User size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                        <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">
                          {t('common:myAccount', 'My Account')}
                        </span>
                        <ChevronRight size={18} className="text-gray-300" />
                      </button>
                      <button
                        onClick={() => handleNav('/settings/app')}
                        className="w-full flex items-center gap-4 p-5 group transition-all hover:bg-gray-50"
                      >
                        <Settings size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                        <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">
                          {t('header:settings', 'App Settings')}
                        </span>
                        <ChevronRight size={18} className="text-gray-300" />
                      </button>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-4 mb-3">
                      {t('common:resources', 'Resources')}
                    </h3>
                    <div className="bg-white border border-gray-200 rounded-[28px] overflow-hidden shadow-sm">
                      <button
                        onClick={() => handleNav('/help?section=how-to')}
                        className="w-full flex items-center gap-4 p-5 border-b border-gray-100 group transition-all hover:bg-gray-50"
                      >
                        <BookOpen size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                        <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">
                          {t('common:guide', 'Guide')}
                        </span>
                        <ChevronRight size={18} className="text-gray-300" />
                      </button>
                      <button
                        onClick={() => handleNav('/help?section=contact')}
                        className="w-full flex items-center gap-4 p-5 group transition-all hover:bg-gray-50"
                      >
                        <HelpCircle size={22} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
                        <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">
                          {t('common:support', 'Support')}
                        </span>
                        <ChevronRight size={18} className="text-gray-300" />
                      </button>
                    </div>
                  </section>

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 p-5 bg-white border border-red-200 text-red-600 rounded-[28px] font-bold shadow-sm hover:bg-red-50 transition-colors"
                  >
                    <LogOut size={20} />
                    {t('common:signOut', 'Sign Out')}
                  </button>
                </div>
              )}

              <div className="py-8 mt-auto flex justify-center">
                <img src={LogoBlack} alt="Recolekt" className="h-8 opacity-60" />
              </div>

              <div className="h-20 md:h-0" />
            </div>
          </div>
        </div>
      </div>

      <InputModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleNewCollection}
        title={t('sidebar:newCollection', 'New Collection')}
        placeholder={t('sidebar:travelIdeas', 'Name your collection...')}
        parentOptions={parentOptions}
      />

      <ManageCollectionsModal
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
      />
    </>
  );
};