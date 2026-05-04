import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart, Trash2, CheckCircle2, Circle,
  Search, ChefHat, ExternalLink, X, RotateCcw,
  Package, Check, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useData, GroceryItem } from '../context/DataContext';
import { ConfirmModal } from '../components/ConfirmModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Extract the videoId (recipeId) from an item id built as `${recipeId}_${ingredientKey}`
// Ingredient keys are always f0, f1, g0-i0, g0-i1, etc.
function extractRecipeId(itemId: string): string | null {
  const m = itemId.match(/^(.+)_(f\d+|g\d+-i\d+)$/);
  return m ? m[1] : null;
}

function mergeQuantities(items: GroceryItem[]): string {
  const byUnit = new Map<string, number>();
  let hasAny = false;

  for (const item of items) {
    if (!item.quantity) continue;
    const qty = parseFloat(item.quantity.replace(',', '.'));
    if (isNaN(qty)) continue;
    hasAny = true;
    const u = (item.unit || '').toLowerCase().trim();
    byUnit.set(u, (byUnit.get(u) || 0) + qty);
  }

  if (!hasAny) return '';

  return Array.from(byUnit.entries())
    .map(([u, total]) => {
      const r = Math.round(total * 100) / 100;
      return u ? `${r} ${u}` : String(r);
    })
    .join(' + ');
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Source {
  id: string;
  recipeTitle: string;
  recipeId: string | null;
  quantity?: string;
  unit?: string;
  checked: boolean;
  have: boolean;
}

interface MergedIngredient {
  key: string;
  name: string;
  emoji?: string;
  totalQty: string;
  sources: Source[];
  allChecked: boolean;
  someChecked: boolean;
  allHave: boolean;
}

interface RecipeGroup {
  title: string;
  recipeId: string | null;
  itemIds: string[];
}

// ─── buildMerged ──────────────────────────────────────────────────────────────

function buildMerged(items: GroceryItem[]): MergedIngredient[] {
  const groups = new Map<string, GroceryItem[]>();
  for (const item of items) {
    const key = normalizeKey(item.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return Array.from(groups.entries()).map(([key, list]) => {
    const allChecked = list.every(i => i.checked);
    const someChecked = list.some(i => i.checked);
    return {
      key,
      name: list[0].name,
      emoji: list.find(i => i.emoji)?.emoji,
      totalQty: mergeQuantities(list),
      sources: list.map(i => ({
        id: i.id,
        recipeTitle: i.recipeTitle || 'Other',
        recipeId: extractRecipeId(i.id),
        quantity: i.quantity,
        unit: i.unit,
        checked: i.checked,
        have: i.have,
      })),
      allChecked,
      someChecked: someChecked && !allChecked,
      allHave: list.every(i => i.have),
    };
  });
}

// ─── MergedIngredientRow ──────────────────────────────────────────────────────

interface MergedRowProps {
  merged: MergedIngredient;
  onToggleChecked: () => void;
  onHaveIt: () => void;
  onNavigate: (path: string) => void;
}

const MergedIngredientRow: React.FC<MergedRowProps> = ({
  merged, onToggleChecked, onHaveIt, onNavigate,
}) => {
  const dim = merged.allChecked;

  return (
    <div className={`px-4 py-3.5 transition-colors ${dim ? 'bg-gray-50/60' : 'hover:bg-gray-50/40'}`}>
      <div className="flex items-start gap-3">

        {/* Checkbox */}
        <button
          type="button"
          onClick={onToggleChecked}
          className="flex-shrink-0 mt-0.5 w-[22px] h-[22px] rounded-[7px] flex items-center justify-center transition-all"
          style={{
            border: merged.allChecked
              ? '2px solid #7c3aed'
              : merged.someChecked
                ? '2px solid #a78bfa'
                : '2px solid #e2e8f0',
            background: merged.allChecked ? '#7c3aed' : merged.someChecked ? '#ede9fe' : 'transparent',
          }}
        >
          {merged.allChecked && <Check size={11} color="white" strokeWidth={3} />}
          {merged.someChecked && (
            <div className="w-2 h-[2px] rounded-full bg-primary-500" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {merged.emoji && (
              <span className={`text-base leading-none ${dim ? 'grayscale opacity-30' : ''}`}>
                {merged.emoji}
              </span>
            )}
            <span className={`text-sm font-bold leading-snug ${dim ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
              {merged.name}
            </span>
            {merged.totalQty && (
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                dim ? 'bg-gray-100 text-gray-300' : 'bg-primary-50 text-primary-600'
              }`}>
                {merged.totalQty}
              </span>
            )}
          </div>

          {/* Recipe source pills — always show so user knows which recipe */}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {merged.sources.map((src, i) => (
              <button
                key={`${src.id}-${i}`}
                type="button"
                onClick={() => src.recipeId && onNavigate(`/video/${src.recipeId}`)}
                disabled={!src.recipeId}
                className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border transition-colors ${
                  src.recipeId
                    ? 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-primary-50 hover:text-primary-600 hover:border-primary-100 cursor-pointer'
                    : 'bg-gray-50 text-gray-300 border-gray-100 cursor-default'
                }`}
              >
                <ChefHat size={9} className="flex-shrink-0" />
                <span className="truncate max-w-[110px]">{src.recipeTitle}</span>
                {src.quantity && (
                  <span className="opacity-60">
                    {src.quantity}{src.unit ? ` ${src.unit}` : ''}
                  </span>
                )}
                {src.recipeId && <ExternalLink size={8} className="opacity-50 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* Have it button — prominent, right side */}
        <button
          type="button"
          onClick={onHaveIt}
          title="I already have this — move to pantry"
          className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all mt-0.5"
          style={{
            border: '1.5px solid #e2e8f0',
            color: '#94a3b8',
            background: 'white',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = '#86efac';
            e.currentTarget.style.background = '#f0fdf4';
            e.currentTarget.style.color = '#15803d';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.background = 'white';
            e.currentTarget.style.color = '#94a3b8';
          }}
        >
          <Package size={12} />
          <span>Have it</span>
        </button>
      </div>
    </div>
  );
};

// ─── PantryRow ────────────────────────────────────────────────────────────────

const PantryRow: React.FC<{
  merged: MergedIngredient;
  onMoveBack: () => void;
}> = ({ merged, onMoveBack }) => (
  <div className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/40 transition-colors">
    {merged.emoji && (
      <span className="text-base grayscale opacity-25 flex-shrink-0 mt-0.5">{merged.emoji}</span>
    )}
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-gray-300 line-through">{merged.name}</span>
        {merged.totalQty && (
          <span className="text-[11px] font-bold text-gray-200 bg-gray-50 px-1.5 py-0.5 rounded-md border border-gray-100">
            {merged.totalQty}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1 mt-1">
        {merged.sources.map((src, i) => (
          <span
            key={`${src.id}-${i}`}
            className="text-[10px] font-bold text-gray-300 bg-gray-50 px-1.5 py-0.5 rounded-md border border-gray-100"
          >
            {src.recipeTitle}
          </span>
        ))}
      </div>
    </div>

    {/* Move back button — clearly labeled */}
    <button
      type="button"
      onClick={onMoveBack}
      title="Move back to shopping list"
      className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border border-gray-200 text-gray-400 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 mt-0.5"
    >
      <RotateCcw size={11} />
      <span>Add back</span>
    </button>
  </div>
);

// ─── GroceryList ──────────────────────────────────────────────────────────────

export const GroceryList: React.FC = () => {
  const navigate = useNavigate();
  const {
    groceryList,
    toggleGroceryItem,
    toggleGroceryHave,
    clearGroceryList,
    removeFromGroceryList,
  } = useData() as any; // `removeFromGroceryList` added below in DataContext

  const [searchQuery, setSearchQuery] = useState('');
  const [pantryExpandedMobile, setPantryExpandedMobile] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // ── Derived data ──────────────────────────────────────────────────────────

  const toBuyRaw = useMemo(() => (groceryList as GroceryItem[]).filter(i => !i.have), [groceryList]);
  const haveRaw  = useMemo(() => (groceryList as GroceryItem[]).filter(i =>  i.have), [groceryList]);

  // Recipe management pills
  const recipeGroups = useMemo((): RecipeGroup[] => {
    const map = new Map<string, RecipeGroup>();
    for (const item of groceryList as GroceryItem[]) {
      const title = item.recipeTitle || 'Other';
      if (!map.has(title)) {
        map.set(title, { title, recipeId: extractRecipeId(item.id), itemIds: [] });
      }
      map.get(title)!.itemIds.push(item.id);
    }
    return Array.from(map.values());
  }, [groceryList]);

  // Search-filtered merged lists
  const mergedToBuy = useMemo((): MergedIngredient[] => {
    const q = searchQuery.toLowerCase();
    const filtered = q
      ? toBuyRaw.filter(i =>
          i.name.toLowerCase().includes(q) ||
          (i.recipeTitle || '').toLowerCase().includes(q),
        )
      : toBuyRaw;
    return buildMerged(filtered);
  }, [toBuyRaw, searchQuery]);

  const mergedHave = useMemo((): MergedIngredient[] => buildMerged(haveRaw), [haveRaw]);

  // Progress
  const totalToBuy   = toBuyRaw.length;
  const checkedCount = toBuyRaw.filter(i => i.checked).length;
  const progress     = totalToBuy > 0 ? (checkedCount / totalToBuy) * 100 : 0;

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleToggleChecked = (merged: MergedIngredient) => {
    if (merged.allChecked) {
      merged.sources.filter(s => s.checked).forEach(s => toggleGroceryItem(s.id));
    } else {
      merged.sources.filter(s => !s.checked).forEach(s => toggleGroceryItem(s.id));
    }
  };

  const handleHaveIt = (merged: MergedIngredient) => {
    merged.sources.filter(s => !s.have).forEach(s => toggleGroceryHave(s.id));
  };

  const handleMoveBack = (merged: MergedIngredient) => {
    merged.sources.filter(s => s.have).forEach(s => toggleGroceryHave(s.id));
  };

  const handleRemoveRecipe = (itemIds: string[]) => {
    if (typeof removeFromGroceryList === 'function') {
      removeFromGroceryList(itemIds);
    }
  };

  const handleClearChecked = () => {
    toBuyRaw.filter(i => i.checked).forEach(i => toggleGroceryItem(i.id));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="pb-20 md:pb-8">

      {/* ── Page header — consistent with site (matches My Videos / Organizer) */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Grocery List</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">
            {(groceryList as GroceryItem[]).length === 0
              ? 'Add ingredients from any saved recipe'
              : totalToBuy === 0
                ? 'All done — nothing left to buy!'
                : `${totalToBuy - checkedCount} item${totalToBuy - checkedCount !== 1 ? 's' : ''} left to collect`}
          </p>
        </div>
        {(groceryList as GroceryItem[]).length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <Trash2 size={15} />
            Clear all
          </button>
        )}
      </div>

      {/* ── Empty state */}
      {(groceryList as GroceryItem[]).length === 0 && (
        <div className="text-center py-24">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShoppingCart size={32} className="text-gray-300" />
          </div>
          <h3 className="text-xl font-black text-gray-900 mb-2">Your list is empty</h3>
          <p className="text-gray-400 text-sm leading-relaxed max-w-[240px] mx-auto">
            Open a saved recipe and tap "Add to list" next to the ingredients section.
          </p>
          <button
            onClick={() => navigate('/gallery')}
            className="mt-6 px-6 py-3 bg-primary-600 text-white rounded-xl font-bold text-sm hover:bg-primary-700 transition-all shadow-lg shadow-primary-600/20"
          >
            Browse Recipes
          </button>
        </div>
      )}

      {(groceryList as GroceryItem[]).length > 0 && (
        <>
          {/* ── Recipe pills — remove all + link to recipe */}
          {recipeGroups.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {recipeGroups.map(group => (
                <div
                  key={group.title}
                  className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-2xl pl-3 pr-1 py-1.5 shadow-sm"
                >
                  <ChefHat size={12} className="text-primary-500 flex-shrink-0 mr-1" />
                  <span className="text-sm font-bold text-gray-700 max-w-[150px] truncate">
                    {group.title}
                  </span>
                  {group.recipeId && (
                    <button
                      onClick={() => navigate(`/video/${group.recipeId}`)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors ml-1"
                      title="Go to recipe"
                    >
                      <ExternalLink size={11} />
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveRecipe(group.itemIds)}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title={`Remove all ${group.title} ingredients`}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Progress bar */}
          {totalToBuy > 0 && (
            <div className="bg-white border border-gray-100 rounded-[20px] px-5 py-4 mb-6 shadow-sm">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <ShoppingCart size={14} className="text-primary-500" />
                  <span className="text-sm font-bold text-gray-900">Shopping Progress</span>
                </div>
                <div className="flex items-center gap-3">
                  {checkedCount > 0 && (
                    <button
                      onClick={handleClearChecked}
                      className="text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Clear collected
                    </button>
                  )}
                  <span className="text-xs font-bold text-gray-400">
                    {checkedCount} / {totalToBuy}
                  </span>
                </div>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, #7c3aed 0%, #e11d48 100%)',
                  }}
                />
              </div>
            </div>
          )}

          {/* ── Main content: 2 columns desktop, stacked mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">

            {/* LEFT: To Buy */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                  To Buy
                </h2>
                <span className="text-xs font-bold text-gray-300">
                  {mergedToBuy.length} ingredient{mergedToBuy.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Search */}
              <div className="relative mb-3">
                <Search
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none"
                  size={15}
                />
                <input
                  type="text"
                  placeholder="Search ingredients or recipes..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* List */}
              {totalToBuy === 0 ? (
                <div className="bg-white border border-gray-100 rounded-[24px] p-10 text-center shadow-sm">
                  <CheckCircle2 size={28} className="text-green-400 mx-auto mb-3" />
                  <p className="font-black text-gray-900 text-sm">All collected!</p>
                  <p className="text-xs text-gray-400 mt-1">Everything is either in your cart or pantry.</p>
                </div>
              ) : mergedToBuy.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-[24px] p-8 text-center shadow-sm">
                  <p className="text-sm text-gray-400 font-medium">No results for "{searchQuery}"</p>
                </div>
              ) : (
                <div className="bg-white border border-gray-100 rounded-[24px] shadow-sm overflow-hidden divide-y divide-gray-50">
                  {mergedToBuy.map(merged => (
                    <MergedIngredientRow
                      key={merged.key}
                      merged={merged}
                      onToggleChecked={() => handleToggleChecked(merged)}
                      onHaveIt={() => handleHaveIt(merged)}
                      onNavigate={navigate}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT: Pantry / Have It */}
            <div>
              {/* Desktop heading */}
              <div className="hidden lg:flex items-center justify-between mb-3">
                <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                  Already Have It
                </h2>
                <span className="text-xs font-bold text-gray-300">
                  {mergedHave.length} item{mergedHave.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Mobile: collapsible pantry toggle */}
              <button
                type="button"
                onClick={() => setPantryExpandedMobile(v => !v)}
                className="lg:hidden w-full flex items-center justify-between mb-3 px-4 py-3 bg-white border border-gray-100 rounded-2xl shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <Package size={15} className="text-gray-400" />
                  <span className="text-sm font-bold text-gray-600">Already Have It</span>
                  {mergedHave.length > 0 && (
                    <span className="text-[11px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">
                      {mergedHave.length}
                    </span>
                  )}
                </div>
                {pantryExpandedMobile
                  ? <ChevronUp size={16} className="text-gray-400" />
                  : <ChevronDown size={16} className="text-gray-400" />}
              </button>

              {/* Pantry content — always visible desktop, toggled mobile */}
              <div className={`lg:block ${pantryExpandedMobile ? 'block' : 'hidden'}`}>
                {mergedHave.length === 0 ? (
                  <div className="bg-gray-50 border border-dashed border-gray-200 rounded-[24px] p-8 text-center">
                    <Package size={22} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-xs text-gray-400 font-medium leading-relaxed">
                      Tap <strong>"Have it"</strong> on any ingredient<br />to move it here and skip it in store.
                    </p>
                  </div>
                ) : (
                  <div className="bg-white border border-gray-100 rounded-[24px] shadow-sm overflow-hidden divide-y divide-gray-50">
                    {mergedHave.map(merged => (
                      <PantryRow
                        key={merged.key}
                        merged={merged}
                        onMoveBack={() => handleMoveBack(merged)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={clearGroceryList}
        title="Clear grocery list?"
        message="This will remove every ingredient from your grocery list."
        confirmLabel="Clear all"
        cancelLabel="Keep list"
        variant="danger"
      />
    </div>
  );
};

export default GroceryList;