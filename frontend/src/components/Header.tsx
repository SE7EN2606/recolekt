import { API_BASE } from "../utils/api";
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Globe, Check, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from './Button';
import { MobileMenu } from './MobileMenu';
import { MobileBottomNav } from './MobileBottomNav';
import { InputModal } from './InputModal';
import { SearchOverlay } from './SearchOverlay';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import LogoBlack from '../assets/recolekt_logo_black.webp';
import LogoIcon from '../assets/recolekt_icon.webp';

export const Header: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isMobileLangMenuOpen, setIsMobileLangMenuOpen] = useState(false);
  
  const location = useLocation();
  const navigate = useNavigate();

  const { user, isAuthenticated, loading } = useAuth();
  const { t, i18n } = useTranslation(['header', 'common', 'gallery']);

  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY > 20;
      setIsScrolled(prev => prev !== scrolled ? scrolled : prev);
    };
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const meta = (user as any)?.user_metadata;
  const displayName = user?.name || meta?.full_name || 'User';
  const displayPicture = user?.picture || meta?.avatar_url;
  const initials = (displayName?.charAt?.(0) || 'U').toUpperCase();

  const showAuthedUI = !loading && isAuthenticated;
  const showSignedOutUI = !loading && !isAuthenticated;

  const handleQuickAdd = (_url: string) => {
    alert(t('header:videoSaved'));
    setIsAddModalOpen(false);
  };

  const handleLanguageChange = (lng: string) => {
    i18n.changeLanguage(lng);
    setIsLangMenuOpen(false);
    setIsMobileLangMenuOpen(false);
  };

  const currentLang = i18n.language?.substring(0, 2).toLowerCase() || 'en';

  const NavPill = ({ to, label }: { to: string; label: string }) => {
    const isActive = location.pathname === to;
    return (
      <Link
        to={to}
        onMouseEnter={() => setHoveredPath(to)}
        className={`
          relative px-6 py-2.5 rounded-full font-bold transition-all duration-300 tracking-tight
          ${isScrolled ? 'text-[14.5px]' : 'text-[16px]'}
          ${isActive ? 'text-primary-600' : 'text-gray-500 hover:text-primary-600'}
        `}
      >
        {hoveredPath === to && (
          <motion.span
            layoutId="nav-pill-background"
            className="absolute inset-0 bg-gray-100/50 border-2 border-gray-200 rounded-full -z-10 shadow-sm backdrop-blur-[2px]"
            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
          />
        )}
        <span className="relative z-10">{label}</span>
      </Link>
    );
  };

  return (
    <>
      <header
        className={`
          fixed top-0 left-0 right-0 z-[110]
          transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)]
          ${isScrolled
            ? 'glass-header pt-[calc(env(safe-area-inset-top,0px)_+_0.75rem)] pb-3 shadow-sm h-[calc(65px_+_env(safe-area-inset-top,0px))] md:h-[calc(70px_+_env(safe-area-inset-top,0px))]'
            : 'bg-transparent pt-[calc(env(safe-area-inset-top,0px)_+_1.5rem)] pb-6 h-[calc(80px_+_env(safe-area-inset-top,0px))] md:h-[calc(95px_+_env(safe-area-inset-top,0px))]'}
        `}
      >
        <div className="max-w-[1280px] mx-auto px-6 md:px-8 h-full">
          <div className="h-full flex items-center justify-between">

            <Link
              to={showAuthedUI ? '/gallery' : '/'}
              aria-label="Go to Home"
              className="flex items-center z-50 group shrink-0"
            >
              <img
                src={isMobileMenuOpen ? LogoIcon : LogoBlack}
                alt="recolekt"
                className={`transition-all duration-500 md:hidden object-contain ${isScrolled ? 'h-6' : 'h-8'}`}
              />
              <img
                src={LogoBlack}
                alt="recolekt"
                className={`hidden md:block transition-all duration-500 object-contain ${isScrolled ? 'h-8' : 'h-10'}`}
              />
            </Link>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              <nav className="flex items-center" onMouseLeave={() => setHoveredPath(null)}>
                {showAuthedUI ? (
                  <>
                    <NavPill to="/gallery" label={t('gallery:gallery')} />
                    <NavPill to="/gallery/favorites" label={t('gallery:favorites')} />
                    <NavPill to="/settings" label={t('header:settings')} />
                    <button 
                      onClick={() => setIsSearchOpen(true)}
                      aria-label={t('gallery:search', 'Search')}
                      className="ml-4 p-2 text-gray-500 hover:text-primary-600 transition-colors"
                    >
                      <Search size={22} />
                    </button>
                  </>
                ) : !loading && (
                  <>
                    <NavPill to="/" label={t('header:home')} />
                    <NavPill to="/features" label={t('common:features')} />
                    <NavPill to="/billing" label={t('common:pricing')} />
                  </>
                )}
              </nav>

              <div className="h-5 w-px bg-gray-400/30" />

              <div className="flex items-center gap-4">
                {showAuthedUI ? (
                  <Link to="/profile" className="relative group" aria-label="Account Settings">
                    <div className="w-11 h-11 rounded-full p-[2px] bg-gradient-to-br from-white/50 to-white/20 backdrop-blur-md border border-white/40 group-hover:border-primary-300 transition-colors shadow-sm overflow-hidden">
                      <div className="w-full h-full bg-white/80 rounded-full flex items-center justify-center overflow-hidden">
                        {displayPicture ? (
                          <img src={displayPicture} alt={displayName} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center text-white text-sm font-bold">
                            {initials}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                ) : showSignedOutUI ? (
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <button 
                        onClick={() => setIsLangMenuOpen(!isLangMenuOpen)} 
                        aria-label="Change Language"
                        className="flex items-center gap-1.5 px-2 py-1 mr-2 text-gray-400 hover:text-primary-600 transition-colors font-bold text-xs uppercase"
                      >
                        <Globe size={18} /><span className="hidden lg:inline-block">{currentLang}</span>
                      </button>
                      {isLangMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsLangMenuOpen(false)} />
                          <div className="absolute top-full mt-4 left-1/2 -translate-x-1/2 w-40 bg-white border border-gray-100 rounded-2xl shadow-xl py-2 z-50 animate-fade-in">
                            <button onClick={() => handleLanguageChange('en')} className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-bold hover:bg-gray-50 transition-colors ${currentLang === 'en' ? 'text-primary-600' : 'text-gray-700'}`}>English {currentLang === 'en' && <Check size={16} />}</button>
                            <button onClick={() => handleLanguageChange('fr')} className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-bold hover:bg-gray-50 transition-colors ${currentLang === 'fr' ? 'text-primary-600' : 'text-gray-700'}`}>Français {currentLang === 'fr' && <Check size={16} />}</button>
                          </div>
                        </>
                      )}
                    </div>
                    <Link to="/auth" className="font-bold text-gray-900 hover:text-primary-600 transition-colors">{t('common:signIn')}</Link>
                    <Button variant="primary" size="md" className="rounded-xl font-bold shadow-lg shadow-primary-600/20 hover:shadow-primary-600/30 hover:-translate-y-0.5 transition-all" onClick={() => navigate('/auth')}>{t('common:signUp')}</Button>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Mobile Actions */}
            <div className="flex items-center gap-2 md:hidden z-50">
               {showAuthedUI && (
                 <button 
                   onClick={() => setIsSearchOpen(true)}
                   aria-label={t('gallery:search', 'Search')}
                   className="w-10 h-10 rounded-full flex items-center justify-center text-gray-900 active:scale-95 hover:bg-gray-100 transition-all"
                 >
                   <Search size={22} />
                 </button>
               )}

               {showSignedOutUI && (
                 <div className="relative">
                   <button 
                     onClick={() => setIsMobileLangMenuOpen(!isMobileLangMenuOpen)} 
                     aria-label="Change Language"
                     className="flex items-center gap-1 text-gray-500 hover:text-gray-900 font-bold text-xs uppercase transition-colors"
                   >
                     <Globe size={18} /><span>{currentLang}</span>
                   </button>
                   {isMobileLangMenuOpen && (
                     <>
                       <div className="fixed inset-0 z-40" onClick={() => setIsMobileLangMenuOpen(false)} />
                       <div className="absolute top-full mt-4 right-0 w-40 bg-white border border-gray-100 rounded-2xl shadow-xl py-2 z-50 animate-fade-in">
                         <button onClick={() => handleLanguageChange('en')} className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-bold transition-colors ${currentLang === 'en' ? 'text-primary-600 bg-primary-50/50' : 'text-gray-700'}`}>English {currentLang === 'en' && <Check size={16} />}</button>
                         <button onClick={() => handleLanguageChange('fr')} className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-bold transition-colors ${currentLang === 'fr' ? 'text-primary-600 bg-primary-50/50' : 'text-gray-700'}`}>Français {currentLang === 'fr' && <Check size={16} />}</button>
                       </div>
                     </>
                   )}
                 </div>
               )}
              
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="w-10 h-10 rounded-full flex flex-col items-center justify-center relative z-50 transition-colors active:scale-95 hover:bg-gray-100"
                aria-label="Toggle menu"
              >
                <span className={`absolute w-5 h-[2px] bg-gray-900 rounded-full transition-all duration-300 ${isMobileMenuOpen ? 'rotate-45 translate-y-0' : '-translate-y-[4px]'}`} />
                <span className={`absolute w-5 h-[2px] bg-gray-900 rounded-full transition-all duration-300 ${isMobileMenuOpen ? '-rotate-45 translate-y-0' : 'translate-y-[4px]'}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <MobileMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      
      {showAuthedUI && <MobileBottomNav onAddClick={() => setIsAddModalOpen(true)} />}

      <InputModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSubmit={handleQuickAdd} title={t('header:saveNewVideo')} placeholder={t('header:pasteUrl')} confirmLabel={t('header:save')} />
    </>
  );
};
