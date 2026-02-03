import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, parent: string | null) => void;
  existingFolders: string[];
}

export default function NewCollectionModal({
  isOpen,
  onClose,
  onCreate,
  existingFolders,
}: Props) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "auto";
  }, [isOpen]);

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999]">
      <div className="bg-white w-[90%] max-w-md rounded-2xl shadow-2xl p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Create a New Collection
        </h2>

        <label className="block text-sm font-medium text-slate-700 mb-1">
          Collection name
        </label>
        <input
          type="text"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-4
                     focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition"
          placeholder="Ex: Travel, Fitness, Recipes…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">
          Parent folder (optional)
        </label>
        <select
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-6
                     focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition"
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
            className="px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );

  // ✅ Render modal at document.body level using React Portal
  return createPortal(modalContent, document.body);
}
