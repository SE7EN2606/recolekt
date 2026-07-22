import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, CheckCheck, ChefHat, Minus, Plus, X, HelpCircle } from 'lucide-react';
import { useTimer } from '../context/TimerContext';
import FloatingTimer from './FloatingTimer';
import { formatQty } from '../features/recipe-core/recipePayload';
import { convertTemperatureInText } from '../utils/conversionUtils';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type CookModeInstruction =
  | string
  | {
      instruction?: string | null;
      text?: string | null;
      source?: string | null;
      confidence?: string | null;
      needs_review?: boolean | null;
    };

export type CookModeIngredient =
  | string
  | {
      item?: string | null;
      name?: string | null;
      emoji?: string | null;
      quantity?: string | number | null;
      unit?: string | null;
      quantity_type?: string | null;
      quantityType?: string | null;
      quantityRange?: { min: number; max: number; unit?: string } | null;
      needs_review?: boolean | null;
      id?: string | null;
    };

export type CookModeIngredientSection = {
  title?: string;
  items: CookModeIngredient[];
};

interface CookModeModalProps {
  isOpen: boolean;
  recipeId: string;
  recipeName: string;
  instructions: CookModeInstruction[];
  ingredients?: CookModeIngredient[];
  ingredientSections?: CookModeIngredientSection[];
  checkedIngredientIds?: Set<string>;
  initialStepIndex?: number;
  servingScale?: number;
  onServingScaleChange?: (scale: number) => void;
  scaleQuantity?: (qty: string, scale: number) => string;
  useMetric?: boolean;
  onToggleMetric?: (val: boolean) => void;
  temperatureUnit?: 'celsius' | 'fahrenheit';
  recipeConversion?: 'do_not_convert' | 'smart' | 'always';
  volumePreference?: 'metric' | 'us';
  rounding?: 'rounded' | 'exact';
  onClose: () => void;
  onIngredientToggle?: (ingredientId: string) => void;
  onIngredientSelectAll?: (ingredientIds: string[]) => void;
  onProgressChange?: (stepIndex: number) => void;
  onStepComplete?: (stepIndex: number) => void;
  onComplete?: () => void;
  onAddCookingNote?: () => void;
}

const COOK_MODE_MODAL_TITLE_ID = 'cook-mode-modal-title';

// ─────────────────────────────────────────────────────────────────────────────
// CULINARY GLOSSARY  (EN + FR)
// ─────────────────────────────────────────────────────────────────────────────

const GLOSSARY: Record<string, string> = {
  sear:         'Cook on very high heat to form a golden-brown crust quickly.',
  deglaze:      'Add liquid to a hot pan to lift the caramelised bits stuck to the bottom.',
  blanch:       'Briefly boil, then immediately cool in ice water to stop cooking.',
  braise:       'Slow-cook in a small amount of liquid with the lid on.',
  confit:       'Cook slowly while submerged in fat at low temperature.',
  reduce:       'Simmer uncovered until liquid evaporates and flavour concentrates.',
  simmer:       'Cook just below boiling — small, gentle bubbles only.',
  strain:       'Pass through a sieve or strainer to remove solids.',
  shred:        'Pull cooked meat apart into thin strips with forks or your hands.',
  caramelize:   'Cook until sugars brown and develop a deep, sweet flavour.',
  sauté:        'Cook quickly in a small amount of fat over high heat.',
  season:       'Add salt and pepper to balance and enhance the flavour.',
  fold:         'Gently incorporate without deflating air from the mixture.',
  emulsify:     'Combine fat and liquid into a smooth, stable mixture.',
  syrupy:       'Reduced until thick enough to coat the back of a spoon.',
  'dorées':     'Bien colorées à feu vif — une croûte légèrement croustillante.',
  mijoter:      'Cuire à feu doux avec de petits frémissements réguliers.',
  frémissement: 'Légère ébullition — seulement quelques petites bulles.',
  effilocher:   'Déchirer la viande cuite en fines lamelles à la main ou à la fourchette.',
  filtrer:      'Passer au tamis pour séparer le liquide des solides.',
  réduire:      'Laisser mijoter sans couvercle pour évaporer et concentrer les saveurs.',
  griller:      'Cuire à feu vif pour former une belle croûte dorée.',
  assaisonner:  'Ajouter sel et poivre pour équilibrer et rehausser les saveurs.',
  sirupeux:     'Réduit jusqu\'à napper la cuillère — texture épaisse et brillante.',
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const getText = (s: CookModeInstruction): string =>
  (typeof s === 'string' ? s : ((s?.instruction || s?.text || '') as string)).trim();

const ingName = (i: CookModeIngredient): string =>
  (typeof i === 'string' ? i : ((i as any)?.item || (i as any)?.name || '') as string).trim();

const ingEmoji = (i: CookModeIngredient): string =>
  typeof i === 'string' ? '' : String((i as any)?.emoji || '');

// Fix: reads quantityRange first, then falls back to quantity
const ingQty = (i: CookModeIngredient): string => {
  if (typeof i === 'string') return '';
  const b = i as any;
  if (b.quantityRange) {
    const u = b.quantityRange.unit || b.unit || '';
    return u
      ? `${b.quantityRange.min}–${b.quantityRange.max} ${u}`
      : `${b.quantityRange.min}–${b.quantityRange.max}`;
  }
  const q = b.quantity != null ? String(b.quantity).trim() : '';
  const u = b.unit ? String(b.unit).trim() : '';
  return q ? (u ? `${q} ${u}` : q) : '';
};

const ingId = (i: CookModeIngredient, index: number): string =>
  typeof i === 'string' ? `ingredient-${index}` : String((i as any)?.id || `ingredient-${index}`);

const prettyNumber = (value: number): string => {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value - Math.round(value)) < 0.01) return String(Math.round(value));
  return value < 10 ? String(Math.round(value * 10) / 10) : String(Math.round(value));
};

