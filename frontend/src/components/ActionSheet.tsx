import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface ActionItem {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'primary';
  description?: string;
}

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  actions: ActionItem[];
}

export const ActionSheet: React.FC<ActionSheetProps> = ({ isOpen, onClose, title, actions }) => {
  const [shouldRender, setShouldRender] = useState(false);
  const [animateOpen, setAnimateOpen] = useState(false);
  const { t } = useTranslation(['common']);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimateOpen(true)));
      
      // ✅ Prevent Scroll Jump by filling in the missing scrollbar width
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
      document.body.style.overflow = 'hidden';
    } else {
      setAnimateOpen(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
        document.body.style.paddingRight = '';
        document.body.style.overflow = '';
      }, 300);
      return () => clearTimeout(timer);
    }
    return () => {
      document.body.style.paddingRight = '';
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    // justify-end forces it to the bottom, items-center centers it horizontally on desktop
    <div className="fixed inset-0 z-[200] flex flex-col justify-end items-center">
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${animateOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      
      {/* Sheet / Modal */}
      <div 
        className={`relative w-full md:max-w-md bg-white/95 backdrop-blur-xl rounded-t-[32px] md:rounded-b-none shadow-2xl transition-all duration-300 ease-out transform-gpu flex flex-col
        ${animateOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}
        style={{ maxHeight: '85vh' }}
      >
        {/* Handle (Mobile only) */}
        <div className="flex-shrink-0 w-full flex justify-center pt-4 pb-2 md:hidden" onClick={onClose}>
          <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
        </div>

        {/* Spacing for Desktop */}
        <div className="flex-shrink-0 hidden md:block pt-6" />

        {title && (
          <div className="flex-shrink-0 px-6 pb-3 text-center">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</h3>
          </div>
        )}

        {/* Scrollable Actions List */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-2">
          <div className="bg-gray-50/80 rounded-3xl overflow-hidden border border-gray-100/50">
            {actions.map((action, index) => {
              const Icon = action.icon;
              const isDanger = action.variant === 'danger';
              const isPrimary = action.variant === 'primary';
              
              return (
                <button
                  key={index}
                  onClick={() => { action.onClick(); onClose(); }}
                  className={`w-full flex items-center gap-4 p-4 text-left border-b border-gray-100/50 last:border-0 transition-all duration-200 group
                    hover:bg-white/90 hover:shadow-sm hover:backdrop-blur-md
                    ${isDanger ? 'text-red-600' : isPrimary ? 'text-primary-600' : 'text-gray-700'}`}
                >
                  <div className={`p-2 rounded-xl transition-transform group-hover:scale-110 shadow-sm
                    ${isDanger ? 'bg-red-50 text-red-600' : isPrimary ? 'bg-primary-50 text-primary-600' : 'bg-white text-gray-500'}`}>
                    <Icon size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-sm">{action.label}</div>
                    {action.description && <div className="text-xs text-gray-500 font-medium mt-0.5">{action.description}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Fixed Cancel Button stuck to the bottom */}
        <div 
          className="flex-shrink-0 px-4 pt-3 bg-white/90 border-t border-gray-100 shadow-[0_-8px_15px_-5px_rgba(0,0,0,0.05)] relative z-10"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
        >
          <button 
            onClick={onClose}
            className="w-full p-4 bg-gray-50/80 border border-gray-200/80 rounded-2xl text-sm font-bold text-gray-700 hover:bg-white hover:shadow-md hover:text-gray-900 transition-all duration-200 active:scale-95"
          >
            {t('common:cancel', 'Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};