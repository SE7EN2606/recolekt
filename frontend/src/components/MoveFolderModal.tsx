import React, { useState, useEffect } from 'react';
import { ChevronRight, LayoutGrid, FolderOpen } from 'lucide-react';

interface MoveFolderModalProps {
  isOpen:     boolean;
  folderId:   string;
  folderName: string;
  folders:    any[];
  onClose:    () => void;
  onMove:     (newParentId: string | null) => Promise<void>;
}

export const MoveFolderModal: React.FC<MoveFolderModalProps> = ({
  isOpen, folderId, folderName, folders, onClose, onMove,
}) => {
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [step,           setStep]           = useState<'pick' | 'confirm'>('pick');
  const [moving,         setMoving]         = useState(false);
  const [initialised,    setInitialised]    = useState(false);

  useEffect(() => {
    if (isOpen) { setSelectedParent(null); setStep('pick'); }
  }, [isOpen]);
  const flattenFolders = (list: any[], parentId: string | null = null): any[] => {
    const result: any[] = [];
    for (const f of list) {
      result.push({ ...f, parent_id: f.parent_id ?? parentId });
      if (f.subFolders?.length) result.push(...flattenFolders(f.subFolders, f.id));
    }
    return result;
  };
  const flatFolders = flattenFolders(folders);

  const getDescendantIds = (id: string): string[] => {
    const result: string[] = [];
    const queue = [id];
    while (queue.length) {
      const current = queue.shift()!;
      flatFolders
        .filter((f: any) => f.parent_id === current)
        .forEach((child) => { result.push(child.id); queue.push(child.id); });
    }
    return result;
  };

  const descendantIds   = getDescendantIds(folderId);
  const invalidIds      = new Set([folderId, ...descendantIds]);
  const allEligible     = flatFolders.filter((f: any) => !invalidIds.has(f.id));

  const currentFolder   = flatFolders.find((f: any) => f.id === folderId);
  const currentParentId = currentFolder?.parent_id || null;
  const hasSubFolders   = flatFolders.some((f: any) => f.parent_id === folderId);

  const selectedName = selectedParent === null
    ? 'My Library'
    : flatFolders.find((f: any) => f.id === selectedParent)?.name || '';

  const targetHasChildren = selectedParent !== null
    && flatFolders.some((f: any) => f.parent_id === selectedParent && !invalidIds.has(f.id));

  useEffect(() => {
    if (isOpen && !initialised) { setSelectedParent(currentParentId); setInitialised(true); }
    if (!isOpen) setInitialised(false);
  }, [isOpen, currentParentId, initialised]);

  const handleConfirm = async () => {
    setMoving(true);
    try { await onMove(selectedParent); onClose(); } finally { setMoving(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in">

        {step === 'pick' ? (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Move Collection</h2>
            <p className="text-sm text-gray-500 mb-5">
              Where should{' '}
              <span className="font-semibold text-gray-700">"{folderName}"</span> live?
            </p>

            <div className="flex flex-col gap-1 max-h-72 overflow-y-auto pr-1">
              <button
                onClick={() => setSelectedParent(null)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm transition-all ${
                  selectedParent === null
                    ? 'border-primary-400 bg-primary-50 text-primary-700 font-medium'
                    : 'border-gray-100 bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <LayoutGrid size={15} className={selectedParent === null ? 'text-primary-500 shrink-0' : 'text-gray-400 shrink-0'} />
                <span className="flex-1 text-left font-medium">My Library</span>
                {selectedParent === null && <div className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />}
              </button>

              {allEligible.length > 0 && (
                <p className="text-xs text-gray-400 font-medium px-1 pt-2 pb-1">
                  Or nest inside a collection:
                </p>
              )}

              {allEligible.map((f: any) => {
                const isSubFolder = !!f.parent_id;
                const parentName  = isSubFolder
                  ? flatFolders.find((p: any) => p.id === f.parent_id)?.name
                  : null;
                const isSelected  = selectedParent === f.id;
                const isCurrent   = f.id === currentParentId;
                return (
                  <button
                    key={f.id}
                    onClick={() => setSelectedParent(f.id)}
                    className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm transition-all ${
                      isSelected
                        ? 'border-primary-400 bg-primary-50 text-primary-700 font-medium'
                        : 'border-gray-100 bg-gray-50 text-gray-700 hover:bg-gray-100'
                    } ${isSubFolder ? 'ml-4' : ''}`}
                  >
                    {isSubFolder && (
                      <ChevronRight size={12} className="text-gray-300 shrink-0 -ml-1" />
                    )}
                    <FolderOpen size={14} className={isSelected ? 'text-primary-500 shrink-0' : 'text-gray-400 shrink-0'} />
                    <span className="flex-1 text-left font-medium truncate">{f.name}</span>
                    {isSubFolder && parentName && (
                      <span className="text-xs text-gray-400 shrink-0">in {parentName}</span>
                    )}
                    {isCurrent && !isSelected && (
                      <span className="text-xs text-gray-400 italic shrink-0">current</span>
                    )}
                    {isSelected && <div className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />}
                  </button>
                );
              })}

              {allEligible.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">
                  No other collections available.
                </p>
              )}
            </div>

            {targetHasChildren && selectedParent !== null && selectedParent !== currentParentId && (
              <div className="mt-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                ⚠️ This collection already has sub-collections. Yours will be nested alongside them.
              </div>
            )}
            {hasSubFolders && selectedParent !== null && selectedParent !== currentParentId && (
              <div className="mt-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                ⚠️ <strong>"{folderName}"</strong> has sub-collections — they will move with it.
              </div>
            )}

            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep('confirm')}
                disabled={selectedParent === currentParentId}
                className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-40 transition-colors"
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Confirm Move</h2>
            <p className="text-sm text-gray-600 mb-2">
              Move{' '}
              <span className="font-semibold text-gray-800">"{folderName}"</span> to{' '}
              <span className="font-semibold text-primary-600">"{selectedName}"</span>?
            </p>
            {hasSubFolders && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
                ⚠️ All sub-collections inside <strong>"{folderName}"</strong> will move with it.
              </p>
            )}
            <p className="text-xs text-gray-400 mb-5">
              This will update your library structure immediately.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setStep('pick')}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={moving}
                className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {moving ? 'Moving…' : 'Confirm Move'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
