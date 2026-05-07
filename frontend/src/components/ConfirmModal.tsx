import React from "react";

interface ConfirmModalProps {
  open?: boolean;
  isOpen?: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  onClose?: () => void;
  danger?: boolean;
  variant?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  onClose,
  danger,
  variant,
}) => {
  const visible = open ?? isOpen ?? false;
  const handleCancel = onCancel ?? onClose ?? (() => {});
  const isDanger = danger || variant === "danger" || variant === "destructive";

  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleCancel}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              isDanger
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
export { ConfirmModal };
