import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, FolderOpen, CornerDownRight, Check } from 'lucide-react';
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const SYSTEM_FOLDER_IDS = new Set(['favorites', 'fav', 'default']);

  // Flattens the folder tree for the dropdown list
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
  const selectedFolder = flatFolders.find(f => f.id === targetFolderId);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      if (flatFolders.length > 0 && !targetFolderId) setTargetFolderId(flatFolders[0].id);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = 'unset';
      setIsDropdownOpen(false);
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
        
        {/* Header */}
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

        {/* Body - Modern Custom Dropdown */}
        <div className="p-5">
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`w-full flex items-center gap-3 pl-4 pr-10 py-3.5 bg-gray-50 border rounded-2xl transition-all text-left ${
                isDropdownOpen ? 'border-primary-500 ring-4 ring-primary-500/10' : 'border-gray-100 hover:border-gray-200'
              }`}
            >
              <FolderOpen size={18} className="text-primary-600 shrink-0 min-w-[18px]" />
              <span className="font-bold text-sm text-gray-900 truncate flex-1">
                {selectedFolder ? selectedFolder.name : t('modals:chooseCollection', 'Choose collection...')}
              </span>
              <ChevronDown 
                size={18} 
                className={`absolute right-4 text-gray-400 shrink-0 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} 
              />
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto py-2 animate-in fade-in zoom-in duration-200">
                {flatFolders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setTargetFolderId(f.id);
                      setIsDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-3 hover:bg-primary-50 transition-colors text-left"
                  >
                    {f.level > 0 && <CornerDownRight size={16} className="ml-2 text-gray-400 shrink-0" />}
                    <span className={`text-sm flex-1 truncate ${f.level === 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-600'}`}>
                      {f.name}
                    </span>
                    {targetFolderId === f.id && <Check size={16} className="text-primary-600 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
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