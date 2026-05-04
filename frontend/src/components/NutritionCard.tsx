import { useMemo, useState } from "react";
import { calculateNutrition, type NutritionTotals } from "../utils/nutritionCalc";

type NutritionCardProps = {
  ingredients: any[];
  servings?: number;
  recipeName?: string;
};

type ViewMode = "serving" | "per100g" | "total";

const fmt = (value: number, unit = "g") => {
  if (unit === "kcal") return `${Math.round(value)} kcal`;
  if (value > 0 && value < 0.5) return `<1${unit}`;
  return `${Math.round(value * 10) / 10}${unit}`;
};

const fmtRing = (value: number) => {
  if (value > 0 && value < 0.5) return "<1";
  return String(Math.round(value));
};

const traffic = (kind: string, value: number) => {
  const v = Number(value) || 0;

  if (kind === "fat") {
    if (v <= 3) return { label: "LOW", cls: "bg-green-500 text-white" };
    if (v <= 17.5) return { label: "MED", cls: "bg-amber-400 text-gray-950" };
    return { label: "HIGH", cls: "bg-red-500 text-white" };
  }

  if (kind === "saturates") {
    if (v <= 1.5) return { label: "LOW", cls: "bg-green-500 text-white" };
    if (v <= 5) return { label: "MED", cls: "bg-amber-400 text-gray-950" };
    return { label: "HIGH", cls: "bg-red-500 text-white" };
  }

  if (kind === "sugars") {
    if (v <= 5) return { label: "LOW", cls: "bg-green-500 text-white" };
    if (v <= 22.5) return { label: "MED", cls: "bg-amber-400 text-gray-950" };
    return { label: "HIGH", cls: "bg-red-500 text-white" };
  }

  if (kind === "salt") {
    if (v <= 0.3) return { label: "LOW", cls: "bg-green-500 text-white" };
    if (v <= 1.5) return { label: "MED", cls: "bg-amber-400 text-gray-950" };
    return { label: "HIGH", cls: "bg-red-500 text-white" };
  }

  return { label: "", cls: "bg-gray-100 text-gray-700" };
};

function NutriScoreVisual({ letter }: { letter: "A" | "B" | "C" | "D" | "E" }) {
  const slots = [
    { l: "A", fill: "#038141", textFill: "white" },
    { l: "B", fill: "#85BB2F", textFill: "white" },
    { l: "C", fill: "#FECB02", textFill: "white" },
    { l: "D", fill: "#EE8100", textFill: "white" },
    { l: "E", fill: "#E63E11", textFill: "white" },
  ] as const;

  const activeIdx = Math.max(0, slots.findIndex((slot) => slot.l === letter));
  const activeSlot = slots[activeIdx];
  const barX = 35;
  const barY = 18;
  const slotW = 48;
  const barH = 52;
  const pillW = 66;
  const pillH = 76;
  const pillX = barX + activeIdx * slotW + slotW / 2 - pillW / 2;
  const pillY = 6;
  const pillCx = pillX + pillW / 2;
  const clipId = `nutri-score-bar-${letter}`;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
          Nutri-Score · estimated
        </p>
        <p className="text-[10px] font-bold text-gray-400">per 100g</p>
      </div>

      <svg
        viewBox="0 0 310 88"
        role="img"
        aria-label={`Estimated Nutri-Score ${letter}`}
        className="mx-auto block h-auto w-full max-w-[280px]"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={barX} y={barY} width={slotW * slots.length} height={barH} rx="18" ry="18" />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          {slots.map((slot, idx) => (
            <rect
              key={slot.l}
              x={barX + idx * slotW}
              y={barY}
              width={slotW}
              height={barH}
              fill={slot.fill}
            />
          ))}
        </g>

        {slots.map((slot, idx) => {
          const isActive = slot.l === letter;
          const cx = barX + idx * slotW + slotW / 2;

          return (
            <text
              key={slot.l}
              x={cx}
              y={barY + 35}
              textAnchor="middle"
              fill={isActive ? "transparent" : "rgba(255,255,255,0.42)"}
              fontSize="24"
              fontWeight="900"
              fontFamily="Arial, Helvetica, sans-serif"
            >
              {slot.l}
            </text>
          );
        })}

        <rect
          x={pillX}
          y={pillY}
          width={pillW}
          height={pillH}
          rx="24"
          ry="24"
          fill={activeSlot.fill}
          stroke="white"
          strokeWidth="5"
        />

        <text
          x={pillCx}
          y={pillY + 52}
          textAnchor="middle"
          fill={activeSlot.textFill}
          fontSize="42"
          fontWeight="900"
          fontFamily="Arial, Helvetica, sans-serif"
        >
          {letter}
        </text>
      </svg>

      <p className="mt-2 text-center text-[10px] leading-relaxed text-gray-400">
        Estimated from per-100g values. Not a certified regulatory label.
      </p>
    </div>
  );
}

