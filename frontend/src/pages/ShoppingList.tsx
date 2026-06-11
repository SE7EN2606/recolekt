import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, ChevronRight, PackageCheck, ShoppingBasket, Trash2 } from 'lucide-react';
import useShoppingList from '../features/shopping/useShoppingList';
import type { MergedShoppingItem } from '../features/shopping/shoppingMerge';
import type { ShoppingGroup } from '../features/shopping/shoppingGrouping';
import { formatShoppingQuantity } from '../features/shopping/shoppingDisplay';
import {
  readShoppingPreferences,
  type ShoppingPreferences,
} from '../features/shopping/shoppingPreferences';

function recipeTitle(recipe: any): string {
  return String(recipe?.title || recipe?.summary_title || recipe?.summaryTitle || recipe?.caption?.split?.('\n')?.[0] || 'Recipe').trim();
}

function recipeThumbnail(recipe: any): string {
  return String(recipe?.posterUrl || recipe?.thumbnailUrl || recipe?.gcs_urls?.preview_thumbnail || recipe?.gcsurls?.previewthumbnail || '');
}

function ShoppingItemRow({
  item,
  onPatch,
  preferences,
  excludedView = false,
}: {
  item: MergedShoppingItem;
  onPatch: (ingredientKey: string, patch: { checked?: boolean; excluded?: boolean }) => void;
  preferences: ShoppingPreferences;
  excludedView?: boolean;
}) {
  const quantity = formatShoppingQuantity(item, preferences);

  return (
    <div className="border-b border-gray-100 p-3.5 last:border-b-0">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onPatch(item.key, { checked: !item.checked })}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
            item.checked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300 bg-white text-transparent'
          }`}
          aria-label={item.checked ? 'Mark unchecked' : 'Mark checked'}
        >
          <Check size={12} strokeWidth={3} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {quantity && (
              <span className={`text-sm font-black ${excludedView ? 'text-gray-400' : 'text-emerald-700'}`}>
                {quantity}
              </span>
            )}
            <span className={`text-sm font-black ${
              item.checked || excludedView ? 'text-gray-400 line-through' : 'text-gray-950'
            }`}>
              {item.name}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.sources.map((source) => (
              <Link
                key={`${item.key}-${source.reelId}`}
                to={`/video/${source.reelId}`}
                className="rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-bold text-gray-500 ring-1 ring-gray-100 hover:bg-emerald-50 hover:text-emerald-700"
              >
                {source.recipeTitle}
              </Link>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onPatch(item.key, { excluded: !item.excluded })}
          className={`shrink-0 rounded-xl px-2.5 py-1.5 text-[11px] font-black transition-colors ${
            excludedView
              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              : 'text-gray-400 hover:bg-amber-50 hover:text-amber-700'
          }`}
        >
          {excludedView ? 'Restore' : 'I have this'}
        </button>
      </div>
    </div>
  );
}

function ShoppingGroupSection({
  group,
  onPatch,
  preferences,
  excludedView = false,
}: {
  group: ShoppingGroup;
  onPatch: (ingredientKey: string, patch: { checked?: boolean; excluded?: boolean }) => void;
  preferences: ShoppingPreferences;
  excludedView?: boolean;
}) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">{group.title}</h3>
      <div className={`overflow-hidden rounded-[24px] border bg-white shadow-sm ${
        excludedView ? 'border-gray-200 opacity-90' : 'border-gray-100'
      }`}>
        {group.items.map((item) => (
          <ShoppingItemRow
            key={item.key}
            item={item}
            onPatch={onPatch}
            preferences={preferences}
            excludedView={excludedView}
          />
        ))}
      </div>
    </section>
  );
}

export const ShoppingList: React.FC = () => {
  const navigate = useNavigate();
  const [alreadyHaveOpen, setAlreadyHaveOpen] = useState(false);
  const [preferences, setPreferences] = useState<ShoppingPreferences>(() => readShoppingPreferences());
  const {
    loading,
    saving,
    error,
    recipeEntries,
    mergedItems,
    groupedItems,
    excludedItems,
    groupedExcludedItems,
    removeRecipe,
    patchItem,
  } = useShoppingList();
  const activeItems = useMemo(() => mergedItems.filter((item) => !item.excluded), [mergedItems]);
  const checkedActiveCount = activeItems.filter((item) => item.checked).length;

  useEffect(() => {
    const handlePreferenceChange = () => setPreferences(readShoppingPreferences());
    window.addEventListener('recolekt:shopping-preferences-changed', handlePreferenceChange);
    window.addEventListener('storage', handlePreferenceChange);
    return () => {
      window.removeEventListener('recolekt:shopping-preferences-changed', handlePreferenceChange);
      window.removeEventListener('storage', handlePreferenceChange);
    };
  }, []);

  return (
    <div className="w-full animate-fade-in pb-24 pt-4 md:pb-12 md:pt-0">
      <div className="mb-8 rounded-[28px] border border-emerald-100 bg-white/70 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <ShoppingBasket size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-700">Shopping list</p>
            <h1 className="text-2xl font-black tracking-tight text-gray-950">This Week’s Cooking Plan</h1>
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-gray-500">
          Add recipes from their detail page. Groceries are derived from planned recipes, with source recipes kept attached to every item.
        </p>
        {error && <p className="mt-3 text-sm font-bold text-rose-600">{error}</p>}
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-emerald-700">This Week’s Cooking Plan</p>
                <h2 className="text-lg font-black text-gray-950">Planned recipes</h2>
              </div>
              {recipeEntries.length > 0 && (
                <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
                  {recipeEntries.length} {recipeEntries.length === 1 ? 'recipe' : 'recipes'}
                </span>
              )}
            </div>
            {recipeEntries.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-emerald-100 bg-white/70 p-8 text-center shadow-sm">
                <ShoppingBasket className="mx-auto mb-3 text-emerald-200" size={32} />
                <p className="font-black text-gray-950">No recipes planned yet</p>
                <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-relaxed text-gray-500">
                  Open a recipe page and choose “Add ingredients to shopping list.” Recolekt will translate your cooking plan into groceries here.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {recipeEntries.map((entry) => {
                  const title = recipeTitle(entry.recipe);
                  const thumbnail = recipeThumbnail(entry.recipe);
                  return (
                    <div key={entry.reelId} className="rounded-[24px] border border-gray-100 bg-white p-3 shadow-sm">
                      <button
                        type="button"
                        onClick={() => navigate(`/video/${entry.reelId}`)}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                          {thumbnail && <img src={thumbnail} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-black text-gray-950">{title}</p>
                          <p className="mt-0.5 text-xs font-medium text-gray-400">Tap to open recipe detail</p>
                        </div>
                        <ChevronRight size={16} className="text-gray-300" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRecipe(entry.reelId)}
                        disabled={saving}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold text-gray-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                      >
                        <Trash2 size={13} aria-hidden="true" />
                        Remove recipe
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Grouped grocery list</p>
                <h2 className="text-lg font-black text-gray-950">Groceries to buy</h2>
                <p className="mt-0.5 text-sm font-medium text-gray-500">
                  {activeItems.length} to buy
                  {activeItems.length > 0 ? ` · ${checkedActiveCount} of ${activeItems.length} checked` : ''}
                </p>
              </div>
              {excludedItems.length > 0 && (
                <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-black text-gray-500">
                  Already have {excludedItems.length}
                </span>
              )}
            </div>
            {groupedItems.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-gray-200 bg-white/60 p-8 text-center">
                <PackageCheck className="mx-auto mb-3 text-gray-300" size={28} />
                <p className="font-black text-gray-900">
                  {groupedExcludedItems.length > 0 ? 'All grocery items are hidden' : 'Your derived grocery list will appear here'}
                </p>
                <p className="mt-1 text-sm font-medium text-gray-500">
                  {groupedExcludedItems.length > 0
                    ? 'Restore items below if you still need them.'
                    : 'Add ingredients from a recipe page to get started.'}
                </p>
              </div>
            ) : (
              groupedItems.map((group) => (
                <ShoppingGroupSection
                  key={group.title}
                  group={group}
                  onPatch={patchItem}
                  preferences={preferences}
                />
              ))
            )}

            {groupedExcludedItems.length > 0 && (
              <div className="space-y-3 border-t border-gray-100 pt-5">
                <button
                  type="button"
                  onClick={() => setAlreadyHaveOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-gray-100 transition-colors hover:bg-gray-50"
                  aria-expanded={alreadyHaveOpen}
                >
                  <span>
                    <span className="block text-sm font-black text-gray-950">Already have · {excludedItems.length}</span>
                    <span className="mt-0.5 block text-xs font-medium text-gray-500">
                      Hidden from the active grocery list.
                    </span>
                  </span>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-gray-400 transition-transform ${alreadyHaveOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {alreadyHaveOpen && groupedExcludedItems.map((group) => (
                    <ShoppingGroupSection
                      key={`excluded-${group.title}`}
                      group={group}
                      onPatch={patchItem}
                      preferences={preferences}
                      excludedView
                    />
                  ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default ShoppingList;
