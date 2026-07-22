import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';

export interface ActionItem {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'primary';
  description?: string;
}

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  actions?: ActionItem[];
  content?: React.ReactNode;
}

export const ActionSheet: React.FC<ActionSheetProps> = ({ isOpen, onClose, title, actions = [], content }) => {
  const [shouldRender, setShouldRender] = useState(false);
  const [animateOpen, setAnimateOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const originalHtmlOverflowRef = useRef('');
  const originalBodyOverflowRef = useRef('');
  const originalBodyPositionRef = useRef('');
  const originalBodyTopRef = useRef('');
  const originalBodyWidthRef = useRef('');
  const originalBodyPaddingRightRef = useRef('');
  const appRootRef = useRef<HTMLElement | null>(null);
  const originalRootInertRef = useRef(false);
  const originalRootAriaHiddenRef = useRef<string | null>(null);
  const scrollYRef = useRef(0);
  const didLockScrollRef = useRef(false);
  const didHideAppRootRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openAnimationFrameRef = useRef<number[]>([]);
  const didFocusDialogRef = useRef(false);
  const titleId = useId();
  const { t } = useTranslation(['common']);
  const dialogLabel = title || t('common:actions', 'Actions');

  const clearOpenAnimationFrame = () => {
    openAnimationFrameRef.current.forEach((frameId) => cancelAnimationFrame(frameId));
    openAnimationFrameRef.current = [];
  };

  const clearCloseTimer = () => {
    if (closeTimerRef.current === null) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const restoreFocus = () => {
    const target = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (target && document.contains(target)) {
      target.focus({ preventScroll: true });
    }
  };

  const unlockScroll = () => {
    if (!didLockScrollRef.current) return;
    document.documentElement.style.overflow = originalHtmlOverflowRef.current;
    document.body.style.paddingRight = originalBodyPaddingRightRef.current;
    document.body.style.overflow = originalBodyOverflowRef.current;
    document.body.style.position = originalBodyPositionRef.current;
    document.body.style.top = originalBodyTopRef.current;
    document.body.style.width = originalBodyWidthRef.current;
    window.scrollTo(0, scrollYRef.current);
    didLockScrollRef.current = false;
  };

  const lockScroll = () => {
    if (didLockScrollRef.current) return;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    scrollYRef.current = window.scrollY;
    originalHtmlOverflowRef.current = document.documentElement.style.overflow;
    originalBodyPaddingRightRef.current = document.body.style.paddingRight;
    originalBodyOverflowRef.current = document.body.style.overflow;
    originalBodyPositionRef.current = document.body.style.position;
    originalBodyTopRef.current = document.body.style.top;
    originalBodyWidthRef.current = document.body.style.width;
    document.documentElement.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollYRef.current}px`;
    document.body.style.width = '100%';
    didLockScrollRef.current = true;
  };

  const getAppRoot = () => {
    const root = document.getElementById('root');
    if (!root || root === document.body) return null;
    return root;
  };

  const hideAppRoot = () => {
    if (didHideAppRootRef.current) return;

    const root = getAppRoot();
    if (!root) return;

    appRootRef.current = root;
    originalRootInertRef.current = root.inert;
    originalRootAriaHiddenRef.current = root.getAttribute('aria-hidden');
    root.inert = true;
    root.setAttribute('aria-hidden', 'true');
    didHideAppRootRef.current = true;
  };

  const restoreAppRoot = () => {
    if (!didHideAppRootRef.current) return;

    const root = appRootRef.current;
    if (root && document.contains(root)) {
      root.inert = originalRootInertRef.current;
      if (originalRootAriaHiddenRef.current === null) {
        root.removeAttribute('aria-hidden');
      } else {
        root.setAttribute('aria-hidden', originalRootAriaHiddenRef.current);
      }
    }

    appRootRef.current = null;
    originalRootInertRef.current = false;
    originalRootAriaHiddenRef.current = null;
    didHideAppRootRef.current = false;
  };

  const restoreModalState = () => {
    restoreAppRoot();
    unlockScroll();
    restoreFocus();
  };

  useEffect(() => {
    if (isOpen) {
      clearCloseTimer();
      clearOpenAnimationFrame();
      didFocusDialogRef.current = false;
      setShouldRender(true);
      const firstFrame = requestAnimationFrame(() => {
        const secondFrame = requestAnimationFrame(() => setAnimateOpen(true));
        openAnimationFrameRef.current = [secondFrame];
      });
      openAnimationFrameRef.current = [firstFrame];
      restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      lockScroll();
      hideAppRoot();
    } else {
      setAnimateOpen(false);
      clearOpenAnimationFrame();
      clearCloseTimer();
      if (!didLockScrollRef.current && !didHideAppRootRef.current) {
        setShouldRender(false);
        return;
      }
      closeTimerRef.current = setTimeout(() => {
        flushSync(() => setShouldRender(false));
        restoreModalState();
        didFocusDialogRef.current = false;
        closeTimerRef.current = null;
      }, 300);
    }

    return () => {
      clearCloseTimer();
      clearOpenAnimationFrame();
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
      clearOpenAnimationFrame();
      restoreModalState();
    };
  }, []);

  useEffect(() => {
    if (!shouldRender) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const getFocusableElements = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          [
            'a[href]',
            'button:not([disabled])',
            'textarea:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
          ].join(','),
        ),
      ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');

    if (isOpen && !didFocusDialogRef.current) {
      const focusableElements = getFocusableElements();
      (focusableElements[0] || dialog).focus({ preventScroll: true });
      didFocusDialogRef.current = true;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const elements = getFocusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, shouldRender]);

  if (!shouldRender || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col justify-end items-center">
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${animateOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : dialogLabel}
        tabIndex={-1}
        className={`relative w-full md:max-w-md bg-white/95 backdrop-blur-xl rounded-t-[32px] md:rounded-b-none shadow-2xl transition-all duration-300 ease-out transform-gpu flex flex-col ${animateOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}
        style={{ maxHeight: '85vh' }}
      >
        <div className="flex-shrink-0 w-full flex justify-center pt-4 pb-2 md:hidden" onClick={onClose}>
          <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
        </div>
        <div className="flex-shrink-0 hidden md:block pt-6" />

        {title && (
          <div className="flex-shrink-0 px-6 pb-3 text-center">
            <h3 id={titleId} className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</h3>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-2">
          {content ? (
            content
          ) : (
            <div className="bg-gray-50/80 rounded-3xl overflow-hidden border border-gray-100/50">
              {actions.map((action, index) => {
                const isDanger = action.variant === 'danger';
                const isPrimary = action.variant === 'primary';
                return (
                  <button
                    key={index}
                    onClick={() => { action.onClick(); onClose(); }}
                    className={`w-full flex items-center gap-4 p-4 text-left border-b border-gray-100/50 last:border-0 transition-all duration-200 group hover:bg-white/90 hover:shadow-sm hover:backdrop-blur-md
                      ${isDanger ? 'text-red-600' : isPrimary ? 'text-primary-600' : 'text-gray-700'}`}
                  >
                    <div className={`p-2 rounded-xl transition-transform group-hover:scale-110 shadow-sm
                      ${isDanger ? 'bg-red-50 text-red-600' : isPrimary ? 'bg-primary-50 text-primary-600' : 'bg-white text-gray-500'}`}>
                      {action.icon}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-sm">{action.label}</div>
                      {action.description && <div className="text-xs text-gray-500 font-medium mt-0.5">{action.description}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

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
    </div>,
    document.body,
  );
};
