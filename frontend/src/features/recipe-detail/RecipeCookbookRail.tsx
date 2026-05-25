import React from 'react';
import { AlignLeft, ChefHat, ChevronDown, Clock3, Folder, ShoppingBasket, StickyNote } from 'lucide-react';
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
  onDelete,
  status,
  focusSignal = 0,
}: {
  note: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  status: RecipeNoteStatus;
  focusSignal?: number;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [isWriting, setIsWriting] = React.useState(false);
  const hasNote = note.trim().length > 0;
  const showEmptyState = !hasNote && !isWriting;

  const activateNote = React.useCallback(() => {
    setIsWriting(true);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, []);

  React.useEffect(() => {
    if (focusSignal <= 0) return;
    if (status === 'loading') return;

    setIsWriting(true);
    window.requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container || container.getClientRects().length === 0) return;

      container.scrollIntoView({ behavior: 'smooth', block: 'center' });
      textareaRef.current?.focus();
    });
  }, [focusSignal, status]);

  if (status === 'loading') {
    return (
      <div id="recipe-notes" className="scroll-mt-24 rounded-[24px] border border-amber-100/80 bg-white p-5 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.42)]">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-8 w-8 animate-pulse rounded-xl bg-amber-50" />
          <div className="space-y-1.5">
            <div className="h-3 w-24 animate-pulse rounded-full bg-amber-100" />
            <div className="h-3 w-36 animate-pulse rounded-full bg-gray-100" />
          </div>
        </div>
        <div className="h-[132px] animate-pulse rounded-2xl bg-amber-50/55" />
      </div>
    );
  }

  const statusLabel =
    status === 'saving'
        ? 'Saving...'
        : status === 'saved'
          ? 'Saved'
          : status === 'error'
            ? 'Could not save'
            : 'Saved automatically';

  return (
    <div ref={containerRef} id="recipe-notes" className="scroll-mt-24 rounded-[24px] border border-amber-100/80 bg-white p-5 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.42)]">
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
      {showEmptyState && (
        <div className="mb-3 rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 px-3 py-3">
          <div className="text-sm font-black text-gray-800">No personal notes yet</div>
          <div className="mt-1 text-xs font-medium leading-relaxed text-gray-500">
            Capture substitutions, timing tweaks, mistakes, serving feedback, or what to improve next time.
          </div>
          <button
            type="button"
            onClick={activateNote}
            className="mt-2 rounded-xl bg-white px-3 py-1.5 text-[11px] font-black text-amber-800 ring-1 ring-amber-100 transition-colors hover:bg-amber-50"
          >
            Add note
          </button>
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={note}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setIsWriting(true)}
        placeholder="Substitutions, timing tweaks, mistakes, serving feedback..."
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
        <div className="flex items-center gap-2">
          {hasNote && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-black text-gray-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            className="rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-[11px] font-black text-amber-800 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function RecipeCookStatusCard({
  status,
  loading = false,
  onMarkCooked,
  onReset,
}: {
  status: LocalCookStatus;
  loading?: boolean;
  onMarkCooked: () => void;
  onReset: () => void;
}) {
  const hasCooked = status.cookedCount > 0;

  if (loading) {
    return (
      <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.42)]">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-8 w-8 animate-pulse rounded-xl bg-emerald-50" />
          <div className="h-3 w-24 animate-pulse rounded-full bg-gray-100" />
        </div>
        <div className="h-5 w-32 animate-pulse rounded-full bg-gray-100" />
        <div className="mt-3 h-4 w-44 animate-pulse rounded-full bg-gray-100" />
        <div className="mt-4 h-10 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

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
  onNoteDelete,
  noteFocusSignal,
  noteStatus,
  cookStatus,
  cookStatusLoading = false,
  onMarkCooked,
  onResetCookStatus,
  t,
}: {
  note: string;
  onNoteChange: (value: string) => void;
  onNoteSave: () => void;
  onNoteDelete: () => void;
  noteFocusSignal?: number;
  noteStatus: RecipeNoteStatus;
  cookStatus: LocalCookStatus;
  cookStatusLoading?: boolean;
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
        loading={cookStatusLoading}
        onMarkCooked={onMarkCooked}
        onReset={onResetCookStatus}
      />
      <RecipeNotesCard
        note={note}
        onChange={onNoteChange}
        onSave={onNoteSave}
        onDelete={onNoteDelete}
        focusSignal={noteFocusSignal}
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
  showOriginalLink = true,
  tags = [],
}: {
  caption?: string;
  transcript?: string;
  originalUrl?: string;
  platform: string;
  t: any;
  showOriginalLink?: boolean;
  tags?: string[];
}) {
  const safeTags = React.useMemo(() => {
    const seen = new Set<string>();
    return tags
      .map((tag) => String(tag || '').replace(/^#/, '').trim())
      .filter((tag) => {
        if (!tag) return false;
        const key = tag.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [tags]);

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

      {safeTags.length > 0 && (
        <div>
          <h4 className="mb-2 text-[11px] font-black uppercase tracking-widest text-gray-400">
            Tags
          </h4>
          <div className="flex flex-wrap gap-2">
            {safeTags.map((tag) => (
              <span key={tag} className="rounded-full bg-gray-50 px-3 py-1.5 text-[12px] font-bold text-gray-600 ring-1 ring-gray-100">
                {tag}
              </span>
            ))}
          </div>
        </div>
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
  onNoteDelete,
  noteFocusSignal,
  noteStatus,
  cookStatus,
  cookStatusLoading = false,
  onMarkCooked,
  onResetCookStatus,
  onStartCooking,
  shoppingPlanned = false,
  shoppingLoading = false,
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
  onNoteDelete: () => void;
  noteFocusSignal?: number;
  noteStatus: RecipeNoteStatus;
  cookStatus: LocalCookStatus;
  cookStatusLoading?: boolean;
  onMarkCooked: () => void;
  onResetCookStatus: () => void;
  onStartCooking: () => void;
  shoppingPlanned?: boolean;
  shoppingLoading?: boolean;
  shoppingSaving?: boolean;
  onAddToShoppingList?: () => void;
  onRemoveFromShoppingList?: () => void;
}) {
  const [sourceOpen, setSourceOpen] = React.useState(false);
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
  const hasSourceDetails = Boolean(caption || transcript || originalUrl || tagValues.length > 0);

  return (
    <div className="hidden md:flex flex-col w-full gap-5 mt-0">
      {cookStatusLoading ? (
        <div className="rounded-[28px] bg-emerald-600/85 p-5 shadow-[0_24px_54px_-28px_rgba(5,150,105,0.9)]">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 animate-pulse rounded-2xl bg-white/15" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-40 animate-pulse rounded-full bg-white/25" />
              <div className="h-4 w-48 animate-pulse rounded-full bg-white/20" />
            </div>
          </div>
        </div>
      ) : (
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
                {cookStatus.hasActiveSession ? 'Resume cooking' : 'Start cooking'}
              </span>
              <span className="mt-0.5 block text-sm font-medium text-emerald-50/85">
                {cookStatus.hasActiveSession ? 'Pick up your saved cook session.' : 'Open guided Cook Mode.'}
              </span>
            </span>
          </div>
        </button>
      )}

      {(onAddToShoppingList || onRemoveFromShoppingList) && (
        shoppingLoading ? (
          <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.42)]">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-2xl bg-emerald-50" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-44 animate-pulse rounded-full bg-gray-100" />
                <div className="h-3 w-36 animate-pulse rounded-full bg-gray-100" />
              </div>
            </div>
          </div>
        ) : (
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
                {shoppingSaving
                  ? 'Updating shopping list...'
                  : shoppingPlanned
                    ? 'Planned'
                    : 'Add ingredients to shopping list'}
              </span>
              <span className="mt-0.5 block text-xs font-medium text-gray-500">
                {shoppingPlanned ? 'Already in your shopping plan.' : 'Plan this recipe for groceries.'}
              </span>
            </span>
          </div>
        </button>
        )
      )}

      <RecipeCookStatusCard
        status={cookStatus}
        loading={cookStatusLoading}
        onMarkCooked={onMarkCooked}
        onReset={onResetCookStatus}
      />

      <RecipeNotesCard
        note={note}
        onChange={onNoteChange}
        onSave={onNoteSave}
        onDelete={onNoteDelete}
        focusSignal={noteFocusSignal}
        status={noteStatus}
      />

      {folderName && (
        <RecipeRailCard
          icon={<Folder size={16} aria-hidden="true" />}
          label="Collection"
          title={folderName}
        />
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
                <AlignLeft size={16} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-black text-gray-950">
                  {t('videoDetail:sourceDetails', 'Source details')}
                </span>
                <span className="mt-0.5 block text-xs font-medium text-gray-400">
                  Caption, transcript, tags, and original link
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
                showOriginalLink
                tags={tagValues}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RecipeCookbookRail;
