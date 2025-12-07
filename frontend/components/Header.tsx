import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Button } from './Button';
import { MobileMenu } from './MobileMenu';
import { InputModal } from './InputModal';
import { MobileBottomNav } from './MobileBottomNav';
import { useData } from '../context/DataContext';

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
  const location = useLocation();
  const { addVideo } = useData();

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const logoScale = Math.max(0.9, 1.0 - scrollY / 500);
  const fontSize = Math.max(1.0, 1.3 - scrollY / 500);

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
                  className="h-8 md:h-9 transition-transform duration-100"
                  style={{ transform: `scale(${logoScale})` }}
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
              <div className="hidden md:block">
                <Button variant="primary" size="sm" className="h-9 px-5">
                  Sign In
                </Button>
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

      <div style={{ paddingTop: scrollY > 50 ? '65px' : '85px' }}>
        {/* Your main content wrapper */}
      </div>

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
    </>
  );
};
