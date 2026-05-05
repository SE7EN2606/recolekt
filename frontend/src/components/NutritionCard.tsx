import { useMemo, useState } from "react";
import { calculateNutrition, type NutritionTotals } from "../utils/nutritionCalc";

type NutritionCardProps = {
  ingredients: any[];
  servings?: number;
  recipeName?: string;
};

type ViewMode = "serving" | "per100g" | "table";

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
        Estimated from recipe ingredients. Not a certified regulatory label.
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


function scaleNutritionValues<T extends Record<string, number>>(values: T, scale: number): T {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === "number" ? value * scale : value,
    ])
  ) as T;
}

function formatPortionSize(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${Math.round(value)}g`;
}


function NutritionFactsTable({
  servingValues,
  totalValues,
  servingSizeG,
  totalWeightG,
  saltMissing,
}: {
  servingValues: NutritionTotals;
  totalValues: NutritionTotals;
  servingSizeG?: number | null;
  totalWeightG?: number | null;
  saltMissing: boolean;
}) {
  const rows = [
    {
      label: "Energy",
      serving: fmt(servingValues.calories, "kcal"),
      total: fmt(totalValues.calories, "kcal"),
      strong: true,
    },
    {
      label: "Protein",
      serving: fmt(servingValues.protein_g),
      total: fmt(totalValues.protein_g),
      strong: true,
    },
    {
      label: "Total fat",
      serving: fmt(servingValues.fat_g),
      total: fmt(totalValues.fat_g),
      strong: true,
    },
    {
      label: "Saturated fat",
      serving: fmt(servingValues.saturates_g),
      total: fmt(totalValues.saturates_g),
      indent: true,
    },
    {
      label: "Total carbohydrate",
      serving: fmt(servingValues.carbs_g),
      total: fmt(totalValues.carbs_g),
      strong: true,
    },
    {
      label: "Sugars",
      serving: fmt(servingValues.sugars_g),
      total: fmt(totalValues.sugars_g),
      indent: true,
    },
    {
      label: "Fiber",
      serving: fmt(servingValues.fiber_g),
      total: fmt(totalValues.fiber_g),
      indent: true,
    },
    {
      label: "Salt",
      serving: saltMissing ? "see notes" : fmt(servingValues.salt_g),
      total: saltMissing ? "see notes" : fmt(totalValues.salt_g),
      strong: true,
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-gray-950 bg-white shadow-sm">
      <div className="border-b-8 border-gray-950 px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-500">
          Home cooking estimate
        </p>
        <h4 className="mt-1 text-3xl font-black leading-none tracking-tight text-gray-950">
          Nutrition facts
        </h4>

        <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-xl border border-rose-100 bg-rose-50 text-sm">
          <div className="border-r border-rose-100 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-rose-400">
              Serving
            </p>
            <p className="mt-0.5 font-black text-gray-950">
              {servingSizeG ? formatPortionSize(servingSizeG) : "estimated"}
            </p>
          </div>
          <div className="px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-rose-400">
              Total recipe
            </p>
            <p className="mt-0.5 font-black text-gray-950">
              {totalWeightG ? formatPortionSize(totalWeightG) : "estimated"}
            </p>
          </div>
        </div>
      </div>

      <div className="border-b-8 border-gray-950 px-4 py-3">
        <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">
          Calories
        </p>
        <div className="mt-1 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Serving
            </p>
            <p className="text-3xl font-black leading-none text-gray-950 tabular-nums">
              {Math.round(servingValues.calories || 0)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Total
            </p>
            <p className="text-3xl font-black leading-none text-gray-950 tabular-nums">
              {Math.round(totalValues.calories || 0)}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 py-2">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b-4 border-gray-950 pb-1 text-right text-xs font-black text-gray-950">
          <span className="text-left">Nutrient</span>
          <span>Serving</span>
          <span>Total</span>
        </div>

        <div className="divide-y divide-gray-200">
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 py-2 text-sm"
            >
              <div className={row.indent ? "pl-4" : ""}>
                <span className={row.strong ? "font-black text-gray-950" : "font-semibold text-gray-700"}>
                  {row.label}
                </span>
              </div>

              <div className="font-black text-gray-950 tabular-nums">
                {row.serving}
              </div>

              <div className="font-black text-gray-950 tabular-nums">
                {row.total}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 border-t-8 border-gray-950 pt-3 text-[11px] leading-relaxed text-gray-500">
          <p>
            Recolekt estimates these values from detected recipe ingredients and usable quantities. Missing quantities are excluded from the calculation.
          </p>
        </div>
      </div>
    </div>
  );
}


type MacroBalanceInput = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

const riPct = (value: number, reference: number) =>
  `${Math.max(0, Math.round((value / reference) * 100))}%`;

function pct(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((value / total) * 100);
}


function MacroDonut({
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
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const pctValue = Math.max(0.04, Math.min(0.92, safeValue / target));
  const radius = 41;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * pctValue;
  const displayUnit = unit === "kcal" ? "kcal" : "grams";

  return (
    <div className="flex min-w-0 flex-col items-center">
      <div className="relative h-[96px] w-[96px]">
        <svg viewBox="0 0 108 108" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <circle
            cx="54"
            cy="54"
            r={radius}
            stroke="#f1f2f5"
            strokeWidth="7"
            fill="none"
          />
          <circle
            cx="54"
            cy="54"
            r={radius}
            stroke={color}
            strokeWidth="7"
            fill="none"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeLinecap="round"
            transform="rotate(-90 54 54)"
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[24px] font-semibold leading-none tracking-tight text-gray-950">
            {unit === "kcal" ? Math.round(safeValue) : fmtRing(safeValue)}
          </span>
          <span className="mt-1 text-[12px] font-medium leading-none text-gray-400">
            {displayUnit}
          </span>
        </div>
      </div>

      <span className="mt-3 text-center text-[12px] font-extrabold uppercase tracking-[0.12em] text-gray-400">
        {label}
      </span>
    </div>
  );
}

function MacroBreakdownDonuts({ values }: { values: MacroBalanceInput }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
        <MacroDonut
          label="Calories"
          value={values.calories}
          unit="kcal"
          target={700}
          color="#f59e0b"
        />
        <MacroDonut
          label="Protein"
          value={values.protein_g}
          unit="grams"
          target={50}
          color="#e11d48"
        />
        <MacroDonut
          label="Carbs"
          value={values.carbs_g}
          unit="grams"
          target={90}
          color="#7c3aed"
        />
        <MacroDonut
          label="Fats"
          value={values.fat_g}
          unit="grams"
          target={35}
          color="#10b981"
        />
      </div>
    </div>
  );
}


function nutrientLevel(
  kind: "fat" | "saturates" | "sugars" | "salt" | "fiber",
  value: number
): "low" | "medium" | "high" {
  const v = Number(value) || 0;

  if (kind === "fat") {
    if (v <= 3) return "low";
    if (v <= 17.5) return "medium";
    return "high";
  }

  if (kind === "saturates") {
    if (v <= 1.5) return "low";
    if (v <= 5) return "medium";
    return "high";
  }

  if (kind === "sugars") {
    if (v <= 5) return "low";
    if (v <= 22.5) return "medium";
    return "high";
  }

  if (kind === "salt") {
    if (v <= 0.3) return "low";
    if (v <= 1.5) return "medium";
    return "high";
  }

  // Fiber is inverted: higher is better. Product heuristic, not a UK traffic-light rule.
  if (v >= 6) return "low";
  if (v >= 3) return "medium";
  return "high";
}


function NutrientTrafficStrip({
  per100g,
  perServing,
  saltMissing,
  servingSizeG,
}: {
  per100g: any;
  perServing: any;
  saltMissing: boolean;
  servingSizeG?: number | null;
}) {
  const energyKj = Math.round((perServing.calories || 0) * 4.184);
  const shownAmountLabel = servingSizeG ? `${Math.round(servingSizeG)}g` : "selected amount";

  const levelClass = (level: "low" | "medium" | "high" | "neutral") => {
    if (level === "low") return "bg-[#12b24b] text-white";
    if (level === "medium") return "bg-[#f59e0b] text-white";
    if (level === "high") return "bg-[#ef233c] text-white";
    return "bg-white text-gray-950";
  };

  const cells = [
    {
      key: "energy",
      label: "Energy",
      value: (
        <>
          <span>{energyKj}kJ</span>
          <span>{Math.round(perServing.calories || 0)}kcal</span>
        </>
      ),
      badge: "",
      pct: riPct(perServing.calories || 0, 2000),
      level: "neutral" as const,
    },
    {
      key: "fat",
      label: "Fat",
      value: fmt(perServing.fat_g || 0),
      badge: nutrientLevel("fat", per100g.fat_g || 0).toUpperCase(),
      pct: riPct(perServing.fat_g || 0, 70),
      level: nutrientLevel("fat", per100g.fat_g || 0),
    },
    {
      key: "saturates",
      label: "Saturates",
      value: fmt(perServing.saturates_g || 0),
      badge: nutrientLevel("saturates", per100g.saturates_g || 0).toUpperCase(),
      pct: riPct(perServing.saturates_g || 0, 20),
      level: nutrientLevel("saturates", per100g.saturates_g || 0),
    },
    {
      key: "sugars",
      label: "Sugars",
      value: fmt(perServing.sugars_g || 0),
      badge: nutrientLevel("sugars", per100g.sugars_g || 0).toUpperCase(),
      pct: riPct(perServing.sugars_g || 0, 90),
      level: nutrientLevel("sugars", per100g.sugars_g || 0),
    },
    {
      key: "salt",
      label: "Salt",
      value: saltMissing ? "N/A" : fmt(perServing.salt_g || 0),
      badge: saltMissing ? "N/A" : nutrientLevel("salt", per100g.salt_g || 0).toUpperCase(),
      pct: saltMissing ? "—" : riPct(perServing.salt_g || 0, 6),
      level: saltMissing ? "medium" as const : nutrientLevel("salt", per100g.salt_g || 0),
    },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-3 py-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
          UK traffic light
        </p>
        <p className="text-right text-[10px] font-black leading-tight text-gray-400">
          % RI
        </p>
      </div>

      <div className="grid grid-cols-5 gap-0">
        {cells.map((cell) => {
          const colorClass = levelClass(cell.level);
          const isEnergy = cell.key === "energy";

          return (
            <div
              key={cell.key}
              className="min-w-0 overflow-hidden rounded-[28px] border border-black/10 bg-gray-100 text-center -ml-px first:ml-0"
            >
              <div className={`flex min-h-[88px] flex-col items-center justify-start px-1.5 py-2 ${colorClass}`}>
                <p className="text-[10px] font-black uppercase leading-tight">
                  {cell.label}
                </p>

                <div className="mt-1 flex min-h-[34px] flex-col items-center justify-center text-[13px] font-extrabold leading-tight">
                  {cell.value}
                </div>
              </div>

              <div className={isEnergy ? "" : "border-t border-black/10"}>
                <div className={`${isEnergy ? "bg-white" : "bg-gray-100"} min-h-[20px] px-1 py-1 text-[9px] font-black uppercase leading-none text-gray-950`}>
                  {isEnergy ? "\u00a0" : cell.badge}
                </div>
                <div className={`border-t border-black/10 px-1 py-1 text-[12px] font-black leading-none tabular-nums ${colorClass}`}>
                  {cell.pct}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 text-center text-xs leading-relaxed text-gray-400">
        <p>% of adult&apos;s reference intake for the amount shown.</p>
        <p>
          Values shown for {shownAmountLabel}. Traffic-light colours use UK per-100g thresholds.
        </p>
      </div>
    </div>
  );
}


export default function NutritionCard({ ingredients, servings, recipeName }: NutritionCardProps) {
  const [mode, setMode] = useState<ViewMode>("serving");
  const [portionScale, setPortionScale] = useState(1);
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

  const hasServingSize =
    typeof nutrition.servingSizeG === "number" &&
    Number.isFinite(nutrition.servingSizeG) &&
    nutrition.servingSizeG > 0;

  const adjustedServingSizeG = hasServingSize
    ? Math.max(25, Math.round(nutrition.servingSizeG * portionScale))
    : null;

  const adjustedPerServing = scaleNutritionValues(nutrition.perServing, portionScale);

  const activePortionSizeG =
    mode === "serving" || mode === "table" ? adjustedServingSizeG :
    100;

  const activePortionHelper =
    mode === "serving" || mode === "table" ? "estimated serving weight" :
    "reference amount";

  const handlePortionScale = (nextScale: number) => {
    setPortionScale(Math.max(0.25, Math.min(4, Number(nextScale.toFixed(3)))));
    setMode("serving");
  };

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

      <div>
          <div className="mb-4 grid grid-cols-3 rounded-2xl bg-gray-100 p-1 text-xs font-bold">
            {[
              { key: "serving", label: "Serving" },
              { key: "per100g", label: "Per 100g" },
              { key: "table", label: "Table" },
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

          {activePortionSizeG && (
            <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50/60 px-4 py-3">
              <div className="flex min-h-[38px] flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-rose-400">
                    Portion size
                  </p>
                  <p className="mt-0.5 text-sm font-black text-gray-900">
                    {formatPortionSize(activePortionSizeG)}
                    <span className="ml-1 text-[11px] font-bold text-gray-400">
                      {activePortionHelper}
                    </span>
                  </p>
                </div>

                {mode === "serving" ? (
                  <div className="flex items-center gap-1.5 rounded-xl border border-rose-100 bg-white px-2 py-1">
                    <button
                      type="button"
                      onClick={() => handlePortionScale(portionScale - 0.25)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-sm font-black text-rose-600 transition hover:bg-rose-100"
                    >
                      −
                    </button>
                    <span className="min-w-[54px] text-center text-[11px] font-black text-rose-600 tabular-nums">
                      {Math.round(portionScale * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePortionScale(portionScale + 0.25)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-sm font-black text-rose-600 transition hover:bg-rose-100"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <div className="hidden h-[38px] min-w-[116px] sm:block" aria-hidden="true" />
                )}
              </div>
            </div>
          )}

          {mode === "serving" ? (
            <div className="space-y-4">
              <MacroBreakdownDonuts values={adjustedPerServing} />
              <NutrientTrafficStrip
                per100g={nutrition.per100g}
                perServing={adjustedPerServing}
                saltMissing={saltMissing}
                servingSizeG={adjustedServingSizeG}
              />
            </div>
          ) : mode === "per100g" ? (
            <div className="space-y-4">
              <MacroBreakdownDonuts values={nutrition.per100g} />
              <NutrientTrafficStrip
                per100g={nutrition.per100g}
                perServing={nutrition.per100g}
                saltMissing={saltMissing}
                servingSizeG={100}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <NutritionFactsTable
                servingValues={adjustedPerServing}
                totalValues={nutrition.totalRecipe}
                servingSizeG={adjustedServingSizeG}
                totalWeightG={nutrition.totalWeightG}
                saltMissing={saltMissing}
              />
              <NutriScoreVisual letter={nutrition.nutriScore.letter} />
            </div>
          )}

          <div className="my-4 border-t border-gray-100" />

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
              {adjustedPerServing.protein_g >= 20 && <li>• High protein per serving.</li>}
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
      </div>
    </section>
  );
}
