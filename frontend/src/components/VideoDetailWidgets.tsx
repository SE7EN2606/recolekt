import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { PlatformButton } from '../components/CustomIcons';


export const Skeleton = () => (
  <div className="animate-pulse relative w-full px-0 pb-12">
    <div className="flex flex-col md:grid md:grid-cols-[1.5fr_1fr] md:gap-12 items-start">
      <div className="min-w-0 w-full">
        <div className="w-full aspect-[9/8] bg-gray-200/80 rounded-2xl mb-6 mt-[calc(env(safe-area-inset-top,0px)+0.75rem)] md:mt-0" />
        <div className="h-10 bg-gray-200/80 rounded-lg w-3/4 mb-4" />
      </div>
    </div>
  </div>
);


export const Accordion = ({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-5">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-gray-100 text-gray-600 rounded-md">{icon}</div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</h4>
        </div>
        <ChevronDown
          size={20}
          className={`text-gray-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </div>
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
};


export const OriginalLink = ({
  url,
  platform,
  t,
  className,
}: {
  url: string;
  platform: string;
  t: any;
  className?: string;
}) => (
  <div className={`flex flex-col gap-2 shrink-0 ${className ?? ''}`}>
    <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-widest pl-1">
      {t('videoDetail:originalLink', 'Original Link')}
    </h4>
    <PlatformButton platform={platform} url={url} t={t} />
  </div>
);