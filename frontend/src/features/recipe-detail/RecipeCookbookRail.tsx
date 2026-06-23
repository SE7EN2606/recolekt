import React from 'react';
import { AlignLeft, ChefHat, ChevronDown, ShoppingBasket, StickyNote } from 'lucide-react';
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

const GLASS = 'bg-white/90 backdrop-blur-sm border border-white/75 rounded-[24px] shadow-[0_4px_18px_rgba(15,23,42,0.06)]';

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
      <div id="recipe-notes" className="scroll-mt-24 rounded-[24px] border border-[#e0e7ff] bg-gradient-to-br from-[#f5f3ff] to-[#fff1f5] p-[18px] shadow-[0_4px_18px_rgba(15,23,42,0.06)]">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-8 w-8 animate-pulse rounded-xl bg-primary-100" />
          <div className="h-4 w-24 animate-pulse rounded-full bg-primary-100" />
        </div>
        <div className="h-[116px] animate-pulse rounded-[13px] bg-white/60" />
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
    <div
      ref={containerRef}
      id="recipe-notes"
      className="scroll-mt-24 rounded-[24px] border border-[#e0e7ff] bg-gradient-to-br from-[#f5f3ff] to-[#fff1f5] p-[18px] shadow-[0_4px_18px_rgba(15,23,42,0.06)]"
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <StickyNote size={16} aria-hidden="true" />
        </div>
        <span className="font-extrabold text-base text-gray-950">Your notes</span>
      </div>

      {showEmptyState && (
        <div className="mb-3 rounded-[13px] border border-dashed border-primary-200 bg-white/50 px-3 py-3">
          <div className="text-sm font-bold text-gray-800">No notes yet</div>
          <div className="mt-1 text-xs font-medium leading-relaxed text-gray-500">
            Capture substitutions, timing tweaks, or what to improve next time.
          </div>
          <button
            type="button"
            onClick={activateNote}
            className="mt-2 rounded-xl bg-white px-3 py-1.5 text-[11px] font-bold text-primary-700 ring-1 ring-primary-100 transition-colors hover:bg-primary-50"
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
        className="min-h-[72px] w-full resize-y rounded-[13px] border border-slate-200 bg-white/70 p-3 text-sm leading-normal text-gray-800 placeholder:text-gray-400 outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
      />

      <div className="mt-2 flex items-center justify-between gap-3">
        <div className={`text-[11px] font-medium ${status === 'error' ? 'text-rose-600' : 'text-gray-400'}`}>
          {statusLabel}
        </div>
        <div className="flex items-center gap-2">
          {hasNote && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-gray-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            className="rounded-xl border border-primary-100 bg-white px-3 py-1.5 text-[11px] font-bold text-primary-700 transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
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
      <div className="rounded-[24px] border border-[#D6EFE4] bg-gradient-to-br from-[#E9F8F0] to-[#E2F3F8] p-[18px] shadow-[0_4px_18px_rgba(15,23,42,0.06)]">
        <div className="mb-2.5 flex items-center gap-[7px]">
          <div className="h-[7px] w-[7px] animate-pulse rounded-full bg-green-300" />
          <div className="h-3 w-20 animate-pulse rounded-full bg-green-200" />
        </div>
        <div className="h-7 w-36 animate-pulse rounded-full bg-green-200" />
        <div className="mt-2 h-3.5 w-44 animate-pulse rounded-full bg-green-100" />
        <div className="mt-3.5 flex gap-2.5">
          <div className="h-10 flex-1 animate-pulse rounded-xl bg-green-300/50" />
          <div className="h-10 w-16 animate-pulse rounded-xl bg-white/70" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-[#D6EFE4] bg-gradient-to-br from-[#E9F8F0] to-[#E2F3F8] p-[18px] shadow-[0_4px_18px_rgba(15,23,42,0.06)]">
      <div className="mb-2.5 flex items-center gap-[7px]">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-green-600" />
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-green-700">Cook status</span>
      </div>

      <div className="font-extrabold text-[21px] leading-tight text-gray-950">
        {hasCooked ? `Cooked ${status.cookedCount}×` : 'Not cooked yet'}
      </div>
      <div className="mb-3.5 mt-1 text-[12.5px] text-slate-500">
        {hasCooked
          ? `Last cooked ${status.lastCookedLabel || 'recently'}`
          : 'Track this when you make it.'}
      </div>

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onMarkCooked}
          className="flex-1 rounded-xl bg-green-600 py-[11px] text-sm font-bold text-white transition-colors hover:bg-green-700"
        >
          {hasCooked ? 'Cook again' : 'Mark cooked'}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!hasCooked}
          className="rounded-xl border border-[#CFE6DB] bg-white px-[15px] py-[11px] text-[13.5px] font-semibold text-[#5E7A6C] transition-colors hover:bg-[#f0f9f4] disabled:cursor-not-allowed disabled:opacity-40"
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
  quickActions,
  memoryLine,
  memoryItems = [],
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
  quickActions?: React.ReactNode;
  memoryLine?: string;
  memoryItems?: string[];
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
  const hasQuickActions = Boolean(quickActions || onAddToShoppingList || onRemoveFromShoppingList);
  const hasMemory = memoryItems.length > 0 || Boolean(memoryLine);

  return (
    <div className="hidden md:flex w-full flex-col gap-4 py-5 px-[18px] mt-0">

      {/* 1. Start cooking */}
      {cookStatusLoading ? (
        <div className="rounded-[24px] bg-green-600/80 p-[18px] shadow-[0_10px_26px_rgba(5,150,105,0.32)]">
          <div className="flex items-center gap-3.5">
            <div className="h-[46px] w-[46px] animate-pulse rounded-[13px] bg-white/20" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-40 animate-pulse rounded-full bg-white/25" />
              <div className="h-3.5 w-32 animate-pulse rounded-full bg-white/15" />
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onStartCooking}
          className="rounded-[24px] bg-green-600 p-5 text-left text-white shadow-[0_10px_26px_rgba(5,150,105,0.32)] transition-colors hover:bg-green-700"
        >
          <div className="flex items-center gap-3.5">
            <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[13px] bg-white/20">
              <ChefHat size={22} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block font-extrabold text-[17px] leading-tight tracking-[-0.01em]">
                {cookStatus.hasActiveSession ? 'Resume cooking' : 'Start cooking'}
              </span>
              <span className="mt-0.5 block text-[12.5px] opacity-90">
                {cookStatus.hasActiveSession
                  ? 'Pick up your saved cook session.'
                  : 'Open guided Cook Mode.'}
              </span>
            </span>
          </div>
        </button>
      )}

      {/* 2. Cook status */}
      <RecipeCookStatusCard
        status={cookStatus}
        loading={cookStatusLoading}
        onMarkCooked={onMarkCooked}
        onReset={onResetCookStatus}
      />

      {/* 3. Quick actions */}
      {hasQuickActions && (
        <div className={`${GLASS} p-2.5`}>
          {(onAddToShoppingList || onRemoveFromShoppingList) && (
            shoppingLoading ? (
              <div className="flex items-center gap-3 px-3 py-[11px] rounded-xl">
                <div className="h-8 w-8 animate-pulse rounded-[9px] bg-green-50" />
                <div className="h-3.5 w-36 animate-pulse rounded-full bg-gray-100" />
              </div>
            ) : (
              <button
                type="button"
                onClick={shoppingPlanned ? onRemoveFromShoppingList : onAddToShoppingList}
                disabled={shoppingSaving}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-[11px] transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-green-100 text-green-700">
                  <ShoppingBasket size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 text-left text-sm font-semibold text-slate-800">
                  {shoppingSaving
                    ? 'Updating shopping list…'
                    : shoppingPlanned
                      ? 'In shopping plan'
                      : 'Add to shopping list'}
                </span>
                {shoppingPlanned && !shoppingSaving && (
                  <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[11.5px] font-bold text-green-700">
                    In plan
                  </span>
                )}
              </button>
            )
          )}
          {quickActions}
        </div>
      )}

      {/* 4. Your notes */}
      <RecipeNotesCard
        note={note}
        onChange={onNoteChange}
        onSave={onNoteSave}
        onDelete={onNoteDelete}
        focusSignal={noteFocusSignal}
        status={noteStatus}
      />

      {/* 5. Recipe memory — star rating NOT rendered (no rating persistence in app) */}
      <div className={`${GLASS} p-[18px]`}>
        <p className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
          Recipe memory
        </p>
        {hasMemory ? (
          <div>
            {memoryItems.length > 0 ? (
              memoryItems.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 border-b border-slate-100 py-2 last:border-b-0"
                >
                  <span
                    className={`h-[11px] w-[11px] shrink-0 rounded-full ${
                      index === 0 ? 'bg-primary-400' : 'bg-green-400'
                    }`}
                  />
                  <span className="text-[13.5px] font-bold text-gray-800">{item}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">{memoryLine}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            Cook it or add a note to build your memory here.
          </p>
        )}
      </div>

      {/* 6. Source attribution */}
      {originalUrl && (
        <div className={`${GLASS} p-4`}>
          <OriginalLink url={originalUrl} platform={platform} t={t} />
        </div>
      )}

      {/* 7. Source details */}
      {hasSourceDetails && (
        <div className={`${GLASS} overflow-hidden`}>
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
                <span className="block text-sm font-bold text-gray-950">
                  {t('videoDetail:sourceDetails', 'Source details')}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-slate-400">
                  Caption, transcript, tags
                </span>
              </span>
            </span>
            <ChevronDown
              size={18}
              className={`shrink-0 text-gray-400 transition-transform duration-200 ${sourceOpen ? 'rotate-180' : ''}`}
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
