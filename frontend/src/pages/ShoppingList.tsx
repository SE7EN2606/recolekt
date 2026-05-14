import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronRight, PackageCheck, ShoppingBasket, Trash2 } from 'lucide-react';
import useShoppingList from '../features/shopping/useShoppingList';
import type { MergedShoppingItem } from '../features/shopping/shoppingMerge';
import type { ShoppingGroup } from '../features/shopping/shoppingGrouping';

function recipeTitle(recipe: any): string {
  return String(recipe?.title || recipe?.summary_title || recipe?.summaryTitle || recipe?.caption?.split?.('\n')?.[0] || 'Recipe').trim();
}

function recipeThumbnail(recipe: any): string {
  return String(recipe?.posterUrl || recipe?.thumbnailUrl || recipe?.gcs_urls?.preview_thumbnail || recipe?.gcsurls?.previewthumbnail || '');
}

function formatQuantity(item: MergedShoppingItem): string {
  if (item.quantity === null) return '';
  const rounded = Number.isInteger(item.quantity) ? String(item.quantity) : String(Number(item.quantity.toFixed(2)));
  return item.unit ? `${rounded} ${item.unit}` : rounded;
}

function ShoppingItemRow({
  item,
  onPatch,
  excludedView = false,
}: {
  item: MergedShoppingItem;
  onPatch: (ingredientKey: string, patch: { checked?: boolean; excluded?: boolean }) => void;
  excludedView?: boolean;
}) {
  return (
    <div className="border-b border-gray-100 p-4 last:border-b-0">
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
            {formatQuantity(item) && (
              <span className={`text-sm font-black ${excludedView ? 'text-gray-400' : 'text-emerald-700'}`}>
                {formatQuantity(item)}
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
  excludedView = false,
}: {
  group: ShoppingGroup;
  onPatch: (ingredientKey: string, patch: { checked?: boolean; excluded?: boolean }) => void;
  excludedView?: boolean;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-black uppercase tracking-widest text-gray-400">{group.title}</h3>
      <div className={`overflow-hidden rounded-[24px] border bg-white shadow-sm ${
        excludedView ? 'border-gray-200 opacity-90' : 'border-gray-100'
      }`}>
        {group.items.map((item) => (
          <ShoppingItemRow
            key={item.key}
            item={item}
            onPatch={onPatch}
            excludedView={excludedView}
          />
        ))}
      </div>
    </section>
  );
}

export const ShoppingList: React.FC = () => {
  const navigate = useNavigate();
  const {
    loading,
    saving,
    error,
    recipeEntries,
    groupedItems,
    groupedExcludedItems,
    removeRecipe,
    patchItem,
  } = useShoppingList();

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
        <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <h2 className="text-lg font-black text-gray-950">Planned recipes</h2>
            {recipeEntries.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-emerald-100 bg-white/60 p-5 text-sm font-medium text-gray-500">
                No recipes planned yet. Open a recipe and add its ingredients.
              </div>
            ) : (
              <div className="space-y-3">
                {recipeEntries.map((entry) => {
                  const title = recipeTitle(entry.recipe);
                  const thumbnail = recipeThumbnail(entry.recipe);
                  return (
                    <div key={entry.reelId} className="rounded-[22px] border border-gray-100 bg-white p-3 shadow-sm">
                      <button
                        type="button"
                        onClick={() => navigate(`/video/${entry.reelId}`)}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                          {thumbnail && <img src={thumbnail} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-black text-gray-950">{title}</p>
                          <p className="mt-0.5 text-xs font-medium text-gray-400">Source recipe</p>
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
          </aside>

          <main className="space-y-6">
            <h2 className="text-lg font-black text-gray-950">Groceries</h2>
            {groupedItems.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-gray-200 bg-white/60 p-8 text-center">
                <PackageCheck className="mx-auto mb-3 text-gray-300" size={28} />
                <p className="font-black text-gray-900">
                  {groupedExcludedItems.length > 0 ? 'All grocery items are hidden' : 'Your derived grocery list will appear here'}
                </p>
                <p className="mt-1 text-sm font-medium text-gray-500">
                  {groupedExcludedItems.length > 0
                    ? 'Restore items below if you still need them.'
                    : 'Add ingredients from a recipe to get started.'}
                </p>
              </div>
            ) : (
              groupedItems.map((group) => (
                <ShoppingGroupSection key={group.title} group={group} onPatch={patchItem} />
              ))
            )}

            {groupedExcludedItems.length > 0 && (
              <div className="space-y-4 border-t border-gray-100 pt-6">
                <div>
                  <h2 className="text-lg font-black text-gray-950">Already have</h2>
                  <p className="mt-1 text-sm font-medium text-gray-500">
                    These are hidden from the active grocery list. Restore anything you still need.
                  </p>
                </div>
                {groupedExcludedItems.map((group) => (
                  <ShoppingGroupSection
                    key={`excluded-${group.title}`}
                    group={group}
                    onPatch={patchItem}
                    excludedView
                  />
                ))}
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
};

export default ShoppingList;