function MacroRing({
  label,
  value,
  unit,
  target,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  target: number;
  color: string;
}) {
  const radius = 27;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0.04, Math.min(1, value / target));
  const dashOffset = circumference * (1 - pct);

  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <div className="relative h-16 w-16">
        <svg viewBox="0 0 64 64" className="absolute inset-0 h-16 w-16" aria-hidden="true">
          <circle cx="32" cy="32" r={radius} stroke="#f3f4f6" strokeWidth="6" fill="none" />
          <circle
            cx="32"
            cy="32"
            r={radius}
            stroke={color}
            strokeWidth="6"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 32 32)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-black leading-none text-gray-950">
            {fmtRing(value)}
          </span>
          <span className="mt-0.5 text-[9px] font-bold leading-none text-gray-400">
            {unit}
          </span>
        </div>
      </div>
      <span className="text-center text-[9px] font-black uppercase tracking-wider text-gray-400">
        {label}
      </span>
    </div>
  );
}

const riPct = (value: number, reference: number) =>
  `${Math.max(0, Math.round((value / reference) * 100))}%`;

function UKTrafficLightGrid({
  per100g,
  perServing,
  saltMissing,
}: {
  per100g: NutritionTotals;
  perServing: NutritionTotals;
  saltMissing: boolean;
}) {
  const cells = [
    {
      key: "fat",
      label: "Fat",
      display: fmt(per100g.fat_g),
      pct: riPct(perServing.fat_g, 70),
      value: per100g.fat_g,
    },
    {
      key: "saturates",
      label: "Saturates",
      display: fmt(per100g.saturates_g),
      pct: riPct(perServing.saturates_g, 20),
      value: per100g.saturates_g,
    },
    {
      key: "sugars",
      label: "Sugars",
      display: fmt(per100g.sugars_g),
      pct: riPct(perServing.sugars_g, 90),
      value: per100g.sugars_g,
    },
    {
      key: "salt",
      label: "Salt",
      display: saltMissing ? "Needs qty" : fmt(per100g.salt_g),
      pct: saltMissing ? "—" : riPct(perServing.salt_g, 6),
      value: per100g.salt_g,
      forcedLabel: saltMissing ? "" : undefined,
      forcedClass: saltMissing ? "bg-amber-500 text-white" : undefined,
    },
  ];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
          UK traffic light · per 100g
        </p>
        <p className="text-[10px] font-bold text-gray-400">RI per portion</p>
      </div>

      <div className="grid grid-cols-5 overflow-hidden rounded-2xl border border-gray-200 text-center text-[10px]">
        <div className="border-r border-white bg-gray-50">
          <div className="flex h-full min-h-[70px] flex-col items-center justify-center px-1 py-2 text-gray-700">
            <p className="text-[9px] font-black uppercase tracking-wide text-gray-500">Energy</p>
            <p className="mt-1 text-[12px] font-black">{Math.round(per100g.calories * 4.184)}kJ</p>
            <p className="text-[12px] font-black">{Math.round(per100g.calories)}kcal</p>
          </div>
          <div className="bg-gray-100 py-1 text-[10px] font-black text-gray-500">
            {riPct(perServing.calories, 2000)}
          </div>
        </div>

        {cells.map((item) => {
          const level = traffic(item.key, item.value);
          return (
            <div key={item.key} className="border-r border-white last:border-r-0">
              <div className={`${item.forcedClass ?? level.cls} flex min-h-[70px] flex-col items-center justify-center px-1 py-2`}>
                <p className="text-[9px] font-black uppercase tracking-wide">{item.label}</p>
                <p className="mt-1 text-[12px] font-black leading-none">{item.display}</p>
                {(item.forcedLabel ?? level.label) && (
                  <p className="mt-1 rounded-full bg-black/10 px-1.5 py-0.5 text-[8px] font-black uppercase">
                    {item.forcedLabel ?? level.label}
                  </p>
                )}
              </div>
              <div className="bg-gray-100 py-1 text-[10px] font-black text-gray-500">
                {item.pct}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-1.5 text-center text-[10px] leading-relaxed text-gray-400">
        Traffic-light colours use typical UK per-100g thresholds. Percentages are adult reference intake per portion.
      </p>
    </div>
  );
}


function ValueTable({
  values,
  label,
  saltMissing,
}: {
  values: NutritionTotals;
  label: string;
  saltMissing: boolean;
}) {
  const rows = [
    ["Energy", fmt(values.calories, "kcal")],
    ["Protein", fmt(values.protein_g)],
    ["Carbohydrate", fmt(values.carbs_g)],
    ["Fat", fmt(values.fat_g)],
    ["Saturates", fmt(values.saturates_g)],
    ["Sugars", fmt(values.sugars_g)],
    ["Salt", saltMissing ? "needs quantity" : fmt(values.salt_g)],
    ["Fiber", fmt(values.fiber_g)],
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className="bg-rose-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-rose-500">
        {label}
      </div>
      {rows.map(([name, value]) => (
        <div key={name} className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-sm">
          <span className="font-medium text-gray-600">{name}</span>
          <span className="font-black text-gray-950">{value}</span>
        </div>
      ))}
    </div>
  );
}

export default function NutritionCard({ ingredients, servings, recipeName }: NutritionCardProps) {
  const [mode, setMode] = useState<ViewMode>("serving");
  const nutrition = useMemo(
    () => calculateNutrition(ingredients, servings, { recipeName }),
    [ingredients, servings, recipeName]
  );

  const hasUsableNutrition =
    nutrition.totalWeightG >= 50 &&
    (
      nutrition.totalRecipe.calories > 0 ||
      nutrition.totalRecipe.protein_g > 0 ||
      nutrition.totalRecipe.carbs_g > 0 ||
      nutrition.totalRecipe.fat_g > 0
    );

  const nutritionNotes = useMemo(() => {
    const assumptions: string[] = [];
    const missing: string[] = [];

    const labelFor = (ingredient: any) =>
      String(
        ingredient?.item ??
        ingredient?.name ??
        ingredient?.ingredient ??
        ingredient?.displayName ??
        ingredient?.rawText ??
        "ingredient"
      );

    ingredients.forEach((ingredient: any) => {
      const label = labelFor(ingredient);

      const hasQuantity =
        ingredient?.quantity !== null &&
        ingredient?.quantity !== undefined &&
        ingredient?.quantity !== "" &&
        ingredient?.quantity !== "to taste" &&
        ingredient?.quantity !== "as needed";

      const hasRange =
        ingredient?.quantityRange?.min !== null &&
        ingredient?.quantityRange?.min !== undefined &&
        ingredient?.quantityRange?.unit;

      if (hasRange && !hasQuantity) {
        assumptions.push(
          `${label} estimated at ${ingredient.quantityRange.min}${ingredient.quantityRange.unit} from a ${ingredient.quantityRange.min}–${ingredient.quantityRange.max}${ingredient.quantityRange.unit} range.`
        );
        return;
      }

      if (!hasQuantity && !hasRange) {
        missing.push(label);
      }
    });

    if (nutrition.servingEstimateReason === "source") {
      assumptions.unshift(`Nutrition estimated for ${nutrition.effectiveServings} servings.`);
    } else if (nutrition.servingEstimateReason === "sauce_portion" && nutrition.servingSizeG) {
      assumptions.unshift(`No serving count found. Per portion estimated as ${nutrition.servingSizeG}g for a sauce, dip, or spread.`);
    } else if (nutrition.servingEstimateReason === "weight_portion" && nutrition.servingSizeG) {
      assumptions.unshift(`No serving count found. Per portion estimated as ${nutrition.servingSizeG}g.`);
    } else {
      assumptions.unshift("No serving count found. Per portion currently equals the total calculated recipe.");
    }

    return { assumptions, missing };
  }, [ingredients, servings, nutrition.effectiveServings, nutrition.servingEstimateReason, nutrition.servingSizeG]);

  const saltMissing = nutritionNotes.missing.some((x) => {
    const value = x.toLowerCase();
    return value.includes("salt") || value.includes("sel");
  });

  const activeValues =
    mode === "serving" ? nutrition.perServing :
    mode === "per100g" ? nutrition.per100g :
    nutrition.totalRecipe;

  const activeLabel =
    mode === "serving" ? "Per portion" :
    mode === "per100g" ? "Per 100g" :
    "Total recipe";

  if (!hasUsableNutrition) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Estimated</p>
          <h3 className="text-lg font-semibold text-gray-950">Nutrition values</h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            Not enough quantity data to calculate reliable nutrition for this recipe.
          </p>
          <p className="mt-3 text-xs text-gray-400">
            Key ingredient quantities are missing. Add quantities to improve the estimate.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Estimated</p>
        <h3 className="text-lg font-semibold text-gray-950">Nutrition values</h3>
        <p className="mt-1 text-xs text-gray-500">
          Nutrition estimated from main ingredients · partial estimate.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-4 gap-3">
        <MacroRing label="Calories" value={nutrition.perServing.calories} unit="kcal" target={700} color="#f59e0b" />
        <MacroRing label="Protein" value={nutrition.perServing.protein_g} unit="g" target={50} color="#e11d48" />
        <MacroRing label="Carbs" value={nutrition.perServing.carbs_g} unit="g" target={90} color="#7c3aed" />
        <MacroRing label="Fats" value={nutrition.perServing.fat_g} unit="g" target={35} color="#10b981" />
      </div>

      <div className="mb-4 border-t border-gray-100" />

      <div className="mb-4 grid grid-cols-3 rounded-2xl bg-gray-100 p-1 text-xs font-bold">
        {[
          { key: "serving", label: "Per portion" },
          { key: "per100g", label: "Per 100g" },
          { key: "total", label: "Total" },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setMode(item.key as ViewMode)}
            className={`rounded-xl px-2 py-2 transition ${mode === item.key ? "bg-white text-rose-600 shadow-sm" : "text-gray-500"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <ValueTable values={activeValues} label={activeLabel} saltMissing={saltMissing} />

      <div className="my-4 border-t border-gray-100" />

      <UKTrafficLightGrid
        per100g={nutrition.per100g}
        perServing={nutrition.perServing}
        saltMissing={saltMissing}
      />

      <div className="my-4 border-t border-gray-100" />

      <NutriScoreVisual letter={nutrition.nutriScore.letter} />

      {(nutritionNotes.assumptions.length > 0 || nutritionNotes.missing.length > 0) && (
        <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
            Assumptions
          </p>

          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-amber-900">
            {nutritionNotes.assumptions.map((note, idx) => (
              <li key={`assumption-${idx}`}>• {note}</li>
            ))}

            {nutritionNotes.missing.length > 0 && (
              <li>
                • Missing quantities excluded from calculation: {nutritionNotes.missing.join(", ")}.
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Health estimate
            </p>
            <h4 className="mt-1 text-sm font-black text-gray-950">
              Needs review
            </h4>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700">
            Estimated
          </span>
        </div>

        <ul className="space-y-1.5 text-xs leading-relaxed text-gray-600">
          {nutrition.perServing.protein_g >= 20 && <li>• High protein per serving.</li>}
          {nutrition.per100g.fat_g >= 17.5 && <li>• High fat per 100g.</li>}
          {nutrition.per100g.saturates_g >= 5 && <li>• High saturated fat per 100g.</li>}
          {nutrition.per100g.carbs_g <= 5 && <li>• Low carbohydrate estimate.</li>}
          {nutritionNotes.missing.some((x) => x.toLowerCase().includes("salt") || x.toLowerCase().includes("sel")) && (
            <li>• Salt is present but quantity is unknown.</li>
          )}
        </ul>

        <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
          This is a Recolekt estimate based on detected ingredients and usable quantities. It is not an official Nutri-Score or medical nutrition label.
        </p>
      </div>
    </section>
  );
}
