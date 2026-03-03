import { API_BASE } from "../utils/api";
import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from './Button';
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
      document.body.style.overflow = '';
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center px-4 transition-all duration-300 ${
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className={`
          bg-white/90 backdrop-blur-xl border border-white/40
          w-full max-w-sm rounded-2xl shadow-2xl relative z-10 p-6
          transition-all duration-300
          ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
        `}
      >
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          {t('modals:moveTo', `Move ${count} ${count === 1 ? 'video' : 'videos'} to...`)}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              {t('modals:selectDestination', 'Select Destination')}
            </label>
            <div className="relative">
              <select
                value={targetFolderId}
                onChange={(e) => setTargetFolderId(e.target.value)}
                className="w-full appearance-none px-4 py-3 bg-white/50 border border-white/40 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all text-gray-900 font-medium cursor-pointer backdrop-blur-sm"
              >
                {flatFolders.map(f => (
                  <option key={f.id} value={f.id}>
                    {'\u00A0'.repeat(f.level * 4) + (f.level > 0 ? '↳ ' : '') + f.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronDown size={16} className="text-gray-400" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={onClose}>
              {t('common:cancel', 'Cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => onMove(targetFolderId)}
              disabled={!targetFolderId}
            >
              {t('common:move', 'Move')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
