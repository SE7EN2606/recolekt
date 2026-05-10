import RecipeSecondaryContent from '../features/recipe-secondary/RecipeSecondaryContent';
import RecipeNutritionSummary from '../features/recipe-secondary/RecipeNutritionSummary';
import { RecipeIngredients } from '../features/recipe-core/RecipeIngredients';
import RecipeDirections from '../features/recipe-core/RecipeDirections';
import RecipeAskPanel from '../features/recipe-core/RecipeAskPanel';
import RecipeMainView from '../features/recipe-layout/RecipeMainView';
import IngredientRow from '../features/recipe-core/rows/IngredientRow';
import StepRow from '../features/recipe-core/rows/StepRow';
import TimeCell from '../features/recipe-core/rows/TimeCell';
import RecipeCompilationCard from '../features/recipe-core/cards/RecipeCompilationCard';
import React, { useState } from 'react';
import {
  ChefHat, Clock, Flame, Moon, Lightbulb,
  ShoppingCart, Check,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CookModeModal from './CookModeModal';
import { apiUrl } from "../utils/videoDetailUtils";

const getRecipeAssistantToken = (): string => {
  try {
    return String(
      (window as any).__REKOLEKT_TOKEN__ ||
      localStorage.getItem("auth_token") ||
      localStorage.getItem("token") ||
      localStorage.getItem("access_token") ||
      localStorage.getItem("jwt") ||
      ""
    ).replace(/^Bearer\s+/i, "").trim();
  } catch {
    return "";
  }
};

type RecipeAssistantHistoryEntry = {
  question: string;
  answer: string;
  createdAt?: string;
  created_at?: string;
};

type RecipeAssistantHistoryItem = RecipeAssistantHistoryEntry;

type RecipeAssistantResponse = {
  history?: RecipeAssistantHistoryEntry[];
  answer?: string;
  error?: string;
  sourcesUsed?: string[];
  missingInfo?: string[];
  model?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type RawInstruction =
  | string
  | {
      instruction?: string | null;
      text?: string | null;
      source?: string | null;
      confidence?: string | null;
      needs_review?: boolean | null;
      userEdited?: boolean | null;
    };

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

export interface IngredientSection {
  title?: string;
  group?: string;
  name?: string;
  section?: string;
  component?: string;
  ingredients?: RawIngredient[];
  items?: RawIngredient[];
  children?: RawIngredient[];
}

export interface InstructionSection {
  title?: string;
  group?: string;
  name?: string;
  section?: string;
  phase?: string;
  part?: string;
  instructions?: RawInstruction[];
  steps?: RawInstruction[];
  items?: RawInstruction[];
  children?: RawInstruction[];
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
  recipe_kind?: 'full_recipe' | 'technique_with_ingredients' | 'pure_technique' | string | null;
  cuisine?: string | null;
  style?: string | null;
  cooking_style?: string | null;
  ingredients_groups?: IngredientGroup[] | null;
  ingredient_sections?: IngredientSection[] | null;
  ingredients_sections?: IngredientSection[] | null;
  ingredientSections?: IngredientSection[] | null;
  ingredientsSections?: IngredientSection[] | null;
  ingredients?: RawIngredient[] | null;
  instruction_sections?: InstructionSection[] | null;
  instructions_sections?: InstructionSection[] | null;
  instructionSections?: InstructionSection[] | null;
  instructionsSections?: InstructionSection[] | null;
  method_sections?: InstructionSection[] | null;
  step_sections?: InstructionSection[] | null;
  steps_sections?: InstructionSection[] | null;
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
  const str = toStr(raw).trim().toLowerCase();
  if (!str) return null;

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    if (raw < 60) return `${Math.round(raw)} min`;
    const h = Math.floor(raw / 60);
    const m = Math.round(raw % 60);
    if (m === 0) return h === 1 ? '1 hr' : `${h} hr`;
    return `${h} hr ${m} min`;
  }

  const hourMatch = str.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|heure|heures)/i);
  const minuteMatch = str.match(/(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)/i);

  if (hourMatch || minuteMatch) {
    const hours = hourMatch ? Number(hourMatch[1]) : 0;
    const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
    const total = hours * 60 + minutes;

    if (!Number.isFinite(total) || total <= 0) return null;
    if (total < 60) return `${Math.round(total)} min`;

    const h = Math.floor(total / 60);
    const m = Math.round(total % 60);
    if (m === 0) return h === 1 ? '1 hr' : `${h} hr`;
    return `${h} hr ${m} min`;
  }

  const n = parseFloat(str);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 60) return `${Math.round(n)} min`;

  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  if (m === 0) return h === 1 ? '1 hr' : `${h} hr`;
  return `${h} hr ${m} min`;
}

function splitNote(label: string): { mainLabel: string; note: string } {
  const m = label.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  return m ? { mainLabel: m[1].trim(), note: m[2].trim() } : { mainLabel: label, note: '' };
}

