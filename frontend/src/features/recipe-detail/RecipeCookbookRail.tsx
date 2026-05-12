import React from 'react';
import { AlignLeft, BookOpen, Clock3, Folder, StickyNote } from 'lucide-react';
import { Accordion, OriginalLink } from '../../components/VideoDetailWidgets';

export type RecipeMetaChip = {
  label: string;
  value: string;
};

export type LocalCookStatus = {
  cookedCount: number;
  lastCookedLabel: string;
};

export type RecipeNoteStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

function RecipeRailCard({
  icon,
  label,
  title,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 bg-stone-100 text-gray-700 rounded-md">{icon}</div>
        <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
          {label}
        </span>
      </div>
      <div className="text-base font-black text-gray-900 leading-snug">{title}</div>
      {children && <div className="mt-2 text-sm text-gray-500 leading-relaxed">{children}</div>}
    </div>
  );
}

export function RecipeNotesCard({
  note,
  onChange,
  onSave,
  status,
}: {
  note: string;
  onChange: (value: string) => void;
  onSave: () => void;
  status: RecipeNoteStatus;
}) {
  const statusLabel =
    status === 'loading'
      ? 'Loading note...'
      : status === 'saving'
        ? 'Saving...'
        : status === 'saved'
          ? 'Saved'
          : status === 'error'
            ? 'Could not save'
            : 'Saved automatically';

  return (
    <div className="bg-amber-50/70 border border-amber-100 rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 bg-white/80 text-amber-700 rounded-md">
          <StickyNote size={16} aria-hidden="true" />
        </div>
        <span className="text-[11px] font-black text-amber-700/70 uppercase tracking-widest">
          Personal notes
        </span>
      </div>
      <textarea
        value={note}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Add a note for next time..."
        className="min-h-[132px] w-full resize-none rounded-xl border border-amber-100 bg-white/80 px-3 py-3 text-sm font-medium leading-relaxed text-gray-800 placeholder:text-amber-700/45 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <div
          className={`text-[11px] font-medium ${
            status === 'error' ? 'text-rose-600' : 'text-amber-800/50'
          }`}
        >
          {statusLabel}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={status === 'loading'}
          className="rounded-lg border border-amber-200 bg-white/80 px-3 py-1.5 text-[11px] font-black text-amber-800 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}

export function RecipeCookStatusCard({
  status,
  onMarkCooked,
  onReset,
}: {
  status: LocalCookStatus;
  onMarkCooked: () => void;
  onReset: () => void;
}) {
  const hasCooked = status.cookedCount > 0;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 bg-stone-100 text-gray-700 rounded-md">
          <Clock3 size={16} aria-hidden="true" />
        </div>
        <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
          Cook status
        </span>
      </div>

      <div className="text-base font-black text-gray-900 leading-snug">
        {hasCooked ? `Cooked ${status.cookedCount}×` : 'Not cooked yet'}
      </div>
      <div className="mt-2 text-sm text-gray-500 leading-relaxed">
        {hasCooked
          ? `Last cooked ${status.lastCookedLabel || 'today'}`
          : 'Track this when you make it.'}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onMarkCooked}
          className="flex-1 rounded-xl bg-gray-950 px-3 py-2.5 text-[12px] font-black text-white transition-colors hover:bg-gray-800"
        >
          {hasCooked ? 'Cook again' : 'Mark cooked'}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!hasCooked}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[12px] font-bold text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export function RecipeMobileStateSection({
  note,
  onNoteChange,
  onNoteSave,
  noteStatus,
  cookStatus,
  onMarkCooked,
  onResetCookStatus,
}: {
  note: string;
  onNoteChange: (value: string) => void;
  onNoteSave: () => void;
  noteStatus: RecipeNoteStatus;
  cookStatus: LocalCookStatus;
  onMarkCooked: () => void;
  onResetCookStatus: () => void;
}) {
  return (
    <div className="md:hidden mb-5 space-y-4">
      <RecipeCookStatusCard
        status={cookStatus}
        onMarkCooked={onMarkCooked}
        onReset={onResetCookStatus}
      />
      <RecipeNotesCard
        note={note}
        onChange={onNoteChange}
        onSave={onNoteSave}
        status={noteStatus}
      />
    </div>
  );
}

export function SourceDetailsContent({
  caption,
  transcript,
  originalUrl,
  platform,
  t,
}: {
  caption?: string;
  transcript?: string;
  originalUrl?: string;
  platform: string;
  t: any;
}) {
  return (
    <div className="space-y-5">
      {caption && (
        <div>
          <h4 className="mb-2 text-[11px] font-black uppercase tracking-widest text-gray-400">
            {t('videoDetail:caption', 'Caption')}
          </h4>
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {caption}
          </div>
        </div>
      )}

      {transcript && (
        <div>
          <h4 className="mb-2 text-[11px] font-black uppercase tracking-widest text-gray-400">
            {t('videoDetail:transcript', 'Transcript')}
          </h4>
          <div className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap font-medium italic border-l-2 border-gray-100 pl-4">
            {transcript}
          </div>
        </div>
      )}

      {originalUrl && (
        <OriginalLink url={originalUrl} platform={platform} t={t} />
      )}
    </div>
  );
}

export function RecipeCookbookRail({
  folderName,
  metaChips,
  caption,
  transcript,
  originalUrl,
  platform,
  t,
  note,
  onNoteChange,
  onNoteSave,
  noteStatus,
  cookStatus,
  onMarkCooked,
  onResetCookStatus,
}: {
  folderName: string | null;
  metaChips: RecipeMetaChip[];
  caption?: string;
  transcript?: string;
  originalUrl?: string;
  platform: string;
  t: any;
  note: string;
  onNoteChange: (value: string) => void;
  onNoteSave: () => void;
  noteStatus: RecipeNoteStatus;
  cookStatus: LocalCookStatus;
  onMarkCooked: () => void;
  onResetCookStatus: () => void;
}) {
  const category = metaChips.find((chip) => chip.label === 'Category')?.value;
  const topic = metaChips.find((chip) => chip.label === 'Topic')?.value;
  const hasSourceDetails = Boolean(caption || transcript || originalUrl);
  const contextItems = [category, topic].filter(Boolean);

  return (
    <div className="hidden md:flex flex-col w-full gap-5 mt-0">
      <RecipeRailCard
        icon={<Folder size={16} aria-hidden="true" />}
        label="Collection"
        title={folderName || 'Unsorted'}
      />

      <RecipeCookStatusCard
        status={cookStatus}
        onMarkCooked={onMarkCooked}
        onReset={onResetCookStatus}
      />

      <RecipeNotesCard
        note={note}
        onChange={onNoteChange}
        onSave={onNoteSave}
        status={noteStatus}
      />

      {originalUrl && (
        <OriginalLink url={originalUrl} platform={platform} t={t} />
      )}

      {hasSourceDetails && (
        <Accordion
          icon={<AlignLeft size={16} />}
          label={t('videoDetail:sourceDetails', 'Source details')}
        >
          <SourceDetailsContent
            caption={caption}
            transcript={transcript}
            platform={platform}
            t={t}
          />
        </Accordion>
      )}

      {contextItems.length > 0 && (
        <RecipeRailCard
          icon={<BookOpen size={16} aria-hidden="true" />}
          label="Recipe context"
          title={contextItems.join(' · ')}
        >
          Category and topic are kept low-priority for organizing, not cooking.
        </RecipeRailCard>
      )}
    </div>
  );
}

export default RecipeCookbookRail;
