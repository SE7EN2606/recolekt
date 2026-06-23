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
    emoji,
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
      className={`flex items-start gap-3 px-5 py-[11px] group transition-all ${
        interactive ? 'cursor-pointer' : ''
      } ${
        checked ? 'opacity-75' : interactive ? 'hover:bg-gray-50/60' : ''
      }`}
    >
      {interactive && (
        <div className="flex-shrink-0 mt-[3px]">
          <div
            className={`w-5 h-5 rounded-[6px] border-[1.5px] flex items-center justify-center transition-all ${
              checked
                ? 'border-emerald-600 bg-emerald-600'
                : 'border-gray-200 bg-transparent group-hover:border-primary-300'
            }`}
          >
            {checked && (
              <Check size={9} className="text-white" strokeWidth={3} />
            )}
          </div>
        </div>
      )}

      {emoji && (
        <span
          className={`text-[15px] leading-none flex-shrink-0 mt-[1px] ${
            checked ? 'grayscale' : ''
          }`}
        >
          {emoji}
        </span>
      )}

      <div className="flex-1 min-w-0 flex items-baseline flex-wrap gap-x-1.5">
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

        {needsReview && assumed && !checked && (
          <span className="text-[12px] text-gray-400 italic font-normal">
            {assumed}
          </span>
        )}

        {!hasMeasurement && !needsReview && quantityTypeText && !checked && (
          <span className="text-[12px] text-gray-400 italic font-normal">
            {quantityTypeText}
          </span>
        )}

        <span
          className={`text-[13px] leading-snug ${
            checked
              ? 'text-gray-500 line-through decoration-gray-400'
              : 'text-gray-800 font-medium'
          }`}
        >
          {name}
        </span>

        {isApprox && !checked && (
          <span className="text-[10px] text-gray-400 italic">
            (approx.)
          </span>
        )}

        {note && !checked && (
          <span className="text-[11px] text-gray-400 italic">
            ({note})
          </span>
        )}
      </div>
    </li>
  );
};

export default IngredientRow;