function parseRawIngredient(raw: RawIngredient) {
  if (typeof raw === 'string') {
    const { mainLabel, note } = splitNote(raw.trim());
    return { name: mainLabel, note, quantity: null as string | null, unit: null as string | null, emoji: '', needsReview: false, isApprox: false, qtyRange: null as any };
  }
  const base = raw as any;
  const { mainLabel, note } = splitNote((base.item || base.name || '').trim());
  return {
    name: mainLabel,
    note: base.note || note || '',
    quantity: base.quantity !== undefined && base.quantity !== null ? String(base.quantity).trim() : null as string | null,
    unit: base.unit ? String(base.unit).trim() : null as string | null,
    emoji: base.emoji ? String(base.emoji) : '',
    needsReview: Boolean(base.needs_review),
    isApprox: Boolean(base.approximate),
    qtyRange: base.quantityRange || null,
  };
}

function parseInstruction(raw: RawInstruction): { text: string; isInferred: boolean } {
  if (typeof raw === 'string') return { text: raw, isInferred: false };
  const obj = raw as any;
  return { text: obj.instruction || obj.text || '', isInferred: (obj.source || '') === 'ai_inferred' };
}

function normalizeForCountMatch(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ');
}

function isCountStyleIngredient(unit: string | null, name?: string): boolean {
  const normalizedUnit = normalizeForCountMatch(unit).replace(/s$/, '');
  const normalizedName = normalizeForCountMatch(name);

  const countUnits = new Set([
    'egg',
    'yolk',
    'clove',
    'head',
    'leaf',
    'bay leaf',
    'sprig',
    'branch',
    'bunch',
    'piece',
    'slice',
  ]);

  if (normalizedUnit && countUnits.has(normalizedUnit)) return true;

  return /\b(egg|eggs|yolk|yolks|clove|cloves|garlic head|head of garlic|tete d ail|tetes d ail|leaf|leaves|bay leaf|bay leaves|feuille de laurier|feuilles de laurier|sprig|sprigs|branch|branches|branche de thym|branches de thym|brin de thym|brins de thym)\b/.test(normalizedName);
}

function normalizeCountQuantity(qty: string, unit: string | null, name?: string): string {
  if (!isCountStyleIngredient(unit, name)) return qty;

  const n = Number(String(qty).replace(',', '.'));
  if (!Number.isFinite(n)) return qty;

  // Kitchen count ingredients should not show values like 1.2 garlic heads or 2.4 bay leaves.
  return String(Math.max(1, Math.round(n)));
}


function convertUnits(qty: string, unit: string, toMetric: boolean): { q: string; u: string } {
  const n = parseFloat(qty.replace(',', '.'));
  if (isNaN(n)) return { q: qty, u: unit };
  const u = unit.toLowerCase().trim().replace(/s$/, '');
  if (toMetric) {
    if (u === 'cup')  return { q: String(Math.round(n * 240)), u: 'ml' };
    if (u === 'tbsp' || u === 'tablespoon') return { q: String(Math.round(n * 15)), u: 'ml' };
    if (u === 'tsp'  || u === 'teaspoon')  return { q: String(Math.round(n * 5)), u: 'ml' };
    if (u === 'oz'   || u === 'ounce')     return { q: String(Math.round(n * 28.35 * 10) / 10), u: 'g' };
    if (u === 'lb'   || u === 'pound')     return { q: String(Math.round(n * 453.6)), u: 'g' };
  } else {
    if (u === 'ml' || u === 'milliliter') {
      if (n >= 240) return { q: String(Math.round(n / 240 * 10) / 10), u: 'cups' };
      if (n >= 15)  return { q: String(Math.round(n / 15 * 10) / 10), u: 'tbsp' };
      return { q: String(Math.round(n / 5 * 10) / 10), u: 'tsp' };
    }
    if (u === 'l'  || u === 'liter' || u === 'litre') return { q: String(Math.round(n * 4.23 * 10) / 10), u: 'cups' };
    if (u === 'g'  || u === 'gram')     return { q: String(Math.round(n / 28.35 * 10) / 10), u: 'oz' };
    if (u === 'kg' || u === 'kilogram') return { q: String(Math.round(n * 2.205 * 10) / 10), u: 'lbs' };
  }
  return { q: qty, u: unit };
}

function formatQty(qty: string | null, unit: string | null, scale: number, scaleQty: ((q: string, s: number) => string) | undefined, useMetric: boolean, name?: string): string {
  if (!qty) return '';
  let q = qty;
  if (scale !== 1 && scaleQty) {
    const scaled = scaleQty(qty, scale);
    if (scaled && !scaled.includes('NaN')) q = scaled.trim();
  }
  q = normalizeCountQuantity(q, unit, name);

  if (unit) {
    const conv = convertUnits(q, unit, useMetric);
    return `${conv.q} ${conv.u}`;
  }
  return q;
}

