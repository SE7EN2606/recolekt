import React from 'react';
import { X } from 'lucide-react';

export interface ActionItem {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'danger';
  description?: string;
}

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  actions: ActionItem[];
}

export const ActionSheet: React.FC<ActionSheetProps> = ({ isOpen, onClose, title, actions }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center sm:items-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-white w-full max-w-sm rounded-t-[32px] sm:rounded-[32px] shadow-2xl relative z-10 overflow-hidden animate-slide-up sm:animate-scale-in">
        {title && (
          <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
            <span className="font-bold text-gray-900">{title}</span>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
              <X size={20} className="text-gray-400" />
            </button>
          </div>
        )}
        <div className="p-2">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => { action.onClick(); onClose(); }}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-colors hover:bg-gray-50 text-left ${action.variant === 'danger' ? 'text-red-600' : 'text-gray-700'}`}
            >
              <div className={`p-2 rounded-xl ${action.variant === 'danger' ? 'bg-red-50' : 'bg-gray-100'}`}>
                <action.icon size={20} />
              </div>
              <div>
                <div className="font-bold text-sm">{action.label}</div>
                {action.description && <div className="text-xs text-gray-400">{action.description}</div>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};