import React, { useState, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { Button } from './Button';

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
  placeholder = "Enter text...",
  confirmLabel = "Create",
  parentOptions = []
}) => {
  const [value, setValue] = useState('');
  const [parentId, setParentId] = useState('');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setValue('');
      setParentId('');
      document.body.style.overflow = 'hidden';
      // Focus input after animation
      setTimeout(() => document.getElementById('modal-input')?.focus(), 100);
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
      
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className={`bg-white w-full max-w-md rounded-2xl shadow-2xl transform transition-all duration-300 ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-900">{title}</h3>
            <button 
              onClick={onClose}
              className="p-2 -mr-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4 mb-6">
              
              {/* Location Selector */}
              {parentOptions.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Location
                  </label>
                  <div className="relative">
                    <select 
                      value={parentId}
                      onChange={(e) => setParentId(e.target.value)}
                      // 16px font size prevents iOS zoom
                      className="w-full appearance-none px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all text-gray-900 font-medium cursor-pointer text-[16px]"
                      style={{ fontSize: '16px' }} 
                    >
                      <option value="">New Main Collection</option>
                      {parentOptions.map(option => (
                        <option key={option.id} value={option.id}>Inside "{option.name}"</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Name Input */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Name
                </label>
                <input
                  id="modal-input"
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={placeholder}
                  // 16px font size prevents iOS zoom
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all text-gray-900 placeholder-gray-400 text-[16px]"
                  style={{ fontSize: '16px' }}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!value.trim()}>
                {confirmLabel}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