// Assumed quantity for ingredients whose quantity was not stated in the source
function assumedLabel(name: string): string {
  const n = name.toLowerCase();
  if (n.match(/\b(salt|pepper|poivre|sel|seasoning|spice|paprika|cumin|oregano)/)) return 'to taste';
  if (n.match(/\b(stock|broth|water|bouillon|fond|milk|cream|wine|oil|sauce|liquid)/)) return 'as needed';
  if (n.match(/\b(thyme|rosemary|bay|parsley|herb|basilic|laurier|thym|sage)/)) return 'a few sprigs';
  return 'to taste';
}

type NormalizedIngredientSection = { title: string; items: RawIngredient[] };
type NormalizedInstructionSection = { title: string; instructions: RawInstruction[] };

function firstArray(...values: any[]): any[] | null {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return null;
}

function cleanSectionTitle(value: any): string {
  const text = String(value ?? '').trim();
  if (!text || text.toLowerCase() === 'general') return '';
  return text.replace(/:$/, '').trim();
}

function objectSectionTitle(raw: any, keys: string[]): string {
  if (!raw || typeof raw !== 'object') return '';
  for (const key of keys) {
    const direct = cleanSectionTitle(raw?.[key]);
    if (direct) return direct;
  }
  const metaSection = cleanSectionTitle(raw?.meta?.section || raw?.metadata?.section);
  return metaSection;
}

function possibleSectionHeading(raw: RawIngredient | RawInstruction): string {
  if (typeof raw !== 'string') return '';
  const text = raw.trim().replace(/:$/, '').trim();
  if (!text || text.length > 80) return '';
  if (/^\d+[\).\s]/.test(text)) return '';
  if (/\b(cup|cups|tbsp|tablespoon|tsp|teaspoon|g|gram|kg|ml|l|oz|lb|pound|pinch)\b/i.test(text)) return '';
  if (/^(for|the\s+|cream\s+cheese|frosting|dough|base|topping|filling|sauce|marinade|dressing|method|steps?|instructions?)/i.test(text)) {
    return text;
  }
  return '';
}

function groupIngredientsBySection(flat: RawIngredient[]): NormalizedIngredientSection[] {
  const sections: NormalizedIngredientSection[] = [];
  const byKey = new Map<string, NormalizedIngredientSection>();
  let currentTitle = '';

  const getOrCreate = (title: string) => {
    const key = title || '__default__';
    let section = byKey.get(key);
    if (!section) {
      section = { title, items: [] };
      byKey.set(key, section);
      sections.push(section);
    }
    return section;
  };

  flat.filter(Boolean).forEach((item) => {
    const heading = possibleSectionHeading(item);
    if (heading) {
      currentTitle = heading;
      getOrCreate(currentTitle);
      return;
    }

    const title =
      objectSectionTitle(item, ['section', 'group', 'category', 'part', 'component', 'heading']) ||
      currentTitle;

    getOrCreate(title).items.push(item);
  });

  return sections.filter((section) => section.items.length > 0);
}

function normalizeIngredientSections(recipe: RecipeForCard): NormalizedIngredientSection[] {
  const r = recipe as any;

  const explicitSections = firstArray(
    r.ingredient_sections,
    r.ingredients_sections,
    r.ingredientSections,
    r.ingredientsSections,
  );

  if (explicitSections?.length) {
    const mapped = explicitSections
      .map((section: any) => {
        const items = firstArray(section?.ingredients, section?.items, section?.children) ?? [];
        return {
          title: cleanSectionTitle(section?.title || section?.group || section?.name || section?.section || section?.component),
          items: items.filter(Boolean) as RawIngredient[],
        };
      })
      .filter((section: NormalizedIngredientSection) => section.items.length > 0);

    if (mapped.length) return mapped;
  }

  const groups = Array.isArray(recipe.ingredients_groups) ? recipe.ingredients_groups : [];
  if (groups.length) {
    return groups
      .map((group) => ({
        title: cleanSectionTitle(group.title || group.group),
        items: Array.isArray(group.items) ? group.items.filter(Boolean) : [],
      }))
      .filter((section) => section.items.length > 0);
  }

  const flat = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  return groupIngredientsBySection(flat);
}

function groupInstructionsBySection(flat: RawInstruction[]): NormalizedInstructionSection[] {
  const sections: NormalizedInstructionSection[] = [];
  const byKey = new Map<string, NormalizedInstructionSection>();
  let currentTitle = '';

  const getOrCreate = (title: string) => {
    const key = title || '__default__';
    let section = byKey.get(key);
    if (!section) {
      section = { title, instructions: [] };
      byKey.set(key, section);
      sections.push(section);
    }
    return section;
  };

  flat.filter(Boolean).forEach((step) => {
    const heading = possibleSectionHeading(step);
    if (heading) {
      currentTitle = heading;
      getOrCreate(currentTitle);
      return;
    }

    const title =
      objectSectionTitle(step, ['section', 'group', 'phase', 'part', 'stage', 'heading']) ||
      currentTitle;

    getOrCreate(title).instructions.push(step);
  });

  return sections.filter((section) => section.instructions.length > 0);
}

