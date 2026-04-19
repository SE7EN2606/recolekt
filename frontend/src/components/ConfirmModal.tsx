import { API_BASE } from "../utils/api";
import React, { useEffect, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = 'primary'
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = '';
      return () => clearTimeout(timer);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-200 flex items-center justify-center px-4 transition-all duration-300 ${
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div
        className={`
          relative bg-white/90 backdrop-blur-xl border border-white/40
          w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden
          transform transition-all duration-300
          ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
        `}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                variant === 'danger'
                  ? 'bg-red-100 text-red-600'
                  : 'bg-primary-100 text-primary-600'
              }`}
            >
              <AlertTriangle size={20} />
            </div>
            <button
              onClick={onClose}
              className="p-2 -mr-2 text-gray-400 hover:bg-white/50 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <h3 className="text-lg font-bold text-gray-900 mb-2 uppercase tracking-tight">
            {title}
          </h3>

          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            {message}
          </p>

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose} size="sm" className="font-bold">
              {cancelLabel}
            </Button>
            <Button
              variant={variant === 'danger' ? 'danger' : 'primary'}
              onClick={() => {
                onConfirm();
                onClose();
              }}
              size="sm"
              className="font-black px-6"
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};