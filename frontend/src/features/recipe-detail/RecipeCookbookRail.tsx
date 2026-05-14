import React from 'react';
import { ChefHat, ChevronDown, Clock3, Folder, ShoppingBasket, Sparkles, StickyNote, Tags } from 'lucide-react';
import { OriginalLink } from '../../components/VideoDetailWidgets';

export type RecipeMetaChip = {
  label: string;
  value: string;
};

export type LocalCookStatus = {
  cookedCount: number;
  lastCookedLabel: string;
  hasActiveSession?: boolean;
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
    <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.42)]">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">{icon}</div>
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
    <div className="rounded-[24px] border border-amber-100/80 bg-white p-5 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.42)]">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <StickyNote size={16} aria-hidden="true" />
        </div>
        <div>
          <div className="text-[11px] font-black text-amber-700/70 uppercase tracking-widest">
            Personal notes
          </div>
          <div className="text-xs font-medium text-gray-400">Your margin note for next time</div>
        </div>
      </div>
      <textarea
        value={note}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Add a note for next time..."
        className="min-h-[132px] w-full resize-none rounded-2xl border border-amber-100 bg-amber-50/35 px-3 py-3 text-sm font-medium leading-relaxed text-gray-800 placeholder:text-amber-700/45 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100"
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
          className="rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-[11px] font-black text-amber-800 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
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
    <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.42)]">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
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
          className="flex-1 rounded-2xl bg-gray-950 px-3 py-2.5 text-[12px] font-black text-white transition-colors hover:bg-gray-800"
        >
          {hasCooked ? 'Cook again' : 'Mark cooked'}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!hasCooked}
          className="rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-[12px] font-bold text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
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
  originalUrl,
  platform,
  t,
}: {
  note: string;
  onNoteChange: (value: string) => void;
  onNoteSave: () => void;
  noteStatus: RecipeNoteStatus;
  cookStatus: LocalCookStatus;
  onMarkCooked: () => void;
  onResetCookStatus: () => void;
  originalUrl?: string;
  platform: string;
  t: any;
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
      {originalUrl && (
        <OriginalLink url={originalUrl} platform={platform} t={t} />
      )}
    </div>
  );
}

export function SourceDetailsContent({
  caption,
  transcript,
  originalUrl,
  platform,
  t,
  showOriginalLink = true,
}: {
  caption?: string;
  transcript?: string;
  originalUrl?: string;
  platform: string;
  t: any;
  showOriginalLink?: boolean;
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

      {showOriginalLink && originalUrl && (
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
  onStartCooking,
  shoppingPlanned = false,
  shoppingSaving = false,
  onAddToShoppingList,
  onRemoveFromShoppingList,
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
  onStartCooking: () => void;
  shoppingPlanned?: boolean;
  shoppingSaving?: boolean;
  onAddToShoppingList?: () => void;
  onRemoveFromShoppingList?: () => void;
}) {
  const [sourceOpen, setSourceOpen] = React.useState(false);
  const hasSourceDetails = Boolean(caption || transcript || originalUrl);
  const tagValues = React.useMemo(() => {
    const seen = new Set<string>();
    return [folderName, ...metaChips.map((chip) => chip.value)]
      .map((value) => String(value || '').trim())
      .filter((value) => {
        if (!value || value.toLowerCase() === 'general') return false;
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [folderName, metaChips]);

  return (
    <div className="hidden md:flex flex-col w-full gap-5 mt-0">
      {originalUrl && (
        <OriginalLink url={originalUrl} platform={platform} t={t} />
      )}

      {(onAddToShoppingList || onRemoveFromShoppingList) && (
        <button
          type="button"
          onClick={shoppingPlanned ? onRemoveFromShoppingList : onAddToShoppingList}
          disabled={shoppingSaving}
          className={`group rounded-[24px] border p-4 text-left shadow-[0_18px_45px_-32px_rgba(15,23,42,0.42)] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            shoppingPlanned
              ? 'border-emerald-100 bg-emerald-50/80 hover:bg-emerald-50'
              : 'border-gray-100 bg-white hover:bg-emerald-50/50'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <ShoppingBasket size={19} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-gray-950">
                {shoppingPlanned ? 'Remove from shopping list' : 'Add ingredients to shopping list'}
              </span>
              <span className="mt-0.5 block text-xs font-medium text-gray-500">
                {shoppingPlanned ? 'This recipe is in your cooking plan.' : 'Plan this recipe and derive groceries.'}
              </span>
            </span>
          </div>
        </button>
      )}

      <button
        type="button"
        onClick={onStartCooking}
        className="group rounded-[28px] bg-emerald-600 p-5 text-left text-white shadow-[0_24px_54px_-28px_rgba(5,150,105,0.9)] transition-colors hover:bg-emerald-700"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20">
            <ChefHat size={22} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-black leading-tight">
              {cookStatus.hasActiveSession ? 'Continue Cooking' : 'Start Cooking'}
            </span>
            <span className="mt-0.5 block text-sm font-medium text-emerald-50/85">
              {cookStatus.hasActiveSession ? 'Pick up your saved cook session.' : 'Open guided Cook Mode.'}
            </span>
          </span>
        </div>
      </button>

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

      {tagValues.length > 0 && (
        <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.42)]">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Tags size={16} aria-hidden="true" />
            </span>
            <span className="text-[11px] font-black uppercase tracking-widest text-gray-400">Auto-tags</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {tagValues.map((tag) => (
              <span key={tag} className="rounded-full bg-gray-50 px-3 py-1.5 text-[12px] font-bold text-gray-600 ring-1 ring-gray-100">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasSourceDetails && (
        <div className="rounded-[24px] border border-gray-100 bg-white shadow-[0_18px_45px_-32px_rgba(15,23,42,0.42)]">
          <button
            type="button"
            onClick={() => setSourceOpen((open) => !open)}
            aria-expanded={sourceOpen}
            className="flex w-full items-center justify-between gap-3 p-5 text-left"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
                <Sparkles size={16} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-black text-gray-950">
                  {t('videoDetail:extractionDetails', 'Extraction details')}
                </span>
                <span className="mt-0.5 block text-xs font-medium text-gray-400">
                  Caption, transcript, and source context
                </span>
              </span>
            </span>
            <ChevronDown
              size={18}
              className={`shrink-0 text-gray-400 transition-transform ${sourceOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
          {sourceOpen && (
            <div className="border-t border-gray-100 p-5">
              <SourceDetailsContent
                caption={caption}
                transcript={transcript}
                originalUrl={originalUrl}
                platform={platform}
                t={t}
                showOriginalLink={false}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RecipeCookbookRail;