const QUANTITY_TYPE_LABELS: Record<string, string> = {
  to_taste: 'to taste',
  as_needed: 'as needed',
  optional: 'optional',
  garnish: 'garnish',
  unspecified: 'quantity not specified',
};

const quantityTypeLabel = (ingredient: CookModeIngredient): string => {
  if (typeof ingredient === 'string') return '';
  const key = String((ingredient as any)?.quantity_type || (ingredient as any)?.quantityType || '').trim().toLowerCase();
  return key ? QUANTITY_TYPE_LABELS[key] || QUANTITY_TYPE_LABELS.unspecified : '';
};

const compactRangeQuantity = (minText: string, maxText: string): string => {
  const minParts = minText.trim().split(/\s+/);
  const maxParts = maxText.trim().split(/\s+/);

  if (minParts.length >= 2 && maxParts.length >= 2 && minParts.slice(1).join(' ') === maxParts.slice(1).join(' ')) {
    return `${minParts[0]}–${maxParts[0]} ${minParts.slice(1).join(' ')}`;
  }

  return `${minText}–${maxText}`;
};

const formatIngredientQuantity = (
  ingredient: CookModeIngredient,
  servingScale: number,
  scaleQuantity: ((qty: string, scale: number) => string) | undefined,
  useMetric: boolean,
  recipeConversion: 'do_not_convert' | 'smart' | 'always',
  volumePreference: 'metric' | 'us',
  rounding: 'rounded' | 'exact'
): string => {
  if (typeof ingredient === 'string') return '';
  const base = ingredient as any;
  const unit = String(base.quantityRange?.unit || base.unit || '').trim();

  if (base.quantityRange) {
    const min = Number(base.quantityRange.min);
    const max = Number(base.quantityRange.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return ingQty(ingredient);
    const minText = formatQty(
      prettyNumber(min),
      unit,
      servingScale,
      scaleQuantity,
      useMetric,
      recipeConversion,
      volumePreference,
      rounding,
      ingName(ingredient)
    );
    const maxText = formatQty(
      prettyNumber(max),
      unit,
      servingScale,
      scaleQuantity,
      useMetric,
      recipeConversion,
      volumePreference,
      rounding,
      ingName(ingredient)
    );
    return compactRangeQuantity(minText, maxText);
  }

  const rawQuantity = base.quantity != null ? String(base.quantity).trim() : '';
  if (!rawQuantity) return '';
  return formatQty(
    rawQuantity,
    unit,
    servingScale,
    scaleQuantity,
    useMetric,
    recipeConversion,
    volumePreference,
    rounding,
    ingName(ingredient)
  );
};

// Stop words to exclude from matching (these appear in every French sentence)
const STOPWORDS = new Set([
  'de','du','la','le','les','des','un','une','au','aux','et','ou','en','dans',
  'sur','par','avec','pour','que','qui','se','on','il','elle','nous','vous','ils',
  'elles','of','the','and','or','in','at','to','a','an','is','it','its',
]);

// Fix: minimum 4 chars AND not a stopword — eliminates "de", "du", etc.
const ingTokens = (i: CookModeIngredient): string[] => {
  const name = ingName(i).toLowerCase();
  return name
    .split(/[\s,''\-/]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
};

// Match only on ingredient's own name tokens — no semantic aliases that caused false positives
const matchIngs = (step: string, ings: CookModeIngredient[]): CookModeIngredient[] => {
  const lower = step.toLowerCase();
  return ings.filter((ing) => {
    const tokens = ingTokens(ing);
    return tokens.length > 0 && tokens.some((t) => lower.includes(t));
  });
};

const previewWords = (text: string, max = 14): string => {
  const w = text.trim().split(/\s+/);
  return w.length <= max ? text : `${w.slice(0, max).join(' ')}…`;
};

// ─────────────────────────────────────────────────────────────────────────────
// RICH INSTRUCTION with bold numbers + tappable glossary terms
// ─────────────────────────────────────────────────────────────────────────────

const RichInstruction: React.FC<{ text: string; tone?: 'light' | 'dark' }> = ({ text, tone = 'light' }) => {
  const [tip, setTip] = React.useState<{ term: string; def: string } | null>(null);

  React.useEffect(() => {
    setTip(null);
  }, [text]);

  const glossaryTerms = React.useMemo(
    () => Object.keys(GLOSSARY).sort((a, b) => b.length - a.length),
    [],
  );

  type Seg = { type: 'text' | 'number' | 'term'; content: string; term?: string };

  const segments: Seg[] = React.useMemo(() => {
    const result: Seg[] = [];
    const termPat = glossaryTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    // Match: numbers+units OR glossary terms (word boundary)
    const rx = new RegExp(
      `(\\b\\d+(?:[.,]\\d+)?(?:\\s*(?:-|–)\\s*\\d+(?:[.,]\\d+)?|\\s+to\\s+\\d+(?:[.,]\\d+)?)?\\s*(?:g|kg|ml|l|min(?:utes?)?|h(?:eure[s]?|ours?)?|hours?|°c|°f)\\b|\\b(?:${termPat})\\b)`,
      'gi',
    );
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
      if (m.index > last) result.push({ type: 'text', content: text.slice(last, m.index) });
      const raw = m[0];
      const lo = raw.toLowerCase();
      if (/^\d/.test(raw)) {
        result.push({ type: 'number', content: raw });
      } else {
        const key = glossaryTerms.find((t) => lo === t || lo.startsWith(t));
        result.push(key ? { type: 'term', content: raw, term: key } : { type: 'text', content: raw });
      }
      last = m.index + raw.length;
    }
    if (last < text.length) result.push({ type: 'text', content: text.slice(last) });
    return result;
  }, [text, glossaryTerms]);

  return (
    <div className="w-full">
      <p
        className={`font-black leading-[1.22] ${tone === 'dark' ? 'text-left text-white' : 'text-center text-gray-950'}`}
        style={{ fontSize: 'clamp(22px, 3vw, 42px)' }}
      >
        {segments.map((seg, i) => {
          if (seg.type === 'number') {
            return <span key={i} className={tone === 'dark' ? 'text-emerald-300' : 'text-primary-600'}>{seg.content}</span>;
          }
          if (seg.type === 'term' && seg.term) {
            return (
              <span
                key={i}
                className={`cursor-pointer underline decoration-dotted ${tone === 'dark' ? 'decoration-emerald-300/70' : 'decoration-primary-400'}`}
                style={{ textDecorationThickness: 2, textUnderlineOffset: 4 }}
                onClick={() => setTip(tip?.term === seg.term ? null : { term: seg.term!, def: GLOSSARY[seg.term!] })}
              >
                {seg.content}
              </span>
            );
          }
          return <span key={i}>{seg.content}</span>;
        })}
      </p>

      {/* Glossary tooltip */}
      {tip && (
        <div
          className="mx-auto mt-4 max-w-sm rounded-2xl px-4 py-3 text-left"
          style={{ background: '#f5f3ff', border: '1px solid #ddd6fe' }}
        >
          <div className="flex items-start gap-2.5">
            <HelpCircle size={14} className="text-primary-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary-600 mb-1">{tip.term}</p>
              <p className="text-[12px] text-gray-600 leading-relaxed">{tip.def}</p>
            </div>
            <button onClick={() => setTip(null)} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS
// ─────────────────────────────────────────────────────────────────────────────

const Progress: React.FC<{ total: number; current: number }> = ({ total, current }) =>
  total > 12 ? (
    <div className="flex items-center gap-2">
      <div className="h-1 w-24 rounded-full overflow-hidden bg-white/15">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.round(((current + 1) / total) * 100)}%`, background: '#10b981' }}
        />
      </div>
      <span className="text-[11px] font-black text-white/55 tabular-nums">{current + 1}/{total}</span>
    </div>
  ) : (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
      <span key={i} className="rounded-full transition-all duration-300" style={{
          height: 6,
          width: i === current ? 20 : 6,
          background: i < current ? '#34d399' : i === current ? '#10b981' : 'rgba(255,255,255,0.22)',
        }} />
      ))}
    </div>
  );

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const CookModeModal: React.FC<CookModeModalProps> = ({
  isOpen,
  recipeName,
  instructions,
  ingredients = [],
  ingredientSections,
  checkedIngredientIds = new Set(),
  initialStepIndex = 0,
  servingScale = 1,
  onServingScaleChange,
  scaleQuantity,
  useMetric = true,
  onToggleMetric,
  temperatureUnit = 'celsius',
  recipeConversion = 'smart',
  volumePreference = 'metric',
  rounding = 'rounded',
  onClose,
  onIngredientToggle,
  onIngredientSelectAll,
  onProgressChange,
  onStepComplete,
  onComplete,
  onAddCookingNote,
}) => {
  const steps = React.useMemo(() => instructions.map(getText).filter(Boolean), [instructions]);
  const {
    pauseTimer,
    setCookModeOpen,
  } = useTimer();

  const [idx, setIdx] = React.useState(initialStepIndex);
  const [phase, setPhase] = React.useState<'prep' | 'cook' | 'done'>('prep');
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);
  const originalHtmlOverflowRef = React.useRef('');
  const originalBodyOverflowRef = React.useRef('');
  const originalBodyPositionRef = React.useRef('');
  const originalBodyTopRef = React.useRef('');
  const originalBodyWidthRef = React.useRef('');
  const originalBodyPaddingRightRef = React.useRef('');
  const appRootRef = React.useRef<HTMLElement | null>(null);
  const originalRootInertRef = React.useRef(false);
  const originalRootAriaHiddenRef = React.useRef<string | null>(null);
  const scrollYRef = React.useRef(0);
  const didLockScrollRef = React.useRef(false);
  const didHideAppRootRef = React.useRef(false);
  const didFocusDialogRef = React.useRef(false);
  const wakeLock = React.useRef<any>(null);
  const started = React.useRef(Date.now());
  const opened = React.useRef(false);

  const cur = steps[idx] || '';
  const displayCur = React.useMemo(() => convertTemperatureInText(cur, temperatureUnit), [cur, temperatureUnit]);
  const next = idx < steps.length - 1 ? steps[idx + 1] : '';
  const displayNext = React.useMemo(() => convertTemperatureInText(next, temperatureUnit), [next, temperatureUnit]);
  const isLast = idx >= steps.length - 1;

  const stepIngs = React.useMemo(() => matchIngs(displayCur, ingredients), [displayCur, ingredients]);
  const visibleStepIngredients = stepIngs.length > 0 ? stepIngs : ingredients.slice(0, 6);
  const allIngredientIds = React.useMemo(
    () => ingredients.map((ingredient, index) => ingId(ingredient, index)),
    [ingredients],
  );
  const checkedCount = React.useMemo(
    () => ingredients.filter((ingredient, index) => checkedIngredientIds.has(ingId(ingredient, index))).length,
    [checkedIngredientIds, ingredients],
  );
  const displayIngredientSections = React.useMemo(
    () => ingredientSections && ingredientSections.length > 0
      ? ingredientSections
      : [{ items: ingredients }],
    [ingredientSections, ingredients],
  );
  const ingredientProgress = ingredients.length > 0 ? Math.round((checkedCount / ingredients.length) * 100) : 0;
  const allIngredientsChecked = ingredients.length > 0 && checkedCount === ingredients.length;
  const stepProgress = steps.length > 0 ? Math.round(((idx + 1) / steps.length) * 100) : 0;

  const restoreFocus = React.useCallback(() => {
    const target = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (target && document.contains(target)) {
      target.focus({ preventScroll: true });
    }
  }, []);

  const unlockScroll = React.useCallback(() => {
    if (!didLockScrollRef.current) return;
    document.documentElement.style.overflow = originalHtmlOverflowRef.current;
    document.body.style.paddingRight = originalBodyPaddingRightRef.current;
    document.body.style.overflow = originalBodyOverflowRef.current;
    document.body.style.position = originalBodyPositionRef.current;
    document.body.style.top = originalBodyTopRef.current;
    document.body.style.width = originalBodyWidthRef.current;
    window.scrollTo(0, scrollYRef.current);
    didLockScrollRef.current = false;
  }, []);

  const lockScroll = React.useCallback(() => {
    if (didLockScrollRef.current) return;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    scrollYRef.current = window.scrollY;
    originalHtmlOverflowRef.current = document.documentElement.style.overflow;
    originalBodyPaddingRightRef.current = document.body.style.paddingRight;
    originalBodyOverflowRef.current = document.body.style.overflow;
    originalBodyPositionRef.current = document.body.style.position;
    originalBodyTopRef.current = document.body.style.top;
    originalBodyWidthRef.current = document.body.style.width;
    document.documentElement.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollYRef.current}px`;
    document.body.style.width = '100%';
    didLockScrollRef.current = true;
  }, []);

  const getAppRoot = React.useCallback(() => {
    const root = document.getElementById('root');
    if (!root || root === document.body) return null;
    return root;
  }, []);

  const hideAppRoot = React.useCallback(() => {
    if (didHideAppRootRef.current) return;

    const root = getAppRoot();
    if (!root) return;

    appRootRef.current = root;
    originalRootInertRef.current = root.inert;
    originalRootAriaHiddenRef.current = root.getAttribute('aria-hidden');
    root.inert = true;
    root.setAttribute('aria-hidden', 'true');
    didHideAppRootRef.current = true;
  }, [getAppRoot]);

  const restoreAppRoot = React.useCallback(() => {
    if (!didHideAppRootRef.current) return;

    const root = appRootRef.current;
    if (root && document.contains(root)) {
      root.inert = originalRootInertRef.current;
      if (originalRootAriaHiddenRef.current === null) {
        root.removeAttribute('aria-hidden');
      } else {
        root.setAttribute('aria-hidden', originalRootAriaHiddenRef.current);
      }
    }

    appRootRef.current = null;
    originalRootInertRef.current = false;
    originalRootAriaHiddenRef.current = null;
    didHideAppRootRef.current = false;
  }, []);

  const restoreModalState = React.useCallback(() => {
    restoreAppRoot();
    unlockScroll();
    restoreFocus();
    didFocusDialogRef.current = false;
  }, [restoreAppRoot, restoreFocus, unlockScroll]);

  const close = React.useCallback(() => {
    try { wakeLock.current?.release?.(); } catch {}
    wakeLock.current = null;
    onClose();
  }, [onClose]);

  React.useLayoutEffect(() => {
    if (!isOpen) {
      restoreModalState();
      return;
    }

    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    didFocusDialogRef.current = false;
    lockScroll();
    hideAppRoot();
  }, [hideAppRoot, isOpen, lockScroll, restoreModalState]);

  React.useLayoutEffect(() => () => restoreModalState(), [restoreModalState]);

  React.useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const getFocusableElements = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          [
            'a[href]',
            'button:not([disabled])',
            'textarea:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
          ].join(','),
        ),
      ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');

    if (!didFocusDialogRef.current) {
      const focusableElements = getFocusableElements();
      (focusableElements[0] || dialog).focus({ preventScroll: true });
      didFocusDialogRef.current = true;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== 'Tab') return;

      const elements = getFocusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      } else if (!dialog.contains(active)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [close, isOpen]);

  React.useEffect(() => {
    if (!isOpen) { opened.current = false; return; }
    if (opened.current) return;
    opened.current = true;
    const safeInitial = Math.min(Math.max(initialStepIndex, 0), Math.max(steps.length - 1, 0));
    setIdx(safeInitial);
    setPhase(safeInitial > 0 ? 'cook' : 'prep');
    started.current = Date.now();
    (async () => { try { wakeLock.current = await (navigator as any).wakeLock?.request('screen'); } catch {} })();
    return () => { try { wakeLock.current?.release?.(); } catch {} wakeLock.current = null; };
  }, [isOpen, initialStepIndex, steps.length]);

  React.useEffect(() => {
    if (isOpen && phase === 'cook') onProgressChange?.(idx);
  }, [isOpen, phase, idx, onProgressChange]);

  React.useEffect(() => {
    setCookModeOpen(isOpen);
    return () => setCookModeOpen(false);
  }, [isOpen, setCookModeOpen]);

  if (!isOpen) return null;
  const root = typeof document === 'undefined' ? null : document.body;
  if (!root) return null;

  const startCooking = () => {
    started.current = Date.now();
    setPhase('cook');
    onProgressChange?.(idx);
  };

  const completeCurrentStep = () => {
    onStepComplete?.(idx);
    if (isLast) {
      setPhase('done');
      pauseTimer();
      onComplete?.();
      return;
    }
    setIdx((p) => p + 1);
  };

  const changeServingScale = (nextScale: number) => {
    onServingScaleChange?.(Math.min(6, Math.max(0.5, nextScale)));
  };

  const toggleAllIngredients = () => {
    onIngredientSelectAll?.(allIngredientsChecked ? [] : allIngredientIds);
  };

  const elapsed = Math.max(1, Math.round((Date.now() - started.current) / 60000));

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={COOK_MODE_MODAL_TITLE_ID}
      tabIndex={-1}
      className="cook-mode-modal fixed inset-0 z-[9999] bg-slate-900 text-white"
    >
      <style>
        {`
          .cook-mode-modal [role="timer"] button {
            min-width: 44px;
            width: 44px;
            height: 44px;
          }
        `}
      </style>
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_34%),#0f172a]">
        <header
          className="flex-shrink-0 border-b border-white/10 bg-slate-950/35 px-4 pb-3 pt-3 backdrop-blur md:px-7"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
        >
          <div className="mx-auto grid max-w-5xl grid-cols-[1fr_minmax(0,1.4fr)_1fr] items-center gap-3">
            <div className="flex justify-start">
              <button
                type="button"
                onClick={close}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                aria-label="Close Cook Mode"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-w-0 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">Cook Mode</p>
              <h2 id={COOK_MODE_MODAL_TITLE_ID} className="truncate text-base font-black tracking-tight text-white sm:text-lg">{recipeName}</h2>
            </div>

            <div className="flex justify-end">
              {phase === 'cook' && (
                <button
                  type="button"
                  onClick={() => setPhase('prep')}
                  className="min-h-11 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-black text-white/85 transition-colors hover:bg-white/15"
                >
                  Ingredients
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-5 pb-28 md:px-7 md:py-8 md:pb-28">
          {phase === 'prep' && (
            <div className="relative mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 overflow-hidden">
              <section className="rounded-[24px] border border-slate-700 bg-slate-900/80 p-4 shadow-2xl shadow-black/20 md:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/20">
                      <ChefHat size={24} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 text-left">
                      <h3 className="text-xl font-black tracking-tight text-white md:text-2xl">Prep & Ingredients</h3>
                      <p className="mt-0.5 text-xs font-semibold leading-relaxed text-white/55">
                        {checkedCount} of {ingredients.length} ready
                      </p>
                    </div>
                  </div>
                  {ingredients.length > 0 && onIngredientSelectAll && (
                    <button
                      type="button"
                      onClick={toggleAllIngredients}
                      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 text-xs font-black text-white/85 transition-colors hover:bg-white/15"
                    >
                      <CheckCheck size={15} aria-hidden="true" />
                      {allIngredientsChecked ? 'Clear all' : 'Select all'}
                    </button>
                  )}
                </div>

                {ingredients.length > 0 && (
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-emerald-400 transition-all duration-300" style={{ width: `${ingredientProgress}%` }} />
                  </div>
                )}
              </section>

              <section className="rounded-[24px] border border-slate-700 bg-slate-900/80 p-4">
                <div className="flex flex-col items-center gap-4">
                  <div className="text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Servings</p>
                    <div className="mt-2 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => changeServingScale(servingScale - 0.5)}
                        disabled={!onServingScaleChange || servingScale <= 0.5}
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Decrease servings"
                      >
                        <Minus size={16} />
                      </button>
                      <div className="min-w-[86px] rounded-xl bg-slate-950/35 px-4 py-2 text-center text-sm font-black tabular-nums text-white">
                        {servingScale}×
                      </div>
                      <button
                        type="button"
                        onClick={() => changeServingScale(servingScale + 0.5)}
                        disabled={!onServingScaleChange || servingScale >= 6}
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Increase servings"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  {onToggleMetric && (
                    <div className="grid w-full max-w-xs grid-cols-2 rounded-2xl bg-slate-950/50 p-1 text-xs font-black">
                      <button
                        type="button"
                        onClick={() => onToggleMetric(true)}
                        className={`min-h-11 rounded-xl px-3 py-2 transition-colors ${useMetric ? 'bg-emerald-400 text-emerald-950' : 'text-white/60 hover:text-white'}`}
                      >
                        Metric
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleMetric(false)}
                        className={`min-h-11 rounded-xl px-3 py-2 transition-colors ${!useMetric ? 'bg-emerald-400 text-emerald-950' : 'text-white/60 hover:text-white'}`}
                      >
                        Imperial
                      </button>
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-700 bg-slate-950/25 p-3 md:p-4">
                {ingredients.length > 0 ? (
                  <div className="space-y-5">
                    {displayIngredientSections.map((section, sectionIndex) => (
                      <div key={section.title || sectionIndex} className="space-y-2.5">
                        {section.title && (
                          <h4 className="px-1 text-[11px] font-black uppercase tracking-widest text-slate-400">
                            {section.title}
                          </h4>
                        )}
                        <div className="grid gap-2">
                          {section.items.map((ingredient, index) => {
                            const id = ingId(ingredient, index);
                            const checked = checkedIngredientIds.has(id);
                            const qty = formatIngredientQuantity(
                              ingredient,
                              servingScale,
                              scaleQuantity,
                              useMetric,
                              recipeConversion,
                              volumePreference,
                              rounding
                            );
                            const quantityType = qty ? '' : quantityTypeLabel(ingredient);
                            const emoji = ingEmoji(ingredient);

                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => onIngredientToggle?.(id)}
                                className={`flex min-h-[58px] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                                  checked
                                    ? 'border-emerald-300/45 bg-emerald-400/15 text-white'
                                    : 'border-slate-700 bg-slate-800 text-white/85 hover:bg-slate-700/80'
                                }`}
                                aria-pressed={checked}
                              >
                                <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border ${
                                  checked ? 'border-emerald-300 bg-emerald-400 text-emerald-950' : 'border-white/20 bg-slate-950/35 text-transparent'
                                }`}>
                                  <Check size={13} strokeWidth={3} />
                                </span>
                                {emoji && <span className="text-lg leading-none">{emoji}</span>}
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-bold leading-snug">{ingName(ingredient)}</span>
                                </span>
                                {(qty || quantityType) && (
                                  <span className={`ml-2 shrink-0 text-right text-sm ${qty ? 'font-black text-emerald-300' : 'font-bold italic text-white/45'}`}>
                                    {qty || quantityType}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-slate-800/70 px-5 py-8 text-center">
                    <p className="text-sm font-bold text-white/70">No ingredient list was extracted for this recipe.</p>
                  </div>
                )}
              </section>

            </div>
          )}

          {phase === 'cook' && (
            <div className="relative mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 overflow-hidden">
              <section className="rounded-[28px] border border-white/10 bg-slate-800/75 p-4 shadow-2xl shadow-slate-950/20 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-300">Step {idx + 1} of {steps.length}</p>
                    <p className="mt-1 text-sm font-bold text-white/55">{isLast ? 'Final step' : 'Keep going'}</p>
                  </div>
                  <Progress total={steps.length} current={idx} />
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-emerald-400 transition-all duration-300" style={{ width: `${stepProgress}%` }} />
                </div>
              </section>

              <section className="relative flex flex-1 flex-col justify-center overflow-hidden rounded-[32px] border border-white/10 bg-slate-900 px-5 py-7 shadow-2xl shadow-black/30 md:px-10 md:py-10">
                <ChefHat
                  size={96}
                  className="pointer-events-none absolute bottom-5 right-4 text-slate-700/55 sm:hidden"
                  strokeWidth={1.2}
                  aria-hidden="true"
                />
                <ChefHat
                  size={168}
                  className="pointer-events-none absolute bottom-7 right-5 hidden text-slate-700/60 sm:block"
                  strokeWidth={1.2}
                  aria-hidden="true"
                />
                <div className="relative z-10 max-w-[min(100%,42rem)] pr-0 sm:pr-40">
                  <RichInstruction text={displayCur} tone="dark" />
                </div>

                {(next || visibleStepIngredients.length > 0) && (
                  <div className="relative z-10 mt-7 max-w-[min(100%,42rem)] border-t border-white/10 pt-5 pr-0 sm:pr-40">
                    {next && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Up next</p>
                        <p className="mt-2 text-base font-bold leading-snug text-slate-400 md:text-lg">
                          {previewWords(displayNext, 18)}
                        </p>
                      </div>
                    )}

                    {visibleStepIngredients.length > 0 && (
                      <div className={next ? 'mt-5' : ''}>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          {stepIngs.length > 0 ? 'Ingredients now' : 'Ingredients'}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {visibleStepIngredients.map((ingredient, index) => {
                            const qty = formatIngredientQuantity(
                              ingredient,
                              servingScale,
                              scaleQuantity,
                              useMetric,
                              recipeConversion,
                              volumePreference,
                              rounding
                            );
                            const quantityType = qty ? '' : quantityTypeLabel(ingredient);
                            const emoji = ingEmoji(ingredient);

                            return (
                              <span
                                key={`${ingName(ingredient)}-${index}`}
                                className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-2 text-xs font-black text-white/80"
                              >
                                {emoji && <span className="text-base leading-none">{emoji}</span>}
                                <span className="min-w-0 truncate">{ingName(ingredient)}</span>
                                {(qty || quantityType) && <span className="shrink-0 text-emerald-300">{qty || quantityType}</span>}
                              </span>
                            );
                          })}
                        </div>
                        {stepIngs.length === 0 && ingredients.length > visibleStepIngredients.length && (
                          <p className="mt-2 text-xs font-bold text-slate-500">
                            +{ingredients.length - visibleStepIngredients.length} more
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {phase === 'done' && (
            <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-[32px] bg-emerald-400 text-emerald-950 shadow-2xl shadow-emerald-950/30">
                <Check size={42} strokeWidth={3} />
              </div>
              <p className="mt-7 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300">Recipe completed</p>
              <h3 className="mt-2 text-4xl font-black tracking-tight text-white">All done</h3>
              <p className="mt-3 max-w-sm text-sm font-medium leading-relaxed text-white/58">
                {recipeName} was marked cooked. Add a quick note on the recipe page while the details are still fresh.
              </p>
              <p className="mt-4 rounded-full bg-white/10 px-4 py-2 text-xs font-black text-white/70">
                Elapsed time: ~{elapsed} min
              </p>
              <button
                type="button"
                onClick={() => {
                  close();
                  onAddCookingNote?.();
                }}
                className="mt-8 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[22px] bg-emerald-400 px-5 py-4 text-sm font-black text-emerald-950 shadow-xl shadow-emerald-950/30 transition-colors hover:bg-emerald-300"
              >
                <ChefHat size={18} />
                Add cooking note
              </button>
              <button
                type="button"
                onClick={close}
                className="mt-3 min-h-11 px-4 text-sm font-bold text-white/60 transition-colors hover:text-white"
              >
                Back to recipe
              </button>
            </div>
          )}
        </main>

        {phase !== 'done' && <FloatingTimer variant="cookMode" />}

        {phase === 'prep' && (
          <footer
            className="flex-shrink-0 border-t border-white/10 bg-slate-950/55 px-4 pb-4 pt-4 backdrop-blur md:px-7"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
          >
            <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
              <button
                type="button"
                onClick={startCooking}
                disabled={steps.length === 0}
                className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 text-[15px] font-black text-emerald-950 shadow-xl shadow-emerald-950/30 transition-all hover:bg-emerald-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChefHat size={18} />
                Start Cooking
              </button>
            </div>
          </footer>
        )}

        {phase === 'cook' && (
          <footer
            className="flex-shrink-0 border-t border-white/10 bg-slate-950/35 px-4 pb-4 pt-4 backdrop-blur md:px-7"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
          >
            <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
              <button
                type="button"
                onClick={() => setIdx((p) => Math.max(p - 1, 0))}
                disabled={idx === 0}
                className="flex h-14 min-w-[124px] flex-shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-black text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Previous step"
              >
                <ArrowLeft size={20} />
                Previous
              </button>

              <button
                type="button"
                onClick={completeCurrentStep}
                className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 text-[15px] font-black text-emerald-950 shadow-xl shadow-emerald-950/30 transition-all hover:bg-emerald-300 active:scale-[0.99]"
              >
                {isLast ? (
                  <>
                    <ChefHat size={18} />
                    Finish recipe
                  </>
                ) : (
                  <>
                    Next Step
                    <Check size={18} />
                  </>
                )}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>,
    root,
  );
};

export default CookModeModal;
