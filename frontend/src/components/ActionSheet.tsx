import React from 'react';
import { useTranslation } from 'react-i18next';
import { LucideIcon } from 'lucide-react';

interface Action {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'primary';
}

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  actions: Action[];
}

const ActionSheet: React.FC<ActionSheetProps> = ({ isOpen, onClose, title, actions }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Sheet Container */}
      <div className="relative w-full md:max-w-md bg-white/90 backdrop-blur-xl rounded-t-[32px] 
                      /* Remove bottom rounding on desktop */
                      md:rounded-b-none 
                      shadow-2xl transition-all duration-300 ease-out transform-gpu flex flex-col
                      translate-y-0 opacity-100" 
           style={{ maxHeight: '85vh' }}>
        
        {/* Mobile Handle */}
        <div className="flex-shrink-0 w-full flex justify-center pt-4 pb-2 md:hidden">
          <div className="w-12 h-1.5 bg-gray-300/50 rounded-full"></div>
        </div>

        {/* Desktop Spacer - ensures it touches the bottom */}
        <div className="flex-shrink-0 hidden md:block pt-6"></div>

        {title && (
          <div className="flex-shrink-0 px-6 pb-3 text-center">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</h3>
          </div>
        )}

        {/* Actions List */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-2">
          <div className="bg-gray-100/50 rounded-3xl overflow-hidden border border-white/20">
            {actions.map((action, idx) => (
              <button
                key={idx}
                onClick={() => { action.onClick(); onClose(); }}
                className={`w-full flex items-center gap-4 p-4 text-left border-b border-gray-100/50 last:border-0 
                           transition-all duration-200 group
                           /* High Contrast Glass Hover */
                           hover:bg-white/60 hover:backdrop-blur-md hover:shadow-inner
                           ${action.variant === 'danger' ? 'text-red-600' : 'text-gray-700'}`}
              >
                <div className={`p-2 rounded-xl shadow-sm transition-transform group-hover:scale-110 
                                ${action.variant === 'primary' ? 'bg-primary-50 text-primary-600' : 'bg-white text-gray-500'}`}>
                  <action.icon size={20} />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-sm">{action.label}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Cancel Button Section */}
        <div className="flex-shrink-0 px-4 pt-3 pb-6 bg-white/80 border-t border-gray-100 relative z-10"
             style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
          <button 
            onClick={onClose}
            className="w-full p-4 bg-gray-100/80 border border-gray-200 rounded-2xl text-sm font-bold text-gray-700 
                       /* Match Burger Menu Glass Hover */
                       hover:bg-white hover:border-white hover:shadow-lg hover:text-gray-900 
                       transition-all duration-200 active:scale-95"
          >
            {t('videoDetail:cancel', 'Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActionSheet;