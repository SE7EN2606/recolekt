import { API_BASE } from "../utils/api";
import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, AlertTriangle, LayoutGrid, Folders } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';

interface InputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string, parentId?: string) => Promise<void> | void;
  title: string;
  placeholder?: string;
  confirmLabel?: string;
  parentOptions?: { id: string; name: string }[];
}

// ✅ Modern dropdown — renders via portal to escape any stacking context
const ParentDropdown: React.FC<{
  value: string;
  onChange: (val: string) => void;
  options: { id: string; name: string }[];
}> = ({ value, onChange, options }) => {
  const { t } = useTranslation(['modals']);
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }
    setIsOpen(p => !p);
  };

  const selectedLabel = value
    ? `Dans "${options.find(o => o.id === value)?.name}"`
    : t('modals:noParent', 'Aucun parent (niveau principal)');

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-white/50 border border-white/40 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all text-gray-900 font-medium cursor-pointer backdrop-blur-sm hover:bg-white/80"
        style={{ fontSize: '16px' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {value ? <Folders size={16} className="text-primary-600 shrink-0" /> : <LayoutGrid size={16} className="text-primary-600 shrink-0" />}
          <span className="truncate">{selectedLabel}</span>
        </div>
        <ChevronDown size={16} className={`ml-2 flex-shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] bg-white border border-gray-100 rounded-xl shadow-xl py-1.5 max-h-72 overflow-y-auto"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          {/* Top level option */}
          <button
            type="button"
            onClick={() => { onChange(''); setIsOpen(false); }}
            className={`w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm transition-colors
              ${!value ? 'bg-primary-50 text-primary-900 font-bold' : 'text-gray-700 hover:bg-primary-50 hover:text-primary-900 font-medium'}
            `}
          >
            <LayoutGrid size={16} className="text-primary-600 shrink-0" />
            <span className="truncate">{t('modals:noParent', 'Aucun parent (niveau principal)')}</span>
          </button>

          {options.length > 0 && <div className="h-px bg-gray-100 my-1.5 mx-2" />}

          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => { onChange(opt.id); setIsOpen(false); }}
              className={`w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm transition-colors
                ${value === opt.id ? 'bg-primary-50 text-primary-900 font-bold' : 'text-gray-700 hover:bg-primary-50 hover:text-primary-900 font-medium'}
              `}
            >
              <Folders size={16} className="text-primary-600 shrink-0" />
              <span className="truncate">Dans "{opt.name}"</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
};

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const displayPlaceholder = placeholder || t('modals:collectionNamePlaceholder', 'Nom de la collection...');
  const displayConfirmLabel = confirmLabel || t('common:save', 'Enregistrer');

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setValue('');
      setParentId('');
      setActionError(null);
      document.body.style.overflow = 'hidden';
      setTimeout(() => document.getElementById('collection-input-field')?.focus(), 100);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = 'unset';
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await onSubmit(value, parentId || undefined);
      onClose();
    } catch (error: any) {
      setActionError(t('modals:folderExists', { name: value.trim(), defaultValue: `A folder named '${value.trim()}' already exists here.` }));
    } finally {
      setIsSubmitting(false);
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
                  {/* ✅ Modern dropdown replaces native <select> */}
                  <ParentDropdown
                    value={parentId}
                    onChange={(val) => { setParentId(val); setActionError(null); }}
                    options={parentOptions}
                  />
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
                  onChange={(e) => { setValue(e.target.value); setActionError(null); }}
                  placeholder={displayPlaceholder}
                  className={`w-full px-4 py-3 bg-white/50 border rounded-xl focus:bg-white focus:ring-2 outline-none transition-all text-gray-900 placeholder-gray-400 backdrop-blur-sm ${
                    actionError ? 'border-red-400 focus:ring-red-500 focus:border-transparent' : 'border-white/40 focus:ring-primary-500 focus:border-transparent'
                  }`}
                  style={{ fontSize: '16px' }}
                />
                {actionError && (
                  <div className="flex items-center gap-1.5 text-red-500 text-xs font-bold mt-2 animate-fade-in">
                    <AlertTriangle size={14} />
                    <span>{actionError}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} disabled={isSubmitting} className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl shadow-sm hover:bg-gray-50 transition-all text-sm active:scale-95 disabled:opacity-50">
                {t('common:cancel', 'Annuler')}
              </button>
              <button type="submit" disabled={!value.trim() || isSubmitting} className="px-5 py-2.5 bg-primary-600 border border-transparent text-white font-bold rounded-xl shadow-sm hover:bg-primary-700 hover:shadow-lg hover:shadow-primary-500/20 transition-all text-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                {isSubmitting ? '...' : displayConfirmLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
