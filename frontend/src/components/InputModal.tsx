import { API_BASE } from "../utils/api";
import React, { useState, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface InputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string, parentId?: string) => void;
  title: string;
  placeholder?: string;
  confirmLabel?: string;
  parentOptions?: { id: string; name: string }[];
}

export const InputModal: React.FC<InputModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  title,
  placeholder,
  confirmLabel,
  parentOptions = []
}) => {
  const { t } = useTranslation(['common', 'modals']);
  const [value, setValue] = useState('');
  const [parentId, setParentId] = useState('');
  const [isVisible, setIsVisible] = useState(false);

  // ✅ Uses keys from your provided JSON
  const displayPlaceholder = placeholder || t('modals:collectionNamePlaceholder', 'Nom de la collection...');
  const displayConfirmLabel = confirmLabel || t('common:save', 'Enregistrer');

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setValue('');
      setParentId('');
      document.body.style.overflow = 'hidden';
      setTimeout(() => document.getElementById('collection-input-field')?.focus(), 100);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = 'unset';
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value, parentId || undefined);
      onClose();
    }
  };

  if (!isVisible) return null;

  return (
    <div className={`fixed inset-0 z-[200] flex items-center justify-center px-4 transition-all duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className={`relative bg-white/90 backdrop-blur-xl border border-white/40 w-full max-w-md rounded-2xl shadow-2xl transform transition-all duration-300 ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-900">{title}</h3>
            <button onClick={onClose} className="p-2 -mr-2 text-gray-400 hover:bg-white/50 rounded-full transition-colors">
              <X size={20} className="shrink-0" />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4 mb-6">
              {parentOptions.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    {t('modals:parentCollection', 'Collection parente')}
                  </label>
                  <div className="relative">
                    <select
                      value={parentId}
                      onChange={(e) => setParentId(e.target.value)}
                      className="w-full appearance-none px-4 py-3 bg-white/50 border border-white/40 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all text-gray-900 font-medium cursor-pointer backdrop-blur-sm"
                      style={{ fontSize: '16px' }}
                    >
                      <option value="">{t('modals:noParent', 'Aucun parent (niveau principal)')}</option>
                      {parentOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {/* Note: "Inside" isn't in your JSON, using French directly for clarity */}
                          Dans "{opt.name}"
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none shrink-0" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  {t('common:name', 'Nom')}
                </label>
                <input
                  id="collection-input-field" 
                  name="collection-title-generic" 
                  autoComplete="off" 
                  data-1p-ignore="true"
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={displayPlaceholder}
                  className="w-full px-4 py-3 bg-white/50 border border-white/40 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all text-gray-900 placeholder-gray-400 backdrop-blur-sm"
                  style={{ fontSize: '16px' }}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button 
                type="button" 
                onClick={onClose}
                className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl shadow-sm hover:bg-gray-50 transition-all text-sm active:scale-95"
              >
                {t('common:cancel', 'Annuler')}
              </button>
              <button 
                type="submit" 
                disabled={!value.trim()}
                className="px-5 py-2.5 bg-primary-600 border border-transparent text-white font-bold rounded-xl shadow-sm hover:bg-primary-700 hover:shadow-lg hover:shadow-primary-500/20 transition-all text-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {displayConfirmLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};