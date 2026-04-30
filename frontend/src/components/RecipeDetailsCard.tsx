import React from 'react';
import {
  ChefHat, Clock, Flame, Users, Lightbulb, ShoppingCart,
  Check, AlertTriangle, ChevronDown, ChevronUp, Zap, Moon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type RawInstruction =
  | string
  | { instruction: string; source?: string; confidence?: string };

type RawIngredient =
  | string
  | {
      item?: string | null;
      name?: string | null;
      quantity?: number | string | null;
      unit?: string | null;
      emoji?: string | null;
      note?: string | null;
      source?: string | null;
      confidence?: string | null;
      needs_review?: boolean;
      missing_reason?: string | null;
      approximate?: boolean;
      quantityRange?: { min: number; max: number; unit?: string } | null;
    };

export interface PracticalSummary {
  what_it_is?: string;
  key_technique?: string;
  important_notes?: string[];
  source?: string;
  confidence?: string;
}

export interface MissingInfoItem {
  field?: string;
  message: string;
  severity?: 'low' | 'medium' | 'high';
  suggestion?: string;
}

export interface IngredientGroup {
  title?: string;
  group?: string;
  items: RawIngredient[];
}

export interface RecipeForCard {
  is_compilation?: boolean;
  ideas?: { headline?: string; text?: string; emoji?: string }[];
  prep_time?: string | number | null;
  cook_time?: string | number | null;
  rest_time?: string | number | null;
  total_time?: string | number | null;
  prep_time_meta?: { source?: string; confidence?: string };
  cook_time_meta?: { source?: string; confidence?: string };
  rest_time_meta?: { source?: string; confidence?: string };
  total_time_meta?: { source?: string; confidence?: string };
  servings?: string | number | null;
  ingredients_groups?: IngredientGroup[] | null;
  ingredients?: RawIngredient[] | null;
  instructions?: RawInstruction[] | null;
  practical_summary?: PracticalSummary | null;
  tips?: string[];
  notes?: string | string[];
  missingInfo?: MissingInfoItem[] | null;
}

export interface ShoppingListItem {
  id: string;
  name: string;
  quantity?: string;
  unit?: string;
  emoji?: string;
  recipeTitle?: string;
  checked: boolean;
}

export interface RecipeDetailsCardProps {
  recipe: RecipeForCard;
  recipeId?: string;
  recipeName?: string;
  servingScale?: number;
  scaleQuantity?: (qty: string, scale: number) => string;
  onServingScaleChange?: (next: number) => void;
  useMetric?: boolean;
  onToggleMetric?: (val: boolean) => void;
  onAddToShoppingList?: (items: ShoppingListItem[]) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const toStr = (v: string | number | null | undefined): string =>
  v !== undefined && v !== null ? String(v) : '';

function formatMinutes(raw: string | number | null | undefined): string | null {
  const str = toStr(raw).trim();
  if (!str) return null;
  const n = parseFloat(str);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 60) return `${Math.round(n)} min`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  if (m === 0) return h === 1 ? '1 hr' : `${h} hr`;
  return `${h} hr ${m} min`;
}

function splitNote(baseLabel: string): { mainLabel: string; note: string } {
  const m = baseLabel.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (m) return { mainLabel: m[1].trim(), note: m[2].trim() };
  return { mainLabel: baseLabel, note: '' };
}

function parseRawIngredient(raw: RawIngredient) {
  if (typeof raw === 'string') {
    const base = raw.trim();
    const { mainLabel, note } = splitNote(base);
    return { name: mainLabel, note, quantity: null, unit: null, emoji: '', needsReview: false, isApprox: false, qtyRange: null, confidence: null, source: null };
  }

  const base = raw as any;
  const rawLabel = (base.item || base.name || '').trim();
  const { mainLabel, note } = splitNote(rawLabel);

  return {
    name: mainLabel,
    note: base.note || note || '',
    quantity: base.quantity !== undefined && base.quantity !== null ? String(base.quantity).trim() : null,
    unit: base.unit ? String(base.unit).trim() : null,
    emoji: base.emoji ? String(base.emoji) : '',
    needsReview: Boolean(base.needs_review),
    isApprox: Boolean(base.approximate),
    qtyRange: base.quantityRange || null,
    confidence: base.confidence || null,
    source: base.source || null,
  };
}

function parseInstruction(raw: RawInstruction): { text: string; source: string; confidence: string; isInferred: boolean } {
  if (typeof raw === 'string') return { text: raw, source: '', confidence: 'high', isInferred: false };
  const obj = raw as any;
  const text = obj.instruction || obj.text || '';
  const source = obj.source || '';
  const confidence = obj.confidence || 'medium';
  const isInferred = source === 'ai_inferred';
  return { text, source, confidence, isInferred };
}

function convertUnits(qty: string, unit: string, toMetric: boolean): { q: string; u: string } {
  const n = parseFloat(qty.replace(',', '.'));
  if (isNaN(n)) return { q: qty, u: unit };
  const u = unit.toLowerCase().trim().replace(/s$/, '');
  if (toMetric) {
    if (u === 'cup')  return { q: String(Math.round(n * 240)), u: 'ml' };
    if (u === 'tbsp' || u === 'tablespoon') return { q: String(Math.round(n * 15)), u: 'ml' };
    if (u === 'tsp'  || u === 'teaspoon')  return { q: String(Math.round(n * 5)),  u: 'ml' };
    if (u === 'oz'   || u === 'ounce')     return { q: String(Math.round(n * 28.35 * 10) / 10), u: 'g' };
    if (u === 'lb'   || u === 'pound')     return { q: String(Math.round(n * 453.6)), u: 'g' };
  } else {
    if (u === 'ml' || u === 'milliliter') {
      if (n >= 240) return { q: String(Math.round(n / 240 * 10) / 10), u: 'cups' };
      if (n >= 15)  return { q: String(Math.round(n / 15 * 10) / 10), u: 'tbsp' };
      return { q: String(Math.round(n / 5 * 10) / 10), u: 'tsp' };
    }
    if (u === 'l'  || u === 'liter' || u === 'litre') return { q: String(Math.round(n * 4.23 * 10) / 10), u: 'cups' };
    if (u === 'g'  || u === 'gram')      return { q: String(Math.round(n / 28.35 * 10) / 10), u: 'oz' };
    if (u === 'kg' || u === 'kilogram')  return { q: String(Math.round(n * 2.205 * 10) / 10), u: 'lbs' };
  }
  return { q: qty, u: unit };
}

function formatQty(qty: string | null, unit: string | null, scale: number, scaleQty: ((q: string, s: number) => string) | undefined, useMetric: boolean): string {
  if (!qty) return '';
  let q = qty;
  if (scale !== 1 && scaleQty) {
    const scaled = scaleQty(qty, scale);
    if (scaled && !scaled.includes('NaN')) q = scaled.trim();
  }
  if (unit) {
    const conv = convertUnits(q, unit, useMetric);
    return `${conv.q} ${conv.u}`;
  }
  return q;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRACTICAL SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

const PracticalSummarySection: React.FC<{ ps: PracticalSummary }> = ({ ps }) => {
  if (!ps.what_it_is && !ps.key_technique && (!ps.important_notes || ps.important_notes.length === 0)) return null;

  return (
    <div className="mx-6 mb-5 rounded-2xl overflow-hidden border border-gray-100">
      {/* Lead — what it is */}
      {ps.what_it_is && (
        <div className="px-5 pt-4 pb-3">
          <p className="text-[13px] text-gray-600 leading-relaxed font-medium">{ps.what_it_is}</p>
        </div>
      )}

      {/* Key technique — accent strip */}
      {ps.key_technique && (
        <div className="mx-4 mb-3 flex items-start gap-2.5 bg-primary-50 rounded-xl px-3.5 py-2.5">
          <Zap size={13} className="text-primary-500 flex-shrink-0 mt-[2px]" />
          <p className="text-[12px] text-primary-700 leading-relaxed font-semibold">
            <span className="font-black uppercase tracking-wide text-[10px] text-primary-400 mr-1.5">Technique</span>
            {ps.key_technique}
          </p>
        </div>
      )}

      {/* Important notes */}
      {ps.important_notes && ps.important_notes.length > 0 && (
        <div className="px-4 pb-4 space-y-1.5">
          {ps.important_notes.map((note, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-[3px] flex-shrink-0 w-4 h-4 rounded-full bg-amber-100 flex items-center justify-center">
                <span className="text-amber-600 text-[9px] font-black">!</span>
              </span>
              <p className="text-[12px] text-gray-500 leading-relaxed">{note}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// NEEDS REVIEW PANEL
// ─────────────────────────────────────────────────────────────────────────────

const NeedsReviewPanel: React.FC<{ items: MissingInfoItem[] }> = ({ items }) => {
  const [open, setOpen] = React.useState(false);
  if (!items || items.length === 0) return null;

  const highSeverity = items.filter(i => i.severity === 'high');
  const medSeverity  = items.filter(i => i.severity === 'medium' || !i.severity);

  return (
    <div className="mx-6 mb-5 rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
          <span className="text-[12px] font-black text-amber-800 uppercase tracking-widest">
            Needs review
          </span>
          <span className="text-[11px] font-black text-amber-600 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
            {items.length}
          </span>
        </div>
        {open
          ? <ChevronUp size={14} className="text-amber-500 flex-shrink-0" />
          : <ChevronDown size={14} className="text-amber-500 flex-shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-amber-200/60 pt-3">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                item.severity === 'high' ? 'bg-red-400' :
                item.severity === 'medium' ? 'bg-amber-400' : 'bg-yellow-300'
              }`} />
              <div>
                <p className="text-[12px] text-amber-900 leading-relaxed">{item.message}</p>
                {item.suggestion && (
                  <p className="text-[11px] text-amber-600 mt-0.5 italic">{item.suggestion}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// INGREDIENT ROW
// ─────────────────────────────────────────────────────────────────────────────

interface IngRowProps {
  id: string;
  raw: RawIngredient;
  servingScale: number;
  scaleQuantity?: (q: string, s: number) => string;
  checked: boolean;
  onToggle: (id: string) => void;
  useMetric: boolean;
}

const IngredientRow: React.FC<IngRowProps> = ({ id, raw, servingScale, scaleQuantity, checked, onToggle, useMetric }) => {
  const { name, note, quantity, unit, emoji, needsReview, isApprox, qtyRange, confidence } = parseRawIngredient(raw);

  // Format display quantity
  let displayQty = '';
  let displayUnit = unit || '';

  if (qtyRange) {
    // Range: "320–350 g"
    const u = qtyRange.unit || unit || '';
    displayQty = `${qtyRange.min}–${qtyRange.max}`;
    displayUnit = u;
  } else if (quantity) {
    const fmted = formatQty(quantity, unit, servingScale, scaleQuantity, useMetric);
    const parts = fmted.trim().split(/\s+/);
    displayQty = parts[0] || '';
    displayUnit = parts.slice(1).join(' ') || '';
  }

  const hasMeasurement = displayQty || displayUnit;
  const isLowConfidence = confidence === 'low';

  return (
    <li
      onClick={() => onToggle(id)}
      className={`flex items-start gap-3 px-5 py-2.5 cursor-pointer select-none group transition-all ${
        checked ? 'opacity-40' : 'hover:bg-gray-50/60'
      }`}
    >
      {/* Completion indicator */}
      <div className="flex-shrink-0 mt-[3px]">
        <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center transition-all ${
          checked
            ? 'border-gray-300 bg-gray-100'
            : needsReview
              ? 'border-amber-300 bg-transparent group-hover:border-amber-400'
              : 'border-gray-200 bg-transparent group-hover:border-primary-300'
        }`}>
          {checked && <Check size={9} className="text-gray-400" strokeWidth={3} />}
        </div>
      </div>

      {/* Emoji */}
      {emoji && (
        <span className={`text-[15px] leading-none flex-shrink-0 mt-[1px] transition-all ${checked ? 'grayscale' : ''}`}>
          {emoji}
        </span>
      )}

      {/* Name + quantity */}
      <div className="flex-1 min-w-0 flex items-baseline flex-wrap gap-x-1.5 gap-y-0">
        {/* Quantity — primary color */}
        {hasMeasurement && !needsReview && (
          <span className={`text-[13px] font-black transition-all ${
            checked ? 'text-gray-300' : 'text-primary-600'
          }`}>
            {displayQty}{displayUnit ? <span className="font-bold"> {displayUnit}</span> : null}
          </span>
        )}

        {/* Name */}
        <span className={`text-[13px] leading-snug transition-all ${
          checked
            ? 'text-gray-300 line-through decoration-gray-200'
            : needsReview
              ? 'text-gray-700'
              : 'text-gray-800 font-medium'
        }`}>
          {name}
        </span>

        {/* Approx indicator */}
        {isApprox && !checked && (
          <span className="text-[10px] text-gray-400 font-medium italic">(approx.)</span>
        )}

        {/* Note */}
        {note && !checked && (
          <span className="text-[11px] text-gray-400 italic">({note})</span>
        )}

        {/* Needs review — inline, subtle */}
        {needsReview && !checked && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200/80 rounded-full px-1.5 py-0.5 leading-none">
            <span className="w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
            qty unknown
          </span>
        )}
      </div>
    </li>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP ROW
// ─────────────────────────────────────────────────────────────────────────────

interface StepRowProps {
  index: number;
  raw: RawInstruction;
  checked: boolean;
  onToggle: (i: number) => void;
}

const StepRow: React.FC<StepRowProps> = ({ index, raw, checked, onToggle }) => {
  const { text, isInferred } = parseInstruction(raw);

  return (
    <div
      onClick={() => onToggle(index)}
      className={`flex items-start gap-3.5 cursor-pointer select-none transition-all group ${
        checked ? 'opacity-40' : ''
      }`}
    >
      {/* Step number circle */}
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
        checked
          ? 'bg-gray-100 border-2 border-gray-200'
          : 'bg-white border-2 border-tertiary-200 group-hover:border-tertiary-400'
      }`}>
        {checked
          ? <Check size={12} className="text-gray-400" strokeWidth={3} />
          : <span className="text-[11px] font-black text-tertiary-600">{index + 1}</span>
        }
      </div>

      {/* Step text */}
      <div className="flex-1 pt-[4px]">
        <p className={`text-[13px] leading-relaxed transition-all ${
          checked ? 'text-gray-300' : 'text-gray-600 font-medium'
        } ${isInferred && !checked ? 'italic' : ''}`}>
          {text}
        </p>
        {isInferred && !checked && (
          <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-black text-gray-300 uppercase tracking-wide">
            <span className="w-1 h-1 rounded-full bg-gray-300" />
            inferred
          </span>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TIME CELL
// ─────────────────────────────────────────────────────────────────────────────

const TimeCell: React.FC<{ icon: React.ReactNode; label: string; value: string | null; accent?: string }> = ({ icon, label, value, accent }) => {
  if (!value) return null;
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-4 px-2 text-center">
      <div className={accent ? `text-${accent}` : 'text-gray-400'}>{icon}</div>
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
      <span className="text-[13px] font-black text-gray-900 leading-tight">{value}</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPILATION CARD
// ─────────────────────────────────────────────────────────────────────────────

const RecipeCompilationCard: React.FC<{ recipe: RecipeForCard }> = ({ recipe }) => {
  const ideas = recipe.ideas ?? [];
  if (!ideas.length) return null;
  return (
    <div className="mt-4 space-y-2">
      {ideas.map((idea, i) => (
        <div key={i} className="bg-white border border-gray-100 rounded-xl p-3.5 flex items-start gap-3 shadow-sm">
          {idea.emoji && <span className="text-xl leading-none flex-shrink-0 mt-0.5">{idea.emoji}</span>}
          <div>
            <p className="font-bold text-gray-900 text-sm leading-snug">{idea.headline}</p>
            {idea.text && <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{idea.text}</p>}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const RecipeDetailsCard: React.FC<RecipeDetailsCardProps> = ({
  recipe,
  recipeId = 'recipe',
  recipeName = 'Recipe',
  servingScale = 1,
  scaleQuantity,
  onServingScaleChange,
  useMetric = true,
  onToggleMetric,
  onAddToShoppingList,
}) => {
  const { t } = useTranslation(['videoDetail']);

  const [checkedIds,   setCheckedIds]   = React.useState<Set<string>>(() => new Set());
  const [checkedSteps, setCheckedSteps] = React.useState<Set<number>>(() => new Set());
  const [added, setAdded] = React.useState(false);

  if (recipe.is_compilation) return <RecipeCompilationCard recipe={recipe} />;

  // ── Data extraction ──────────────────────────────────────────────────────

  const flat:   RawIngredient[]  = Array.isArray(recipe.ingredients)        ? recipe.ingredients        : [];
  const groups: IngredientGroup[] = Array.isArray(recipe.ingredients_groups) ? recipe.ingredients_groups : [];
  const hasGroups = groups.length > 0;
  const instructions: RawInstruction[] = Array.isArray(recipe.instructions) ? recipe.instructions : [];
  const tips:  string[] = Array.isArray(recipe.tips)  ? recipe.tips  : [];
  const missingInfo: MissingInfoItem[] = Array.isArray(recipe.missingInfo) ? recipe.missingInfo : [];

  const notes: string[] = recipe.notes
    ? Array.isArray(recipe.notes) ? recipe.notes : [recipe.notes]
    : [];

  const practicalSummary = recipe.practical_summary ?? null;

  // Build flat ingredient list for shopping list / id tracking
  const allIngredients = React.useMemo(() => {
    const list: { id: string; raw: RawIngredient }[] = [];
    if (hasGroups) {
      groups.forEach((g, gi) =>
        (g.items ?? []).forEach((item, ii) => list.push({ id: `g${gi}-i${ii}`, raw: item }))
      );
    } else {
      flat.forEach((item, i) => list.push({ id: `f${i}`, raw: item }));
    }
    return list;
  }, [flat, groups, hasGroups]);

  // ── Serving scale ────────────────────────────────────────────────────────

  const baseServings = React.useMemo(() => {
    const str = toStr(recipe.servings);
    const m = str.match(/(\d+(\.\d+)?)/);
    if (!m) return 1;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [recipe.servings]);

  const currentScale    = servingScale || 1;
  const currentServings = Math.max(1, Math.round(baseServings * currentScale));
  const hasServings     = !!toStr(recipe.servings).trim();

  const handleServingsDelta = (delta: number) => {
    if (!onServingScaleChange) return;
    const next = Math.max(1, currentServings + delta);
    onServingScaleChange(Number((next / baseServings).toFixed(3)));
  };

  // ── Times ────────────────────────────────────────────────────────────────

  const prepFmt  = formatMinutes(recipe.prep_time);
  const cookFmt  = formatMinutes(recipe.cook_time);
  const restFmt  = formatMinutes(recipe.rest_time);
  const totalFmt = formatMinutes(recipe.total_time);

  const timeCells = [
    { label: 'Prep',  value: prepFmt,  icon: <Clock  size={14} />, accent: 'tertiary-500' },
    { label: 'Cook',  value: cookFmt,  icon: <Flame  size={14} />, accent: 'tertiary-500' },
    { label: 'Rest',  value: restFmt,  icon: <Moon   size={14} />, accent: 'tertiary-500' },
    { label: 'Total', value: totalFmt, icon: <Clock  size={14} />, accent: 'gray-400'     },
  ].filter(c => c.value);

  // ── Toggles ──────────────────────────────────────────────────────────────

  const toggleIngredient = (id: string) =>
    setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleStep = (i: number) =>
    setCheckedSteps(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

  // ── Add to shopping list ─────────────────────────────────────────────────

  const handleAddToList = () => {
    if (!onAddToShoppingList || allIngredients.length === 0) return;
    const items: ShoppingListItem[] = allIngredients.map(({ id, raw }) => {
      const { name, quantity, unit, emoji, qtyRange } = parseRawIngredient(raw);
      let qty = quantity || undefined;
      let u   = unit || undefined;

      if (qtyRange) {
        qty = String(qtyRange.min);
        u   = qtyRange.unit || unit || undefined;
      } else if (qty && u) {
        const conv = convertUnits(qty, u, useMetric);
        qty = conv.q;
        u   = conv.u;
      } else if (qty && scaleQuantity && currentScale !== 1) {
        const scaled = scaleQuantity(qty, currentScale);
        if (scaled && !scaled.includes('NaN')) qty = scaled;
      }

      return { id: `${recipeId}_${id}`, name, quantity: qty, unit: u, emoji: emoji || undefined, recipeTitle: recipeName, checked: false };
    });
    onAddToShoppingList(items);
    setAdded(true);
    setTimeout(() => setAdded(false), 3000);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  let globalIdx = 0;

  return (
    <div className="bg-white border border-gray-100 rounded-[24px] shadow-sm overflow-hidden mt-4 mb-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2.5">
          <ChefHat size={18} className="text-tertiary-500" />
          <h3 className="font-bold text-gray-900 text-base tracking-tight">
            {t('videoDetail:recipeDetails', 'Recipe Details')}
          </h3>
        </div>
        {onToggleMetric && (
          <button
            onClick={() => onToggleMetric(!useMetric)}
            className="px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-600 rounded-xl text-[11px] font-bold hover:bg-gray-100 transition-colors"
          >
            {useMetric ? 'Imperial' : 'Metric'}
          </button>
        )}
      </div>

      {/* ── Time grid ── */}
      {timeCells.length > 0 && (
        <div
          className="grid border-b border-gray-50"
          style={{ gridTemplateColumns: `repeat(${timeCells.length}, 1fr)` }}
        >
          {timeCells.map((cell, i) => (
            <div key={i} className={`${i > 0 ? 'border-l border-gray-50' : ''}`}>
              <TimeCell icon={cell.icon} label={cell.label} value={cell.value} accent={cell.accent} />
            </div>
          ))}
        </div>
      )}

      {/* ── Practical summary ── */}
      {practicalSummary && (
        <div className="pt-5">
          <div className="px-5 mb-3">
            <h4 className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Summary</h4>
          </div>
          <PracticalSummarySection ps={practicalSummary} />
        </div>
      )}

      {/* ── Needs Review ── */}
      {missingInfo.length > 0 && <NeedsReviewPanel items={missingInfo} />}

      {/* ── Ingredients ── */}
      {(flat.length > 0 || groups.length > 0) && (
        <div className="border-t border-gray-50 pt-5 pb-4">
          {/* Section header row */}
          <div className="flex items-center justify-between px-5 mb-4 gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                {t('videoDetail:ingredients', 'Ingredients')}
              </h4>

              {/* Serving scale control */}
              {hasServings && onServingScaleChange && (
                <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-xl px-2 py-1">
                  <button type="button" onClick={() => handleServingsDelta(-1)} className="w-5 h-5 rounded-full bg-white border border-gray-200 text-gray-600 flex items-center justify-center text-[11px] font-bold hover:bg-gray-100 transition">
                    −
                  </button>
                  <span className="text-[12px] font-extrabold text-gray-800 tabular-nums min-w-[16px] text-center">
                    {currentServings}
                  </span>
                  <button type="button" onClick={() => handleServingsDelta(1)} className="w-5 h-5 rounded-full bg-white border border-gray-200 text-gray-600 flex items-center justify-center text-[11px] font-bold hover:bg-gray-100 transition">
                    +
                  </button>
                  <span className="text-[10px] text-gray-400 font-medium ml-0.5">serv.</span>
                </div>
              )}
            </div>

            {/* Add to shopping list */}
            {onAddToShoppingList && allIngredients.length > 0 && (
              <button
                type="button"
                onClick={handleAddToList}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                style={{
                  background: added ? 'rgba(21,128,61,0.07)' : 'rgba(124,58,237,0.07)',
                  color:      added ? '#15803d'               : '#7c3aed',
                  border:     added ? '1px solid rgba(21,128,61,0.18)' : '1px solid rgba(124,58,237,0.18)',
                }}
              >
                {added ? <Check size={12} strokeWidth={2.5} /> : <ShoppingCart size={12} strokeWidth={2} />}
                {added ? 'Added' : 'Add to list'}
              </button>
            )}
          </div>

          {/* Ingredient rows */}
          <div className="divide-y divide-gray-50/80">
            {hasGroups
              ? groups.map((group, gi) => (
                  <div key={gi}>
                    {group.title && (
                      <div className="px-5 pt-3 pb-1.5">
                        <h5 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
                          {group.title || group.group}
                        </h5>
                      </div>
                    )}
                    <ul>
                      {(group.items ?? []).map((item, ii) => {
                        const id = `g${gi}-i${ii}`;
                        globalIdx++;
                        return (
                          <IngredientRow
                            key={id} id={id} raw={item}
                            servingScale={currentScale} scaleQuantity={scaleQuantity}
                            checked={checkedIds.has(id)} onToggle={toggleIngredient}
                            useMetric={useMetric}
                          />
                        );
                      })}
                    </ul>
                  </div>
                ))
              : <ul className="divide-y divide-gray-50/80">
                  {flat.map((item, i) => {
                    const id = `f${i}`;
                    return (
                      <IngredientRow
                        key={id} id={id} raw={item}
                        servingScale={currentScale} scaleQuantity={scaleQuantity}
                        checked={checkedIds.has(id)} onToggle={toggleIngredient}
                        useMetric={useMetric}
                      />
                    );
                  })}
                </ul>
            }
          </div>
        </div>
      )}

      {/* ── Directions ── */}
      {instructions.length > 0 && (
        <div className="border-t border-gray-50 px-5 py-5">
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-5">
            {t('videoDetail:directions', 'Directions')}
          </h4>
          <div className="space-y-5">
            {instructions.map((step, i) => (
              <StepRow key={i} index={i} raw={step} checked={checkedSteps.has(i)} onToggle={toggleStep} />
            ))}
          </div>
        </div>
      )}

      {/* ── Chef's Tips ── */}
      {(tips.length > 0 || notes.length > 0) && (
        <div className="border-t border-amber-100 bg-amber-50/40 px-5 py-5">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb size={15} className="text-amber-500" />
            <h4 className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
              {t('videoDetail:chefsNotes', "Chef's Tips")}
            </h4>
          </div>
          <ul className="space-y-2.5">
            {tips.map((tip, i) => (
              <li key={`tip-${i}`} className="flex items-start gap-2.5 text-[13px] text-gray-600">
                <span className="flex-shrink-0 mt-[3px] w-1 h-1 rounded-full bg-amber-400" />
                <span className="leading-relaxed">{tip}</span>
              </li>
            ))}
          </ul>
          {notes.length > 0 && (
            <div className="mt-3 pt-3 border-t border-amber-100/80">
              {notes.map((note, i) => (
                <p key={i} className="text-[12px] text-gray-400 leading-relaxed">
                  <span className="font-bold text-gray-500">Note: </span>{note}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RecipeDetailsCard;