function normalizeInstructionSections(recipe: RecipeForCard): NormalizedInstructionSection[] {
  const r = recipe as any;

  const explicitSections = firstArray(
    r.instruction_sections,
    r.instructions_sections,
    r.instructionSections,
    r.instructionsSections,
    r.method_sections,
    r.step_sections,
    r.steps_sections,
  );

  if (explicitSections?.length) {
    const mapped = explicitSections
      .map((section: any) => {
        const instructions = firstArray(section?.instructions, section?.steps, section?.items, section?.children) ?? [];
        return {
          title: cleanSectionTitle(section?.title || section?.group || section?.name || section?.section || section?.phase || section?.part),
          instructions: instructions.filter(Boolean) as RawInstruction[],
        };
      })
      .filter((section: NormalizedInstructionSection) => section.instructions.length > 0);

    if (mapped.length) return mapped;
  }

  const flat = Array.isArray(recipe.instructions) ? recipe.instructions : [];
  return groupInstructionsBySection(flat);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPILATION CARD
// ─────────────────────────────────────────────────────────────────────────────


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
  const [isCookModeOpen, setIsCookModeOpen] = React.useState(false);
  const [savedCookStep, setSavedCookStep] = React.useState<number | null>(null);
  type RecipeTabKey = 'ingredients' | 'steps' | 'nutrition' | 'ask';
  const [activeRecipeTab, setActiveRecipeTab] = React.useState<RecipeTabKey>('nutrition');
  const [askQuestion, setAskQuestion] = useState("");
  const [askAnswer, setAskAnswer] = useState("");
  const [askError, setAskError] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askHistory, setAskHistory] = useState<RecipeAssistantHistoryItem[]>([]);

  if (recipe.is_compilation) return <RecipeCompilationCard recipe={recipe} />;

  const ingredientSections = normalizeIngredientSections(recipe);
  const hasStructuredIngredientSections =
    ingredientSections.length > 1 || Boolean(ingredientSections[0]?.title);

  const flat: RawIngredient[] = hasStructuredIngredientSections
    ? []
    : ingredientSections[0]?.items ?? [];

  const groups: IngredientGroup[] = hasStructuredIngredientSections
    ? ingredientSections.map((section) => ({ title: section.title, items: section.items }))
    : [];

  const hasGroups = groups.length > 0;

  const instructionSections = normalizeInstructionSections(recipe);
  const instructions: RawInstruction[] = instructionSections.flatMap((section) => section.instructions);
  const tips:   string[]          = Array.isArray(recipe.tips)  ? recipe.tips  : [];

  const notes: string[] = recipe.notes
    ? Array.isArray(recipe.notes) ? recipe.notes : [recipe.notes]
    : [];

  const cookProgressKey = React.useMemo(
    () => `recolekt:cook-progress:${recipeId}`,
    [recipeId],
  );

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(cookProgressKey);
      if (!raw) {
        setSavedCookStep(null);
        return;
      }

      const parsed = JSON.parse(raw) as { currentStepIndex?: number; finishedAt?: string };
      if (parsed.finishedAt) {
        setSavedCookStep(null);
        return;
      }

      const idx = Number(parsed.currentStepIndex);
      setSavedCookStep(Number.isFinite(idx) && idx > 0 ? idx : null);
    } catch {
      setSavedCookStep(null);
    }
  }, [cookProgressKey]);

  const handleCookProgressChange = React.useCallback((stepIndex: number) => {
    try {
      const payload = {
        recipeId,
        currentStepIndex: stepIndex,
        updatedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(cookProgressKey, JSON.stringify(payload));
      setSavedCookStep(stepIndex > 0 ? stepIndex : null);
    } catch {
      // localStorage can fail in private browsing; Cook Mode should still work.
    }
  }, [cookProgressKey, recipeId]);

  const handleCookComplete = React.useCallback(() => {
    try {
      const payload = {
        recipeId,
        currentStepIndex: Math.max(0, instructions.length - 1),
        finishedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(cookProgressKey, JSON.stringify(payload));
      setSavedCookStep(null);
    } catch {
      setSavedCookStep(null);
    }
  }, [cookProgressKey, recipeId, instructions.length]);

  // ── Flat ingredient list (for shopping list) ─────────────────────────────

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

  const hasServings = Boolean(toStr(recipe.servings).trim());

  const ingredientQuantityCount = React.useMemo(() => {
    return allIngredients.filter(({ raw }) => {
      if (typeof raw === 'string') return false;
      const item = raw as any;
      const q = item?.quantity ?? item?.amount ?? item?.qty ?? item?.rawQuantity;
      const hasQuantity =
        q !== null &&
        q !== undefined &&
        String(q).trim() !== '' &&
        !/^(to taste|as needed|a\/r|q\.?s\.?)$/i.test(String(q).trim());
      const hasRange =
        item?.quantityRange?.min !== null &&
        item?.quantityRange?.min !== undefined &&
        item?.quantityRange?.unit;
      return Boolean(hasQuantity || hasRange);
    }).length;
  }, [allIngredients]);

  const techniqueText = [
    recipe.practical_summary?.what_it_is,
    recipe.practical_summary?.key_technique,
    ...(recipe.practical_summary?.important_notes ?? []),
    ...tips,
    ...notes,
    recipeName,
  ].filter(Boolean).join(' ').toLowerCase();

  const looksTechnique =
    /\b(technique|method|how to|confit|blanch|temper|slice|knife|peel|sharpen|debone|cartouche|infuse|infusion|fold|knead|emulsify|sear|braise|poach)\b/.test(techniqueText);

  const hasActionableRecipe =
    allIngredients.length >= 2 &&
    instructions.length >= 3 &&
    (
      hasServings ||
      recipe.prep_time ||
      recipe.cook_time ||
      recipe.total_time
    );

  const recipeKind: 'full_recipe' | 'technique_with_ingredients' | 'pure_technique' =
    allIngredients.length <= 1 && instructions.length >= 2
      ? 'pure_technique'
      : ingredientQuantityCount >= 2 || hasActionableRecipe
        ? 'full_recipe'
        : looksTechnique || !hasServings
          ? 'technique_with_ingredients'
          : 'full_recipe';

  const isFullRecipe = recipeKind === 'full_recipe';
  const isTechnique = recipeKind !== 'full_recipe';
  const isPureTechnique = recipeKind === 'pure_technique';

  // Full recipes get macro/shopping support.
  // Technique-with-ingredients should still show Ingredients + Steps;
  // only pure techniques collapse to Ask-only when there are no ingredients.
  const showIngredientsTab = !isPureTechnique && allIngredients.length > 0;
  const showStepsTab = instructions.length > 0;
  const showNutritionTab = isFullRecipe && allIngredients.length > 0;
  const showShoppingList = isFullRecipe && Boolean(onAddToShoppingList) && allIngredients.length > 0;

  const recipeTabs = [
    ...(showNutritionTab ? [{ key: 'nutrition' as const, label: 'Macro' }] : []),
    ...(showIngredientsTab ? [{ key: 'ingredients' as const, label: 'Ingredients' }] : []),
    ...(showStepsTab ? [{ key: 'steps' as const, label: 'Steps' }] : []),
    { key: 'ask' as const, label: isTechnique ? 'Ask Technique' : 'Ask' },
  ];
  React.useEffect(() => {
    if (!recipeTabs.some((tab) => tab.key === activeRecipeTab)) {
      setActiveRecipeTab(recipeTabs[0]?.key ?? 'ask');
    }
  }, [activeRecipeTab, recipeTabs]);

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

  const handleServingsDelta = (delta: number) => {
    if (!onServingScaleChange) return;
    const next = Math.max(1, currentServings + delta);
    onServingScaleChange(Number((next / baseServings).toFixed(3)));
  };

  // ── Times ────────────────────────────────────────────────────────────────

  const timeCells = [
    { label: t('videoDetail:prep', 'Prep'),   value: formatMinutes(recipe.prep_time),  icon: <Clock size={14} /> },
    { label: t('videoDetail:cook', 'Cook'),   value: formatMinutes(recipe.cook_time),  icon: <Flame size={14} /> },
    { label: t('videoDetail:rest', 'Rest'),   value: formatMinutes(recipe.rest_time),  icon: <Moon  size={14} /> },
    { label: t('videoDetail:total', 'Total'), value: formatMinutes(recipe.total_time), icon: <Clock size={14} /> },
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
      const { name, quantity, unit, emoji, qtyRange, needsReview } = parseRawIngredient(raw);
      let qty = quantity || undefined;
      let u   = unit || undefined;

      if (qtyRange) {
        qty = String(qtyRange.min);
        u   = qtyRange.unit || unit || undefined;
        if (qty) qty = normalizeCountQuantity(qty, u || null, name);
      } else if (qty) {
        if (scaleQuantity && currentScale !== 1) {
          const scaled = scaleQuantity(qty, currentScale);
          if (scaled && !scaled.includes('NaN')) qty = scaled;
        }

        qty = normalizeCountQuantity(qty, u || null, name);

        if (u) {
          const conv = convertUnits(qty, u, useMetric);
          qty = conv.q; u = conv.u;
        }
      }

      // For items with no stated quantity, pass the assumed label as the unit
      // so the grocery list shows "to taste salt" instead of just "salt"
      if (needsReview && !qty) {
        u = assumedLabel(name);
      }

      return {
        id: `${recipeId}_${id}`,
        name,
        quantity: qty,
        unit: u,
        emoji: emoji || undefined,
        recipeTitle: recipeName,
        checked: false,
      };
    });
    onAddToShoppingList(items);
    setAdded(true);
    setTimeout(() => setAdded(false), 3000);
  };

  const askHistoryStorageKey = React.useMemo(
    () => (recipeId ? `recolekt:recipe-ask:${recipeId}` : ''),
    [recipeId],
  );

  React.useEffect(() => {
    if (!askHistoryStorageKey || !recipeId) return;

    let cancelled = false;

    const loadAskHistory = async () => {
      try {
        const token = getRecipeAssistantToken();
        const res = await fetch(
          apiUrl(`api/reel/${encodeURIComponent(recipeId)}/ask/history?limit=10`),
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            credentials: "include",
          }
        );

        const data = (await res.json().catch(() => ({}))) as {
          history?: RecipeAssistantHistoryEntry[];
        };

        if (!cancelled && res.ok && Array.isArray(data.history)) {
          setAskHistory(data.history.slice(0, 10));
          try {
            localStorage.setItem(askHistoryStorageKey, JSON.stringify(data.history.slice(0, 10)));
          } catch {
            // Ignore localStorage sync failures.
          }
          return;
        }
      } catch {
        // Fall back to localStorage below.
      }

      if (cancelled) return;

      try {
        const raw = localStorage.getItem(askHistoryStorageKey);
        const parsed = raw ? JSON.parse(raw) : [];
        setAskHistory(Array.isArray(parsed) ? parsed.slice(0, 10) : []);
      } catch {
        setAskHistory([]);
      }
    };

    loadAskHistory();

    return () => {
      cancelled = true;
    };
  }, [recipeId, askHistoryStorageKey]);

  const handleAskRecipe = async () => {
    const question = askQuestion.trim();
    if (!question || !recipeId || askLoading) return;

    setAskLoading(true);
    setAskError("");

    try {
      const token = getRecipeAssistantToken();
      const res = await fetch(
        apiUrl(`api/reel/${encodeURIComponent(recipeId)}/ask`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: "include",
          body: JSON.stringify({ question }),
        }
      );

      const data = (await res.json().catch(() => ({}))) as RecipeAssistantResponse;

      if (!res.ok) {
        throw new Error(data?.error || `Recipe assistant failed (${res.status})`);
      }

      const nextAnswer = data.answer || "No answer returned.";


      setAskAnswer(nextAnswer);

      const fallbackEntry = {
        question,
        answer: nextAnswer,
        createdAt: new Date().toISOString(),
      };

      const nextHistory =
        Array.isArray(data.history) && data.history.length > 0
          ? data.history.slice(0, 10)
          : [fallbackEntry, ...askHistory].slice(0, 10);

      setAskHistory(nextHistory);

      if (askHistoryStorageKey) {
        try {
          localStorage.setItem(askHistoryStorageKey, JSON.stringify(nextHistory));
        } catch {
          // Ignore localStorage write failures.
        }
      }
    } catch (err: any) {
      setAskError(err?.message || "Recipe assistant failed.");
    } finally {
      setAskLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <RecipeMainView
      primary={
        <div className="bg-white border border-gray-100 rounded-[24px] shadow-sm overflow-hidden mt-4 mb-6">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-rose-100 bg-rose-50/70">
        <div className="flex items-center gap-2.5">
          <ChefHat size={18} className="text-rose-500" />
          <h3 className="font-bold text-gray-900 text-base tracking-tight">
            {isTechnique ? 'Cooking Technique' : t('videoDetail:recipeDetails', 'Recipe Details')}
          </h3>
        </div>
        {onToggleMetric && (
          <button
            onClick={() => onToggleMetric(!useMetric)}
            className="px-3 py-1.5 bg-white/90 border border-rose-100 text-gray-700 rounded-xl text-[11px] font-bold shadow-sm hover:bg-white transition-colors"
          >
            {useMetric ? 'Imperial' : 'Metric'}
          </button>
        )}
      </div>

      {/* Time grid — dynamic columns, only renders cells with data */}
      {timeCells.length > 0 && (
        <div
          className="grid border-b border-gray-50"
          style={{ gridTemplateColumns: `repeat(${timeCells.length}, 1fr)` }}
        >
          {timeCells.map((cell, i) => (
            <div key={i} className={i > 0 ? 'border-l border-gray-50' : ''}>
              <TimeCell icon={cell.icon} label={cell.label} value={cell.value} />
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="border-t border-gray-100 bg-gray-50 px-3 py-3">
        <div className="grid gap-1 rounded-2xl bg-gray-100 p-1 text-[12px] font-black" style={{ gridTemplateColumns: `repeat(${recipeTabs.length}, minmax(0, 1fr))` }}>
          {recipeTabs.map((tab) => {
            const active = activeRecipeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveRecipeTab(tab.key)}
                className={`rounded-xl px-2 py-2.5 transition-all ${
                  active
                    ? 'bg-white text-violet-600 shadow-sm'
                    : 'text-gray-500 hover:bg-white/50 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeRecipeTab === 'ingredients' && (flat.length > 0 || groups.length > 0) && (
        <RecipeIngredients>
          <div className="flex items-center justify-between px-5 mb-4 gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                {t('videoDetail:ingredients', 'Ingredients')}
              </h4>

              {hasServings && onServingScaleChange && (
                <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-xl px-2 py-1">
                  <button type="button" onClick={() => handleServingsDelta(-1)} className="w-5 h-5 rounded-full bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center text-[11px] font-black hover:bg-rose-100 transition">−</button>
                  <span className="text-[13px] font-black text-rose-600 tabular-nums min-w-[16px] text-center">{currentServings}</span>
                  <button type="button" onClick={() => handleServingsDelta(1)} className="w-5 h-5 rounded-full bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center text-[11px] font-black hover:bg-rose-100 transition">+</button>
                  <span className="text-[10px] text-gray-400 font-medium ml-0.5">serv.</span>
                </div>
              )}
            </div>

            {showShoppingList && (
              <button
                type="button"
                onClick={handleAddToList}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                style={{
                  background: added ? 'rgba(21,128,61,0.07)' : 'rgba(124,58,237,0.07)',
                  color: added ? '#15803d' : '#7c3aed',
                  border: added ? '1px solid rgba(21,128,61,0.18)' : '1px solid rgba(124,58,237,0.18)',
                }}
              >
                {added ? <Check size={12} strokeWidth={2.5} /> : <ShoppingCart size={12} strokeWidth={2} />}
                {added ? 'Added' : 'Add to list'}
              </button>
            )}
          </div>

          <div className="divide-y divide-gray-50/80">
            {hasGroups
              ? groups.map((group, gi) => (
                  <div key={gi}>
                    {(group.title || group.group) && (
                      <div className="px-5 pt-3 pb-1.5">
                        <h5 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
                          {group.title || group.group}
                        </h5>
                      </div>
                    )}
                    <ul>
                      {(group.items ?? []).map((item, ii) => {
                        const id = `g${gi}-i${ii}`;
                        return (
                          <IngredientRow
                            parseRawIngredient={parseRawIngredient}
                            formatQty={formatQty}
                            assumedLabel={assumedLabel}
                            key={id}
                            id={id}
                            raw={item}
                            servingScale={currentScale}
                            scaleQuantity={scaleQuantity}
                            checked={!isTechnique && checkedIds.has(id)}
                            onToggle={isTechnique ? undefined : toggleIngredient}
                            useMetric={useMetric}
                          />
                        );
                      })}
                    </ul>
                  </div>
                ))
              : (
                <ul>
                  {flat.map((item, i) => {
                    const id = `f${i}`;
                    return (
                      <IngredientRow
                            parseRawIngredient={parseRawIngredient}
                            formatQty={formatQty}
                            assumedLabel={assumedLabel}
                        key={id}
                        id={id}
                        raw={item}
                        servingScale={currentScale}
                        scaleQuantity={scaleQuantity}
                        checked={!isTechnique && checkedIds.has(id)}
                        onToggle={isTechnique ? undefined : toggleIngredient}
                        useMetric={useMetric}
                      />
                    );
                  })}
                </ul>
              )
            }
          </div>

          {recipeKind === 'technique_with_ingredients' && (
            <div className="mx-5 mt-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">
                Technique note
              </p>
              <p className="mt-2 text-xs leading-relaxed text-gray-600">
                This is a cooking technique, not a portioned recipe. Quantities and servings are not precise enough for reliable nutrition, so use the ingredients as a reference.
              </p>
            </div>
          )}
        </RecipeIngredients>
      )}

      {activeRecipeTab === 'steps' && (
        <>
          {instructions.length > 0 && (
            <RecipeDirections>
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-5">
                {t('videoDetail:directions', 'Directions')}
              </h4>
              <div className="space-y-5">
                {(() => {
                  let offset = 0;

                  return instructionSections.map((section, sectionIndex) => {
                    const startIndex = offset;
                    offset += section.instructions.length;

                    return (
                      <div key={`${section.title || 'section'}-${sectionIndex}`} className={sectionIndex > 0 ? 'pt-2 border-t border-gray-50' : ''}>
                        {section.title && (
                          <h5 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">
                            {section.title}
                          </h5>
                        )}

                        <div className="space-y-5">
                          {section.instructions.map((step, stepIndex) => {
                            const absoluteIndex = startIndex + stepIndex;
                            return (
                              <StepRow
                                parseInstruction={parseInstruction}
                                key={absoluteIndex}
                                index={absoluteIndex}
                                raw={step}
                                checked={checkedSteps.has(absoluteIndex)}
                                onToggle={toggleStep}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </RecipeDirections>
          )}
        </>
      )}

      {activeRecipeTab === 'nutrition' && showNutritionTab && (
        <RecipeNutritionSummary
          ingredients={allIngredients.map((entry) => entry.raw)}
          servings={hasServings ? currentServings : undefined}
          recipeName={recipeName}
        />
      )}

      {activeRecipeTab === 'ask' && (
        <RecipeAskPanel>
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">
            {isTechnique ? 'Technique Assistant' : 'Recipe Assistant'}
          </p>

          <h4 className="mt-1 text-base font-black text-gray-950">
            {isTechnique ? 'Ask about this technique' : 'Ask about this recipe'}
          </h4>

          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            {isTechnique
              ? 'Uses this technique, caption, and transcript. Best for method, timing, equipment, and substitutions.'
              : 'Uses this recipe, caption, and transcript. Best for missing quantities, substitutions, timing, and technique.'}
          </p>

          <div className="mt-4 flex gap-2">
            <input
              value={askQuestion}
              onChange={(e) => setAskQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAskRecipe();
                }
              }}
              placeholder={
                isTechnique
                  ? 'How should I use this technique?'
                  : 'What is missing from this recipe?'
              }
              className="min-w-0 flex-1 rounded-xl border border-violet-100 bg-white px-3 py-2 text-sm font-medium text-gray-800 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            />

            <button
              type="button"
              onClick={handleAskRecipe}
              disabled={askLoading || !askQuestion.trim() || !recipeId}
              className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {askLoading ? 'Asking...' : 'Ask'}
            </button>
          </div>

          {askHistory.length > 1 && (
            <div className="mt-4 rounded-2xl border border-violet-100 bg-white/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">
                  Recent questions
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setAskHistory([]);
                    if (askHistoryStorageKey) {
                      localStorage.removeItem(askHistoryStorageKey);
                    }
                  }}
                  className="text-[10px] font-black uppercase tracking-wide text-gray-400 hover:text-gray-700"
                >
                  Clear
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {askHistory.slice(1, 5).map((entry, idx) => (
                  <button
                    key={`${entry.createdAt}-${idx}`}
                    type="button"
                    onClick={() => {
                      setAskQuestion(entry.question);
                      setAskAnswer(entry.answer);
                    }}
                    className="block w-full rounded-xl border border-gray-100 bg-white px-3 py-3 text-left transition hover:border-violet-100 hover:bg-violet-50/40"
                  >
                    <p className="line-clamp-1 text-xs font-black text-gray-800">
                      {entry.question}
                    </p>

                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">
                      {entry.answer}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {askError && (
            <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
              {askError}
            </p>
          )}

          {askAnswer && (
            <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Answer
              </p>

              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700">
                {askAnswer}
              </p>
            </div>
          )}
        </RecipeAskPanel>
      )}

        </div>
      }

      secondary={
        <RecipeSecondaryContent>
      {/* Chef's Tips */}
      {activeRecipeTab === 'steps' && (tips.length > 0 || notes.length > 0) && (
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
                <span className="flex-shrink-0 mt-[5px] w-1 h-1 rounded-full bg-amber-400" />
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

      {/* Always-visible Cook Mode CTA */}
      {instructions.length > 0 && (
        <div className="border-t border-gray-50 px-5 py-5">
          <button
            type="button"
            onClick={() => setIsCookModeOpen(true)}
            className="group flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-sm font-black text-white shadow-lg shadow-primary-500/20 transition-all active:scale-[0.99]"
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #e11d48 100%)' }}
          >
            <ChefHat size={17} strokeWidth={2.5} />
            {savedCookStep !== null
              ? `${isTechnique ? 'Resume guide' : 'Resume cooking'} · step ${savedCookStep + 1}`
              : isTechnique ? 'Follow technique guide' : 'Launch cooking mode'}
          </button>
          <p className="mt-2 text-center text-[11px] font-medium text-gray-400">
            {savedCookStep !== null
              ? `You left off at step ${savedCookStep + 1} of ${instructions.length}`
              : isTechnique ? 'Follow this technique step by step.' : 'Follow this recipe step by step with timers.'}
          </p>
        </div>
      )}
        </RecipeSecondaryContent>
      }

      cook={
        <CookModeModal
          isOpen={isCookModeOpen}
          recipeId={recipeId}
          recipeName={recipeName}
          instructions={instructions}
          ingredients={allIngredients.map((entry) => entry.raw)}
          initialStepIndex={savedCookStep ?? 0}
          onClose={() => setIsCookModeOpen(false)}
          onProgressChange={handleCookProgressChange}
          onComplete={handleCookComplete}
        />
      }
    />
  );
};

export default RecipeDetailsCard;