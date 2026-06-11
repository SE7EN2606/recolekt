import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutGrid, Heart, Archive,
  ChevronRight, BookOpen, HelpCircle, FolderPlus, User, Settings, LogOut,
  FolderOpen, Inbox, CreditCard, FolderClosed, CornerDownRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { Button } from './Button';
import { InputModal } from './InputModal';
import { ManageCollectionsModal } from './ManageCollectionsModal';
import { useTranslation } from 'react-i18next';
import LogoBlack from '../assets/recolekt_logo_black.webp';
import { useScrollLock } from '../utils/useScrollLock';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({ isOpen, onClose }) => {
  const { isAuthenticated, loading, signOut } = useAuth();
  const { folders, addFolder, videos } = useData();
  const { t } = useTranslation(['common', 'sidebar', 'gallery', 'header', 'modals']);

  const [shouldRender, setShouldRender] = useState(false);
  const [animateOpen, setAnimateOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  useScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimateOpen(true)));
    } else {
      setAnimateOpen(false);
      const timer = setTimeout(() => setShouldRender(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleNewCollection = async (name: string, parentId?: string) => {
    await addFolder(name, parentId);
    setIsModalOpen(false);
  };

  const handleNav = (path: string) => {
    navigate(path);
    onClose();
  };

  const handleLogout = async () => {
    await signOut();
    onClose();
    navigate('/');
  };

  const getDirectVideoCount = (folderId: string) => {
    if (folderId === 'unsorted') {
      return (videos || []).filter((v: any) => !v.folderId || v.folderId === 'unsorted' || v.folderId === 'all').length;
    }
    return (videos || []).filter((v: any) => v.folderId === folderId).length;
  };

  const getFavoritesCount = () => (videos || []).filter((v: any) => v.isFavorite).length;

  const SYSTEM_FOLDER_IDS = new Set(['all', 'favorites', 'shared', 'archive', 'default', 'unsorted']);

  const customFolders = (folders || []).filter((f: any) => {
    const id = String(f?.id || '');
    const name = String(f?.name || '').trim().toLowerCase();
    return !SYSTEM_FOLDER_IDS.has(id) && !f?.isSystem && name !== 'all videos' && name !== 'my videos';
  });

  const parentOptions = customFolders.map((f: any) => ({ id: f.id, name: f.name }));
  const showAuthedUI = !loading && isAuthenticated;

  if (!shouldRender) return null;

  return (
    <>
      <div
        className={`
          fixed inset-0 w-full z-[100] overflow-hidden
          bg-slate-50/85 backdrop-blur-2xl transform-gpu
          transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
          ${animateOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}
        `}
      >
        <div className="flex flex-col h-[100dvh] max-w-[1100px] mx-auto px-4">
          <div className="mobile-menu-header-spacer md:h-[95px] md:flex-shrink-0" />

          <div className="flex-1 overflow-y-auto pt-0 pb-32">
            <div className={`transition-opacity duration-500 delay-100 ${animateOpen ? 'opacity-100' : 'opacity-0'} flex flex-col min-h-full`}>

              {showAuthedUI ? (
                <div className="flex-1 space-y-8">

                  {/* Library Section */}
                  <section>
                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-4 mb-3 drop-shadow-sm">
                      {t('sidebar:library', 'Library')}
                    </h3>
                    <div className="bg-white/60 backdrop-blur-md border border-white/70 rounded-[28px] overflow-hidden shadow-sm">
                      <button onClick={() => handleNav('/gallery')} className="w-full flex items-center gap-4 p-5 border-b border-white/50 group transition-all hover:bg-white/80">
                        <LayoutGrid size={22} className="text-gray-500 group-hover:text-primary-600 transition-colors" />
                        <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">{t('gallery:gallery', 'Gallery')}</span>
                        <span className="text-[10px] font-black bg-primary-100/80 text-primary-700 px-2 py-1 rounded-md tracking-wider">{videos.length}</span>
                      </button>

                      <button onClick={() => handleNav('/cookbook')} className="w-full flex items-center gap-4 p-5 border-b border-white/50 group transition-all hover:bg-white/80">
                        <BookOpen size={22} className="text-gray-500 group-hover:text-primary-600 transition-colors" />
                        <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">Cookbook</span>
                        <ChevronRight size={18} className="text-gray-400 group-hover:text-primary-500 transition-colors" />
                      </button>

                      <button onClick={() => handleNav('/shopping-list')} className="w-full flex items-center gap-4 p-5 border-b border-white/50 group transition-all hover:bg-white/80">
                        <FolderOpen size={22} className="text-gray-500 group-hover:text-primary-600 transition-colors" />
                        <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">{t('sidebar:shoppingList', 'Shopping List')}</span>
                        <ChevronRight size={18} className="text-gray-400 group-hover:text-primary-500 transition-colors" />
                      </button>

                      <button onClick={() => handleNav('/gallery/unsorted')} className="w-full flex items-center gap-4 p-5 border-b border-white/50 group transition-all hover:bg-white/80">
                        <Inbox size={22} className="text-gray-500 group-hover:text-primary-600 transition-colors" />
                        <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">{t('sidebar:unsorted', 'Unsorted')}</span>
                        <span className="text-[10px] font-black bg-primary-100/80 text-primary-700 px-2 py-1 rounded-md tracking-wider">{getDirectVideoCount('unsorted')}</span>
                      </button>

                      <button onClick={() => handleNav('/gallery/favorites')} className="w-full flex items-center gap-4 p-5 group transition-all hover:bg-[#f43f5e]/10">
                        <Heart size={22} className="text-[#f43f5e]" />
                        <span className="text-[#f43f5e] font-bold flex-1 text-left">{t('gallery:favorites', 'Favorites')}</span>
                        <span className="text-[10px] font-black bg-[#f43f5e]/10 text-[#f43f5e] px-2 py-1 rounded-md tracking-wider">{getFavoritesCount()}</span>
                      </button>
                    </div>
                  </section>

                  {/* Collections Section */}
                  <section>
                    {/* ✅ FolderPlus aligned with badges: pl-4 pr-4 matches p-5 rows */}
                    <div className="flex items-center justify-between pl-4 pr-4 mb-3">
                      <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] drop-shadow-sm">{t('sidebar:collections', 'Collections')}</h3>
                      <button onClick={() => setIsModalOpen(true)} className="text-primary-600 active:scale-95 hover:text-primary-700 transition-colors">
                        <FolderPlus size={22} />
                      </button>
                    </div>
                    <div className="bg-white/60 backdrop-blur-md border border-white/70 rounded-[28px] overflow-hidden shadow-sm">
                      {customFolders.length === 0 && (
                        <button onClick={() => setIsModalOpen(true)} className="w-full p-5 text-sm text-gray-500 font-medium hover:text-primary-600 hover:bg-white/80 transition-colors">
                          + {t('sidebar:createCollection', 'Create a collection')}
                        </button>
                      )}

                      {customFolders.map((folder: any) => {
                        const hasSubs = !!(folder.subFolders && folder.subFolders.length > 0);
                        return (
                          <div key={folder.id} className="border-b border-white/50 last:border-0">
                            <button onClick={() => handleNav(`/gallery/${folder.id}`)} className="w-full flex items-center justify-between p-5 group transition-all hover:bg-white/80">
                              <div className="flex items-center gap-4">
                                <FolderClosed size={22} className="text-gray-500 group-hover:text-primary-600 transition-colors" />
                                <span className="text-gray-900 font-bold group-hover:text-primary-600 transition-colors">{folder.name}</span>
                              </div>
                              <span className="text-[10px] font-black bg-primary-100/80 text-primary-700 px-2 py-1 rounded-md tracking-wider">{getDirectVideoCount(folder.id)}</span>
                            </button>

                            {hasSubs && (
                              <div className="bg-white/30">
                                {folder.subFolders.map((sub: any) => (
                                  <button key={sub.id} onClick={() => handleNav(`/gallery/${sub.id}`)} className="w-full flex items-center justify-between pl-14 pr-5 py-4 group transition-all hover:bg-white/80">
                                    <div className="flex items-center gap-3">
                                      <CornerDownRight size={18} strokeWidth={2.5} className="text-gray-400 group-hover:text-primary-500 transition-colors" />
                                      <span className="text-gray-700 font-medium group-hover:text-primary-600 transition-colors">{sub.name}</span>
                                    </div>
                                    <span className="text-[10px] font-black bg-gray-100 text-gray-500 group-hover:bg-primary-100/80 group-hover:text-primary-700 px-2 py-1 rounded-md tracking-wider transition-colors">{getDirectVideoCount(sub.id)}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <button onClick={() => handleNav('/gallery/archive')} className="w-full flex items-center justify-between p-5 border-t border-white/50 group transition-all hover:bg-white/80">
                        <div className="flex items-center gap-4"><Archive size={22} className="text-gray-500 group-hover:text-primary-600 transition-colors" /><span className="text-gray-900 font-bold group-hover:text-primary-600 transition-colors">{t('sidebar:archive', 'Archive')}</span></div>
                        <ChevronRight size={18} className="text-gray-400 group-hover:text-primary-500 transition-colors" />
                      </button>
                    </div>
                  </section>

                  {/* Account Section */}
                  <section>
                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-4 mb-3 drop-shadow-sm">{t('common:account', 'Account')}</h3>
                    <div className="bg-white/60 backdrop-blur-md border border-white/70 rounded-[28px] overflow-hidden shadow-sm">
                      <button onClick={() => handleNav('/settings')} className="w-full flex items-center gap-4 p-5 border-b border-white/50 group transition-all hover:bg-white/80">
                        <User size={22} className="text-gray-500 group-hover:text-primary-600 transition-colors" />
                        <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">{t('common:myAccount', 'My Account')}</span>
                        <ChevronRight size={18} className="text-gray-400 group-hover:text-primary-500 transition-colors" />
                      </button>
                      <button onClick={() => handleNav('/billing')} className="w-full flex items-center gap-4 p-5 border-b border-white/50 group transition-all hover:bg-white/80">
                        <CreditCard size={22} className="text-gray-500 group-hover:text-primary-600 transition-colors" />
                        <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">{t('common:billingPlan', 'Billing & Plan')}</span>
                        <ChevronRight size={18} className="text-gray-400 group-hover:text-primary-500 transition-colors" />
                      </button>
                      <button onClick={() => handleNav('/settings')} className="w-full flex items-center gap-4 p-5 group transition-all hover:bg-white/80">
                        <Settings size={22} className="text-gray-500 group-hover:text-primary-600 transition-colors" />
                        <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">{t('header:settings', 'App Settings')}</span>
                        <ChevronRight size={18} className="text-gray-400 group-hover:text-primary-500 transition-colors" />
                      </button>
                    </div>
                  </section>

                  {/* Resources Section */}
                  <section>
                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-4 mb-3 drop-shadow-sm">{t('common:resources', 'Resources')}</h3>
                    <div className="bg-white/60 backdrop-blur-md border border-white/70 rounded-[28px] overflow-hidden shadow-sm">
                      <button onClick={() => handleNav('/help?section=how-to')} className="w-full flex items-center gap-4 p-5 border-b border-white/50 group transition-all hover:bg-white/80">
                        <BookOpen size={22} className="text-gray-500 group-hover:text-primary-600 transition-colors" />
                        <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">{t('common:guide', 'Guide')}</span>
                        <ChevronRight size={18} className="text-gray-400 group-hover:text-primary-500 transition-colors" />
                      </button>
                      <button onClick={() => handleNav('/help?section=contact')} className="w-full flex items-center gap-4 p-5 group transition-all hover:bg-white/80">
                        <HelpCircle size={22} className="text-gray-500 group-hover:text-primary-600 transition-colors" />
                        <span className="text-gray-900 font-bold flex-1 text-left group-hover:text-primary-600 transition-colors">{t('common:support', 'Support')}</span>
                        <ChevronRight size={18} className="text-gray-400 group-hover:text-primary-500 transition-colors" />
                      </button>
                    </div>
                  </section>

                  <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 p-5 bg-white/80 backdrop-blur-md border border-white/70 text-red-600 rounded-[28px] font-bold shadow-sm active:scale-95 hover:bg-red-50 hover:border-red-100 hover:text-red-700 transition-all">
                    <LogOut size={20} />
                    {t('common:signOut', 'Sign Out')}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col h-full space-y-8 px-2">
                  <div className="space-y-2">
                    {[
                      { label: t('header:home', 'Home'), path: '/' },
                      { label: t('common:features', 'Features'), path: '/features' },
                      { label: t('common:pricing', 'Pricing'), path: '/billing' },
                      { label: t('common:support', 'Support'), path: '/help?section=contact' },
                    ].map((link) => (
                      <Link key={link.path} to={link.path} onClick={onClose} className={`block text-3xl font-black tracking-tight hover:text-primary-600 transition-colors py-2 ${location.pathname === link.path ? 'text-primary-600' : 'text-gray-900'}`}>
                        {link.label}
                      </Link>
                    ))}
                  </div>
                  <div className="pt-8 border-t border-gray-200 space-y-4">
                    <Button fullWidth variant="primary" onClick={() => handleNav('/auth')} className="h-14 text-base font-bold shadow-xl shadow-primary-600/20">
                      {t('common:signIn', 'Sign In')}
                    </Button>
                    <p className="text-center text-gray-500 text-sm font-medium">
                      {t('common:noAccount', "Don't have an account?")}{' '}
                      <button onClick={() => handleNav('/auth')} className="text-primary-600 font-bold hover:underline">{t('common:signUp', 'Sign Up')}</button>
                    </p>
                  </div>
                </div>
              )}

              <div className="py-8 mt-auto flex justify-center">
                <button onClick={() => handleNav('/gallery')} className="transition-transform active:scale-95">
                  <img src={LogoBlack} alt="Recolekt" className="h-8" />
                </button>
              </div>
              <div className="h-20 md:h-0" />
            </div>
          </div>
        </div>
      </div>

      <InputModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleNewCollection} title={t('sidebar:newCollection', 'New Collection')} placeholder={t('sidebar:travelIdeas', 'Name your collection...')} parentOptions={parentOptions} />
      <ManageCollectionsModal isOpen={isManageModalOpen} onClose={() => setIsManageModalOpen(false)} />
    </>
  );
};
