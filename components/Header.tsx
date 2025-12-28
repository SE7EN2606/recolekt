import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, LogOut, User } from 'lucide-react';
import { Button } from './Button';
import { MobileMenu } from './MobileMenu';
import { InputModal } from './InputModal';
import { MobileBottomNav } from './MobileBottomNav';
import { AuthModal } from './AuthModal';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';


// Your logo SVG component
const LogoSVG = () => (
  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="20" height="20" viewBox="0 0 2000 2000">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
  </svg>
);


export const Header: React.FC = () => {
  const [scrollY, setScrollY] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const location = useLocation();
  const { addVideo } = useData();
  const { user, signOut } = useAuth();


  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);


  const logoScale = Math.max(0.75, 1.0 - scrollY / 300);
  const fontSize = Math.max(0.9, 1.3 - scrollY / 500);


  const handleQuickAdd = (url: string) => {
    addVideo(url);
    alert('Video saved!');
    setIsAddModalOpen(false);
  };


  return (
    <>
      <header
        className={`
          fixed top-0 z-40 w-full border-b bg-white
          transition-[height,background-color,box-shadow,border-color] duration-200
          ${scrollY > 50 ? 'bg-white/90 backdrop-blur-md border-gray-200 shadow-sm h-[65px] md:h-[70px]' : 'border-transparent h-[85px] md:h-[90px]'}
        `}
      >
        <div className="max-w-[1100px] mx-auto px-4 md:px-6 lg:px-8 h-full">
          <div className="h-full flex items-center justify-between">
            {/* Left: Logo */}
            <Link to="/" className="flex items-center gap-2 flex-shrink-0 z-50">
              <div className="flex items-center">
                <img
                  src="https://raw.githubusercontent.com/SE7EN2606/recolekt/refs/heads/main/recolekt_logo_black.svg"
                  alt="recolekt_logo_black"
                  className="h-8 md:h-9 transition-transform duration-200 origin-left"
                  style={{ 
                    transform: `scale(${logoScale})`,
                    transformOrigin: 'left center'
                  }}
                />
              </div>
            </Link>


            {/* Center: Desktop Nav */}
            <nav className="hidden md:flex items-center gap-10">
              <Link
                to="/"
                className={`
                  font-medium transition-colors duration-100
                  ${location.pathname === '/' ? 'text-primary-600' : 'text-gray-600 hover:text-primary-600'}
                `}
                style={{ fontSize: `${fontSize}rem` }}
              >
                Home
              </Link>
              <Link
                to="/gallery"
                className={`
                  font-medium transition-colors duration-100
                  ${
                    location.pathname.includes('/gallery') &&
                    !location.pathname.includes('favorites')
                      ? 'text-primary-600'
                      : 'text-gray-600 hover:text-primary-600'
                  }
                `}
                style={{ fontSize: `${fontSize}rem` }}
              >
                Gallery
              </Link>
              <Link
                to="/gallery/favorites"
                className={`
                  font-medium transition-colors duration-100
                  ${location.pathname.includes('favorites') ? 'text-primary-600' : 'text-gray-600 hover:text-primary-600'}
                `}
                style={{ fontSize: `${fontSize}rem` }}
              >
                Favorites
              </Link>
            </nav>


            {/* Right: Navigation & Actions */}
            <div className="flex items-center gap-3 lg:gap-4">
              {/* Desktop Authentication UI */}
              <div className="hidden md:flex items-center gap-3">
                {user ? (
                  <>
                    <div className="flex items-center gap-2">
                      {user.photoURL ? (
                        <img 
                          src={user.photoURL} 
                          alt={user.displayName || 'User'} 
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                          <User size={18} className="text-primary-600" />
                        </div>
                      )}
                      <span className="text-sm font-medium text-gray-700">
                        {user.displayName || user.email}
                      </span>
                    </div>
                    <button
                      onClick={signOut}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </>
                ) : (
                  <Button variant="primary" size="sm" className="h-9 px-5" onClick={() => setIsAuthModalOpen(true)}>
                    Sign In
                  </Button>
                )}
              </div>


              {/* Mobile Actions */}
              <div className="flex items-center gap-1 md:hidden">
                <button
                  className="p-2 -mr-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors z-50"
                  onClick={() => setIsMobileMenuOpen(true)}
                >
                  {isMobileMenuOpen ? <LogoSVG /> : <Menu size={24} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ✅ REMOVED THE DUPLICATE PADDING DIV */}

      <MobileMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <MobileBottomNav onAddClick={() => setIsAddModalOpen(true)} />
      <InputModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleQuickAdd}
        title="Save New Video"
        placeholder="Paste video URL..."
        confirmLabel="Save"
      />
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  );
};
