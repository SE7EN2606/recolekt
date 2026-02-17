// src/components/MobileReelAction.tsx
import React, { useEffect, useState } from "react";

type MobileReelActionsProps = {
  isOpen: boolean;
  onClose: () => void;
  onShare: () => void;
  onAddToFavorites: () => void;
  onMoveToCollection: () => void;
  onArchive: () => void;
  onManageCollections: () => void;
  onReport: () => void;
  onDelete: () => void;
};

export const MobileReelActions: React.FC<MobileReelActionsProps> = ({
  isOpen,
  onClose,
  onShare,
  onAddToFavorites,
  onMoveToCollection,
  onArchive,
  onManageCollections,
  onReport,
  onDelete,
}) => {
  const [shouldRender, setShouldRender] = useState(false);
  const [animateOpen, setAnimateOpen] = useState(false);

  useEffect(() => {
    let timer: number | undefined;

    if (isOpen) {
      setShouldRender(true);
      // Double rAF to ensure entrance animation runs after mount
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimateOpen(true));
      });

      // Lock background scroll without shifting layout (compensate scrollbar)
      const scrollBarWidth =
        window.innerWidth - document.documentElement.clientWidth;

      if (scrollBarWidth > 0) {
        // Add padding-right equal to scrollbar width so content doesn't jump
        document.body.style.paddingRight = `${scrollBarWidth}px`;
      }

      document.body.style.overflow = "hidden";
      document.body.style.overscrollBehavior = "none";
    } else {
      setAnimateOpen(false);
      timer = window.setTimeout(() => setShouldRender(false), 300);

      // Restore scroll and padding
      document.body.style.overflow = "";
      document.body.style.overscrollBehavior = "";
      document.body.style.paddingRight = "";
    }

    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
      document.body.style.overflow = "";
      document.body.style.overscrollBehavior = "";
      document.body.style.paddingRight = "";
    };
  }, [isOpen]);

  if (!shouldRender) return null;

  // Helper so every action also closes the sheet
  const handle = (cb: () => void) => () => {
    cb();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/40 backdrop-blur-sm">
      {/* Click outside to close */}
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom sheet wrapper – max 450px, centered, gap on large screens */}
      <div className="relative z-10 w-full max-w-[450px] px-4 pb-[env(safe-area-inset-bottom,16px)]">
        <div
          className={`
            bg-white w-full rounded-t-[32px] md:rounded-2xl shadow-2xl relative overflow-hidden
            transform transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
            ${animateOpen ? "translate-y-0" : "translate-y-full"}
          `}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="w-full flex justify-center pt-3 pb-1">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
          </div>

          {/* Header */}
          <div className="px-6 pt-2 pb-3 border-b border-gray-50">
            <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">
              Manage Reel
            </h3>
          </div>

          {/* Scrollable content (sheet itself scrolls if small screen) */}
          <div className="max-h-[70vh] overflow-y-auto px-4 pb-5 pt-2 space-y-2">
            {/* Share Video */}
            <button
              onClick={handle(onShare)}
              className="
                w-full flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-[0.98]
                bg-white hover:bg-gray-50 text-gray-900 border border-gray-100 shadow-sm
              "
            >
              <div className="p-2 rounded-xl bg-gray-50 text-gray-500">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2v13" />
                  <path d="m16 6-4-4-4 4" />
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-bold text-sm">Share Video</div>
                <div className="text-xs opacity-70 font-medium">
                  Share link with friends
                </div>
              </div>
            </button>

            {/* Move to Collection – purple row directly under Share */}
            <button
              onClick={handle(onMoveToCollection)}
              className="
                w-full flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-[0.98]
                bg-primary-50
              "
            >
              <div className="p-2 rounded-xl bg-white/60 text-primary-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1" />
                  <path d="M2 13h10" />
                  <path d="m9 16 3-3-3-3" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-bold text-sm text-primary-700">
                  Move to Collection
                </div>
                <div className="text-xs font-medium text-primary-500">
                  Organize into a specific folder
                </div>
              </div>
            </button>

            {/* Add to Favorites */}
            <button
              onClick={handle(onAddToFavorites)}
              className="
                w-full flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-[0.98]
                bg-white hover:bg-gray-50 text-gray-900 border border-gray-100 shadow-sm
              "
            >
              <div className="p-2 rounded-xl bg-gray-50 text-gray-500">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-bold text-sm">Add to Favorites</div>
                <div className="text-xs opacity-70 font-medium">
                  Save to your favorites list
                </div>
              </div>
            </button>

            {/* Archive Video */}
            <button
              onClick={handle(onArchive)}
              className="
                w-full flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-[0.98]
                bg-white hover:bg-gray-50 text-gray-900 border border-gray-100 shadow-sm
              "
            >
              <div className="p-2 rounded-xl bg-gray-50 text-gray-500">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="20" height="5" x="2" y="3" rx="1" />
                  <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                  <path d="M10 12h4" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-bold text-sm">Archive Video</div>
                <div className="text-xs opacity-70 font-medium">
                  Hide from main gallery
                </div>
              </div>
            </button>

            {/* Manage Collections – below Archive */}
            <button
              onClick={handle(onManageCollections)}
              className="
                w-full flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-[0.98]
                bg-white hover:bg-gray-50 text-gray-900 border border-gray-100 shadow-sm
              "
            >
              <div className="p-2 rounded-xl bg-gray-50 text-gray-500">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="7" height="7" rx="1" />
                  <rect x="14" y="4" width="7" height="7" rx="1" />
                  <rect x="3" y="15" width="7" height="7" rx="1" />
                  <rect x="14" y="15" width="7" height="7" rx="1" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-bold text-sm">Manage Collections</div>
                <div className="text-xs opacity-70 font-medium">
                  Create, rename or organize folders
                </div>
              </div>
            </button>

            {/* Report Issue */}
            <button
              onClick={handle(onReport)}
              className="
                w-full flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-[0.98]
                bg-white hover:bg-gray-50 text-gray-900 border border-gray-100 shadow-sm
              "
            >
              <div className="p-2 rounded-xl bg-gray-50 text-gray-500">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-bold text-sm">Report Issue</div>
                <div className="text-xs opacity-70 font-medium">
                  Wrong metadata or content
                </div>
              </div>
            </button>

            {/* Delete Video */}
            <button
              onClick={handle(onDelete)}
              className="
                w-full flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-[0.98]
                bg-red-50 text-red-600 hover:bg-red-100
              "
            >
              <div className="p-2 rounded-xl bg-white/60 text-red-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-bold text-sm">Delete Video</div>
                <div className="text-xs opacity-70 font-medium">
                  Permanently remove from library
                </div>
              </div>
            </button>

            {/* Cancel */}
            <button
              onClick={onClose}
              className="
                w-full p-4 mt-1 rounded-2xl bg-gray-100 text-gray-500
                font-bold text-sm hover:bg-gray-200 transition-colors
              "
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
