import React, { useState, useEffect } from 'react';
import { X, ChevronDown, FolderOpen } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useTranslation } from 'react-i18next';

interface MoveCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMove: (targetFolderId: string) => void;
  count?: number;
}

export const MoveCollectionModal: React.FC<MoveCollectionModalProps> = ({
  isOpen,
  onClose,
  onMove,
  count = 1
}) => {
  const { folders } = useData();
  const { t } = useTranslation(['common', 'modals']);
  const [targetFolderId, setTargetFolderId] = useState<string>('');
  const [isVisible, setIsVisible] = useState(false);

  const SYSTEM_FOLDER_IDS = new Set(['favorites', 'fav', 'default']);

  const getFlatFolders = () => {
    const flat: { id: string; name: string; level: number }[] = [];
    (folders || []).forEach((f: any) => {
      if (!SYSTEM_FOLDER_IDS.has(f.id)) {
        flat.push({ id: f.id, name: f.name, level: 0 });
        if (f.subFolders) {
          f.subFolders.forEach((sub: any) => {
            flat.push({ id: sub.id, name: sub.name, level: 1 });
          });
        }
      }
    });
    return flat;
  };

  const flatFolders = getFlatFolders();

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      if (flatFolders.length > 0) setTargetFolderId(flatFolders[0].id);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = 'unset';
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible) return null;

  return (
    <div className={`fixed inset-0 z-[200] flex items-center justify-center px-4 transition-all duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className={`
        bg-white/95 backdrop-blur-xl border border-white/40
        w-full max-w-sm rounded-2xl shadow-2xl relative z-10 flex flex-col
        transform transition-all duration-300
        ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
      `}>
        
        {/* Header - 100% Identical to Manage Modal */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-white/50 rounded-t-2xl">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              {t('modals:moveTo', `Move ${count} ${count === 1 ? 'video' : 'videos'}`)}
            </h3>
            <p className="text-gray-500 text-xs mt-0.5">{t('modals:selectDestination', 'Select a destination')}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} className="shrink-0" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-primary-600">
              <FolderOpen size={18} className="shrink-0 min-w-[18px]" />
            </div>
            <select
              value={targetFolderId}
              onChange={(e) => setTargetFolderId(e.target.value)}
              className="w-full pl-12 pr-10 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none transition-all text-gray-900 font-bold text-sm appearance-none cursor-pointer"
            >
              {flatFolders.map(f => (
                <option key={f.id} value={f.id}>
                  {'\u00A0'.repeat(f.level * 4) + (f.level > 0 ? '↳ ' : '') + f.name}
                </option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <ChevronDown size={18} className="text-gray-400 shrink-0" />
            </div>
          </div>
        </div>

        {/* ✅ FIXED: Footer buttons sync */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex justify-end gap-3 items-center">
          <button 
            onClick={onClose} 
            className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl shadow-sm hover:bg-gray-50 transition-all text-sm active:scale-95"
          >
            {t('common:cancel', 'Cancel')}
          </button>
          <button
            disabled={!targetFolderId}
            onClick={() => onMove(targetFolderId)}
            className="px-5 py-2.5 bg-primary-600 text-white font-bold rounded-xl shadow-sm hover:bg-primary-700 disabled:opacity-50 transition-all text-sm active:scale-95"
          >
            {t('common:move', 'Move')}
          </button>
        </div>

      </div>
    </div>
  );
};