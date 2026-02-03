import { useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  LayoutGrid,
  Heart,
  Folder,
  FolderPlus,
  Share2,
  Info,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

/* ------------------------------------------------------------
   SMALL LINK COMPONENT
------------------------------------------------------------ */
interface FolderLinkProps {
  to: string;
  icon?: React.ReactNode;
  label: string;
  active?: boolean;
  className?: string;
  indent?: boolean;
}

function FolderLink({ to, icon, label, active, className = "", indent = false }: FolderLinkProps) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-violet-100 text-violet-700"
          : "text-slate-700 hover:bg-slate-100"
      } ${indent ? "ml-4" : ""} ${className}`}
    >
      {icon && (
        <span className="w-4 h-4 flex items-center justify-center">{icon}</span>
      )}
      <span className="truncate">{label}</span>
    </Link>
  );
}

/* ------------------------------------------------------------
   MODAL FOR NEW COLLECTION (WITH PORTAL)
------------------------------------------------------------ */
function NewCollectionModal({
  isOpen,
  onClose,
  onCreate,
  existingFolders,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, parent: string | null) => void;
  existingFolders: string[];
}) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState<string | null>(null);

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 99999,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-[90%] max-w-md p-6 shadow-2xl"
        style={{ zIndex: 100000 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Create a New Collection
        </h2>

        <label className="block text-sm font-medium text-slate-700 mb-1">
          Collection name
        </label>
        <input
          autoFocus
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-4
                     focus:ring-2 focus:ring-violet-500 focus:border-violet-500 focus:outline-none"
          placeholder="Ex: Travel, Fitness, Recipes..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              onCreate(name.trim(), parent);
              setName("");
              setParent(null);
              onClose();
            }
          }}
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">
          Parent folder (optional)
        </label>
        <select
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-6
                     focus:ring-2 focus:ring-violet-500 focus:border-violet-500 focus:outline-none"
          value={parent ?? ""}
          onChange={(e) =>
            setParent(e.target.value === "" ? null : e.target.value)
          }
        >
          <option value="">No parent (main collection)</option>
          {existingFolders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!name.trim()) return;
              onCreate(name.trim(), parent);
              setName("");
              setParent(null);
              onClose();
            }}
            className="px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition font-medium"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

/* ------------------------------------------------------------
   SIDEBAR
------------------------------------------------------------ */
export function Sidebar() {
  const location = useLocation();
  const currentId =
    location.pathname.split("/gallery/")[1]?.split("/")[0] || "all";

  const [folders, setFolders] = useState<string[]>(() => {
    return JSON.parse(localStorage.getItem("folders") || "[]");
  });

  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const handleCreateCollection = (name: string, parent: string | null) => {
    const fullName = parent ? `${parent} / ${name}` : name;

    const updated = [...folders, fullName];
    setFolders(updated);
    localStorage.setItem("folders", JSON.stringify(updated));
  };

  // ✅ Group folders by parent/child structure
  const groupedFolders = folders.reduce((acc, folder) => {
    if (folder.includes(" / ")) {
      const [parent, child] = folder.split(" / ");
      if (!acc[parent]) acc[parent] = [];
      acc[parent].push(child);
    } else {
      if (!acc[folder]) acc[folder] = [];
    }
    return acc;
  }, {} as Record<string, string[]>);

  return (
    <>
      <aside className="w-64 bg-white border-r border-slate-200 pt-5 px-4 hidden md:block sticky top-[100px] h-[calc(100vh-100px)] overflow-y-auto">
        {/* === Add New Collection Button === */}
        <div className="mb-6">
          <button
            onClick={() => setShowModal(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-semibold shadow-sm transition-all"
          >
            <FolderPlus className="w-5 h-5" />
            Add New Collection
          </button>
        </div>

        {/* === My Collections === */}
        <div className="mb-6">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-3">
            My Collections
          </div>

          <nav className="space-y-[2px]">
            <FolderLink
              to="/gallery/all"
              label="All my videos"
              icon={<LayoutGrid className="w-4 h-4" />}
              active={currentId === "all"}
            />

            <FolderLink
              to="/gallery/favorites"
              label="Favorites"
              icon={<Heart className="w-4 h-4 text-[#e63946]" />}
              active={currentId === "favorites"}
            />

            {/* Expandable custom collections */}
            <div className="mt-1">
              <button
                onClick={() => setCollectionsOpen(!collectionsOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 w-full text-left"
              >
                <Folder className="w-4 h-4 text-slate-600" />
                <span className="flex-1">Custom Collections</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${
                    !collectionsOpen ? "-rotate-90" : ""
                  }`}
                />
              </button>

              {collectionsOpen && (
                <div className="mt-1 space-y-1">
                  {Object.entries(groupedFolders).map(([parent, children]) => {
                    const parentId = parent.toLowerCase().replace(/\s+/g, "-");
                    const hasChildren = children.length > 0;

                    return (
                      <div key={parent}>
                        {/* Parent Folder */}
                        <FolderLink
                          to={`/gallery/${parentId}`}
                          label={parent}
                          icon={<Folder className="w-4 h-4 text-slate-500" />}
                          active={currentId === parentId}
                        />

                        {/* Child Folders */}
                        {hasChildren && (
                          <div className="ml-3 border-slate-200 pl-0 space-y-[2px] mt-0">
                            {children.map((child) => {
                              const childId = `${parent}-${child}`
                                .toLowerCase()
                                .replace(/\s+/g, "-");
                              return (
                                <FolderLink
                                  key={childId}
                                  to={`/gallery/${childId}`}
                                  label={child}
                                  icon={<Folder className="w-4 h-4 text-slate-400" />}
                                  active={currentId === childId}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Shared With Me */}
            <FolderLink
              to="/gallery/shared"
              label="Shared with Me"
              icon={<Share2 className="w-4 h-4 text-slate-600" />}
              active={currentId === "shared"}
              className="mt-1"
            />
          </nav>
        </div>

        {/* === Team Collections === */}
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-3">
            Team Collections
          </div>
          <nav className="space-y-[2px]">
            <FolderLink
              to="/gallery/archive"
              label="Archive"
              icon={<Info className="w-4 h-4 text-slate-600" />}
              active={currentId === "archive"}
            />
          </nav>
        </div>
      </aside>

      {/* Modal rendered OUTSIDE sidebar using Portal */}
      <NewCollectionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreate={handleCreateCollection}
        existingFolders={folders}
      />
    </>
  );
}
