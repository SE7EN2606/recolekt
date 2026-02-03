 import { Link } from "react-router-dom";
import { Play, Menu, Search } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface HeaderProps {
  onMenuClick?: () => void;
  showSearch?: boolean;
}

export function Header({ onMenuClick, showSearch = false }: HeaderProps) {
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isShrunk, setIsShrunk] = useState(false);

  useEffect(() => {
    if (isSearchVisible && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchVisible]);

  // Smooth shrinking with RAF for no jitter
  useEffect(() => {
    let ticking = false;
    let lastScrollY = 0;

    const handleScroll = () => {
      lastScrollY = window.scrollY;

      if (!ticking) {
        window.requestAnimationFrame(() => {
          setIsShrunk((prev) => {
            if (!prev && lastScrollY > 60) return true;
            if (prev && lastScrollY < 30) return false;
            return prev;
          });
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`
        sticky top-0 z-50 w-full border-b border-slate-200
        bg-white/95 backdrop-blur-md
        transition-all duration-300 ease-out
        ${isShrunk ? "header-elevated" : "header-flat"}
      `}
      style={{
        height: isShrunk ? "70px" : "100px",
      }}
    >
      <div
        className={`
          max-w-[1100px] mx-auto px-4 w-full h-full
          flex items-center justify-between gap-4
        `}
      >
        {/* MOBILE: Burger (left) */}
        <button
          onClick={onMenuClick}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors md:hidden flex-shrink-0"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6 text-slate-700" />
        </button>

        {/* MOBILE: Logo (center) */}
        <Link
          to="/"
          className="flex items-center gap-2 font-bold md:hidden absolute left-1/2 -translate-x-1/2"
        >
          <div
            className={`
              rounded-lg flex items-center justify-center
              bg-gradient-to-br from-violet-600 to-indigo-600
              transition-all duration-300
              ${isShrunk ? "w-8 h-8" : "w-10 h-10"}
            `}
          >
            <Play className={`${isShrunk ? "w-4 h-4" : "w-5 h-5"} text-white`} />
          </div>
          <span
            className={`
              bg-gradient-to-r from-violet-600 to-indigo-600
              bg-clip-text text-transparent transition-all duration-300
              ${isShrunk ? "text-lg" : "text-xl"}
            `}
          >
            SaveReels
          </span>
        </Link>

        {/* MOBILE: Search (right) */}
        <button
          onClick={() => setIsSearchVisible(!isSearchVisible)}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors md:hidden flex-shrink-0"
          aria-label="Search"
        >
          <Search className="w-6 h-6 text-slate-700" />
        </button>

        {/* DESKTOP: Logo (left) */}
        <Link
          to="/"
          className="hidden md:flex items-center gap-2 font-bold flex-shrink-0"
        >
          <div
            className={`
              rounded-lg flex items-center justify-center
              bg-gradient-to-br from-violet-600 to-indigo-600
              transition-all duration-300
              ${isShrunk ? "w-9 h-9" : "w-12 h-12"}
            `}
          >
            <Play className={`${isShrunk ? "w-5 h-5" : "w-6 h-6"} text-white`} />
          </div>
          <span
            className={`
              bg-gradient-to-r from-violet-600 to-indigo-600
              bg-clip-text text-transparent transition-all duration-300
              ${isShrunk ? "text-2xl" : "text-3xl"}
            `}
          >
            SaveReels
          </span>
        </Link>

        {/* DESKTOP: Nav (center) */}
        <nav className="hidden md:flex items-center gap-10 absolute left-1/2 -translate-x-1/2">
          <Link
            to="/"
            className={`
              font-medium text-slate-700 hover:text-violet-600 transition-colors
              ${isShrunk ? "text-base" : "text-xl"}
            `}
          >
            Home
          </Link>
          <Link
            to="/gallery"
            className={`
              font-medium text-slate-700 hover:text-violet-600 transition-colors
              ${isShrunk ? "text-base" : "text-xl"}
            `}
          >
            Gallery
          </Link>
          <Link
            to="/favorites"
            className={`
              font-medium text-slate-700 hover:text-violet-600 transition-colors
              ${isShrunk ? "text-base" : "text-xl"}
            `}
          >
            Favorites
          </Link>
        </nav>

        {/* DESKTOP: Sign In (right) */}
        <button
          className={`
            hidden md:inline bg-gradient-to-r from-violet-600 to-indigo-600
            text-white rounded-md transition-all duration-300
            ${isShrunk ? "px-4 py-2 text-sm" : "px-6 py-2.5 text-base"}
          `}
        >
          Sign In
        </button>
      </div>

      {/* MOBILE: Search dropdown */}
      {isSearchVisible && (
        <div className="md:hidden border-t border-slate-200 px-4 py-3 bg-white">
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-4 py-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search videos, tags..."
              className="bg-transparent outline-none text-sm w-full text-slate-900 placeholder:text-slate-500"
            />
          </div>
        </div>
      )}
    </header>
  );
}