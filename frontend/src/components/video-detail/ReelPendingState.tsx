import React from 'react';
import { Loader2 } from 'lucide-react';

export function ReelPendingState() {
  return (
    <section className="animate-fade-in mb-5 mt-[calc(env(safe-area-inset-top,0px)+0.75rem)] overflow-hidden rounded-[26px] border border-white/75 bg-white/90 shadow-[0_8px_28px_rgba(15,23,42,0.08)] backdrop-blur-sm md:mt-0">
      <div className="px-4 py-5 md:px-6 md:py-6">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
            <Loader2 size={20} aria-hidden="true" className="animate-spin" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-primary-600/70">
              Saved Reel
            </p>
            <h2 className="mt-1 text-[22px] font-bold tracking-tight text-slate-950">
              Loading saved reel…
            </h2>
            <p className="mt-2 max-w-[48ch] text-sm font-medium leading-6 text-slate-500">
              Pulling the final recipe detail before we render the page.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ReelPendingState;
