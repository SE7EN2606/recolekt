import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ReelErrorStateProps {
  message: string;
  onBack: () => void;
}

export function ReelErrorState({
  message,
  onBack,
}: ReelErrorStateProps) {
  return (
    <div className="animate-fade-in relative z-0 flex min-h-[55vh] items-center justify-center px-4 pb-20 md:pb-6">
      <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white/85 p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
          <AlertCircle size={22} aria-hidden="true" />
        </div>
        <p className="text-base font-bold leading-relaxed text-gray-900">
          {message}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary-600 px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        >
          Go back to Gallery
        </button>
      </div>
    </div>
  );
}

export default ReelErrorState;
