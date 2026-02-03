import { X, Folder, FolderPlus, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

interface FolderItem {
  id: string;
  name: string;
  children?: FolderItem[];
  count: number;
}

const mockFolders: FolderItem[] = [
  {
    id: "all",
    name: "All videos",
    count: 45,
  },
  {
    id: "favorites",
    name: "⭐ Favorite folder",
    count: 8,
  },
  {
    id: "my-collections",
    name: "My Collections",
    count: 37,
    children: [
      {
        id: "cooking",
        name: "Cooking & Recipes",
        count: 12,
        children: [
          { id: "cooking-desserts", name: "Desserts", count: 4 },
          { id: "cooking-pasta", name: "Pasta Dishes", count: 3 },
        ],
      },
      {
        id: "travel",
        name: "Travel Inspiration",
        count: 8,
        children: [
          { id: "travel-beaches", name: "Beaches", count: 3 },
          { id: "travel-cities", name: "Cities", count: 5 },
        ],
      },
      {
        id: "fitness",
        name: "Fitness & Wellness",
        count: 15,
      },
      {
        id: "fashion",
        name: "Fashion & Style",
        count: 2,
        children: [
          { id: "fashion-outfits", name: "Outfit Ideas", count: 10 },
          { id: "fashion-hauls", name: "Hauls", count: 8 },
          { id: "fashion-tutorials", name: "Tutorials", count: 6 },
        ],
      },
    ],
  },
];

interface MobileMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function FolderTreeItemMobile({
  folder,
  level = 0,
  onFolderClick,
  isCollectionFolder = false,
}: {
  folder: FolderItem;
  level?: number;
  onFolderClick?: () => void;
  isCollectionFolder?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(
    isCollectionFolder || folder.id === "my-collections"
  );
  const hasChildren = folder.children && folder.children.length > 0;

  return (
    <div>
      <Link
        to={`/gallery/${folder.id}`}
        onClick={onFolderClick}
        className="flex items-center gap-3 px-4 py-3 text-slate-700 hover:bg-slate-100 transition-colors"
        style={{ paddingLeft: `${16 + level * 16}px` }}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.preventDefault();
              setIsOpen(!isOpen);
            }}
            className="p-0"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${
                !isOpen ? "-rotate-90" : ""
              }`}
            />
          </button>
        )}
        {!hasChildren && <div className="w-4" />}
        <Folder className="w-4 h-4" />
        <span className="flex-1 truncate text-sm font-medium">
          {folder.name}
        </span>
        {folder.id !== "my-collections" && (
          <span className="text-xs text-slate-500">{folder.count}</span>
        )}
      </Link>

      {hasChildren && isOpen && (
        <div>
          {folder.children.map((child) => (
            <FolderTreeItemMobile
              key={child.id}
              folder={child}
              level={level + 1}
              onFolderClick={onFolderClick}
              isCollectionFolder={true}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MobileMenuDrawer({ isOpen, onClose }: MobileMenuDrawerProps) {
  // Lock body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`
          fixed top-0 left-0 w-72 h-screen bg-white z-50 
          transform transition-transform duration-300 overflow-y-auto 
          md:hidden
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Header */}
        <div className="sticky top-0 p-4 border-b border-slate-200 flex items-center justify-between bg-white z-10">
          <h3 className="font-bold text-slate-900">Collections</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Folder Button */}
        <div className="p-4">
          <button className="w-full flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg font-medium hover:shadow-lg transition-all">
            <FolderPlus className="w-5 h-5" />
            New folder
          </button>
        </div>

        {/* Folder Tree */}
        <div className="px-2 pb-6">
          {mockFolders.map((folder) => (
            <FolderTreeItemMobile
              key={folder.id}
              folder={folder}
              onFolderClick={onClose}
            />
          ))}
        </div>
      </div>
    </>
  );
}