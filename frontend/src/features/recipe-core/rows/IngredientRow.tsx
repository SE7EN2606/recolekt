import React from 'react';
import { Check } from 'lucide-react';

const QUANTITY_TYPE_LABELS: Record<string, string> = {
  to_taste: 'to taste',
  as_needed: 'as needed',
  optional: 'optional',
  garnish: 'garnish',
  unspecified: 'quantity not specified',
};

function quantityTypeLabel(quantityType: unknown): string {
  const key = String(quantityType || 'unspecified').trim().toLowerCase();
  return QUANTITY_TYPE_LABELS[key] || QUANTITY_TYPE_LABELS.unspecified;
}

type Props = {
  id: string;
  raw: any;
  servingScale: number;
  scaleQuantity?: (q: string, s: number) => string;
  checked: boolean;
  onToggle?: (id: string) => void;
  useMetric: boolean;
  recipeConversion?: 'do_not_convert' | 'smart' | 'always';
  volumePreference?: 'metric' | 'us';
  rounding?: 'rounded' | 'exact';
  parseRawIngredient: (raw: any) => any;
  formatQty: (
    qty: string | null,
    unit: string | null,
    scale: number,
    scaleQty: ((q: string, s: number) => string) | undefined,
    useMetric: boolean,
    recipeConversion?: 'do_not_convert' | 'smart' | 'always',
    volumePreference?: 'metric' | 'us',
    rounding?: 'rounded' | 'exact',
    name?: string
  ) => string;
  assumedLabel: (name: string) => string | null;
};

const IngredientRow: React.FC<Props> = ({
  id,
  raw,
  servingScale,
  scaleQuantity,
  checked,
  onToggle,
  useMetric,
  recipeConversion = 'smart',
  volumePreference = 'metric',
  rounding = 'rounded',
  parseRawIngredient,
  formatQty,
  assumedLabel,
}) => {
  const {
    name,
    note,
    quantity,
    unit,
    needsReview,
    isApprox,
    qtyRange,
    quantity_type,
    quantityType,
  } = parseRawIngredient(raw);

  let displayQty = '';
  let displayUnit = '';

  if (qtyRange) {
    displayQty = `${qtyRange.min}–${qtyRange.max}`;
    displayUnit = qtyRange.unit || unit || '';
  } else if (quantity) {
    const fmted = formatQty(
      quantity,
      unit,
      servingScale,
      scaleQuantity,
      useMetric,
      recipeConversion,
      volumePreference,
      rounding,
      name
    );

    const parts = fmted.trim().split(/\s+/);

    displayQty = parts[0] || '';
    displayUnit = parts.slice(1).join(' ') || '';
  }

  const hasMeasurement = Boolean(displayQty);
  const quantityTypeText = hasMeasurement ? '' : quantityTypeLabel(quantity_type || quantityType);
  const assumed = needsReview ? assumedLabel(name) : null;
  const interactive = Boolean(onToggle);

  return (
    <li
      onClick={interactive ? () => onToggle?.(id) : undefined}
      className={`flex items-center gap-3 px-4 py-3 group transition-all ${
        interactive ? 'cursor-pointer' : ''
      } ${
        checked ? 'bg-emerald-50/40 opacity-80' : interactive ? 'hover:bg-gray-50/70' : ''
      }`}
    >
      {interactive && (
        <div className="shrink-0">
          <div
            className={`flex h-[22px] w-[22px] items-center justify-center rounded-[7px] border-[1.5px] transition-all ${
              checked
                ? 'border-emerald-600 bg-emerald-600 shadow-[0_3px_10px_rgba(5,150,105,0.18)]'
                : 'border-gray-200 bg-white group-hover:border-primary-300'
            }`}
          >
            {checked && (
              <Check size={9} className="text-white" strokeWidth={3} />
            )}
          </div>
        </div>
      )}

      <div className="grid min-w-0 flex-1 grid-cols-[72px_minmax(0,1fr)] items-center gap-x-3">
        {hasMeasurement && !needsReview && (
          <span
            className={`tabular-nums text-[13px] font-black ${
              checked ? 'text-gray-500' : 'text-primary-600'
            }`}
          >
            {displayQty}
            {displayUnit && <span className="font-bold"> {displayUnit}</span>}
          </span>
        )}
        {!hasMeasurement && (
          <span
            className={`text-[12px] italic ${
              checked ? 'text-gray-400' : 'text-gray-400'
            }`}
          >
            {needsReview && assumed && !checked
              ? assumed
              : !needsReview && quantityTypeText && !checked
                ? quantityTypeText
                : ''}
          </span>
        )}

        <span
          className={`min-w-0 text-[13.5px] leading-snug ${
            checked
              ? 'text-gray-500 line-through decoration-gray-400'
              : 'text-gray-800 font-medium'
          }`}
        >
          {name}
        </span>
      </div>
    </li>
  );
};

export default IngredientRow;
