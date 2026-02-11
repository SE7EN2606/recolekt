import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Button } from './Button';
import { MobileMenu } from './MobileMenu'; // ✅ Named import matches export const MobileMenu
import { InputModal } from './InputModal';
import { MobileBottomNav } from './MobileBottomNav';
import { useAuth } from '../context/AuthContext';
import LogoBlack from '../assets/recolekt_logo_black.png';
import LogoIcon from '../assets/recolekt_icon.png';

export const Header: React.FC = () => {
  const [scrollY, setScrollY] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const { user, isAuthenticated, loading } = useAuth();

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isScrolled = scrollY > 50;
  const logoScale = Math.max(0.7, 1 - scrollY / 400);
  const fontSize = Math.max(0.9, 1.3 - scrollY / 500);

  // Support both your typed User and any provider user_metadata fields without TS errors
  const meta = (user as any)?.user_metadata;
  const displayName = user?.name || meta?.full_name || 'User';
  const displayPicture = user?.picture || meta?.avatar_url;
  const initials = (displayName?.charAt?.(0) || 'U').toUpperCase();

  const handleQuickAdd = (url: string) => {
    alert('Video saved!');
    setIsAddModalOpen(false);
  };

  // While loading, do NOT show the signed-out state (prevents the "Sign In" flash)
  const showAuthedUI = !loading && isAuthenticated;
  const showSignedOutUI = !loading && !isAuthenticated;

  return (
    <>
      <header
        className={`fixed top-0 z-40 w-full border-b bg-white transition-[height,background-color,box-shadow,border-color] duration-200 ${
          isScrolled
            ? 'bg-white/90 backdrop-blur-md border-gray-200 shadow-sm h-[65px] md:h-[70px]'
            : 'border-transparent h-[85px] md:h-[90px]'
        }`}
      >
        <div className="max-w-[1100px] mx-auto px-4 md:px-6 lg:px-8 h-full">
          <div className="h-full flex items-center justify-between">
            {/* Logo */}
            <Link to={showAuthedUI ? '/gallery' : '/'} className="flex items-center gap-2 flex-shrink-0 z-50">
              <img
                src={isMobileMenuOpen ? LogoIcon : LogoBlack}
                alt="Recolekt"
                className="h-8 md:h-9 transition-all duration-200 md:hidden"
                style={{ transform: `scale(${logoScale})`, transformOrigin: 'left center' }}
              />
              <img
                src={LogoBlack}
                alt="Recolekt"
                className="hidden md:block h-9 transition-all duration-200"
                style={{ transform: `scale(${logoScale})`, transformOrigin: 'left center' }}
              />
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-6 lg:gap-8">
              {loading ? (
                <>
                  <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
                  <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                  <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                </>
              ) : showAuthedUI ? (
                <>
                  <Link
                    to="/gallery"
                    className={`font-medium transition-colors duration-100 ${
                      location.pathname.includes('/gallery') && !location.pathname.includes('/favorites')
                        ? 'text-primary-600'
                        : 'text-gray-600 hover:text-primary-600'
                    }`}
                    style={{ fontSize: `${fontSize}rem` }}
                  >
                    Gallery
                  </Link>
                  <Link
                    to="/gallery/favorites"
                    className={`font-medium transition-colors duration-100 ${
                      location.pathname.includes('/favorites') ? 'text-primary-600' : 'text-gray-600 hover:text-primary-600'
                    }`}
                    style={{ fontSize: `${fontSize}rem` }}
                  >
                    Favorites
                  </Link>
                  <Link
                    to="/settings/app"
                    className={`font-medium transition-colors duration-100 ${
                      location.pathname.includes('/settings/app') ? 'text-primary-600' : 'text-gray-600 hover:text-primary-600'
                    }`}
                    style={{ fontSize: `${fontSize}rem` }}
                  >
                    Settings
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/" className="text-gray-600 hover:text-primary-600 font-medium" style={{ fontSize: `${fontSize}rem` }}>
                    Home
                  </Link>
                  <Link
                    to="/features"
                    className="text-gray-600 hover:text-primary-600 font-medium"
                    style={{ fontSize: `${fontSize}rem` }}
                  >
                    Features
                  </Link>
                  <Link
                    to="/billing"
                    className="text-gray-600 hover:text-primary-600 font-medium"
                    style={{ fontSize: `${fontSize}rem` }}
                  >
                    Pricing
                  </Link>
                </>
              )}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-3 lg:gap-4">
              <div className="hidden md:flex items-center gap-3">
                {loading ? (
                  <>
                    <div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse" />
                    <div className="h-9 w-24 rounded-lg bg-gray-200 animate-pulse" />
                  </>
                ) : showAuthedUI ? (
                  <button
                    onClick={() => navigate('/settings/account')}
                    className="relative w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center text-white font-bold text-sm ring-2 ring-gray-100 hover:ring-primary-500 transition-all overflow-hidden shadow-sm"
                    title="Account Settings"
                  >
                    {displayPicture ? (
                      <img src={displayPicture} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </button>
                ) : showSignedOutUI ? (
                  <Button variant="primary" size="sm" className="h-9 px-5" onClick={() => navigate('/auth')}>
                    Sign In
                  </Button>
                ) : null}
              </div>

              <div className="flex items-center gap-1 md:hidden">
                <button
                  className="p-2 -mr-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors z-50"
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                >
                  {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <MobileMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      {showAuthedUI && <MobileBottomNav onAddClick={() => setIsAddModalOpen(true)} />}

      <InputModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleQuickAdd}
        title="Save New Video"
        placeholder="Paste video URL..."
        confirmLabel="Save"
      />
    </>
  );
};
