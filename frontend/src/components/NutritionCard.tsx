import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { calculateNutrition } from "../utils/nutritionCalc";
import { NutriScoreVisual } from "../features/recipe-secondary/nutrition/NutritionShared";
import {
  RecipeNutritionCard,
  MacroRingGrid,
  NutrientTrafficStrip,
} from "../features/recipe-secondary/nutrition";
import {
  scaleNutritionValues,
  formatPortionSize,
} from "../features/recipe-secondary/nutrition/utils/nutritionFormatting";
import { markPerfStep } from "../lib/perf";

type NutritionCardProps = {
  ingredients: any[];
  servings?: number;
  recipeName?: string;
  embedded?: boolean;
};

type ViewMode = "serving" | "per100g" | "table";

const formatTableNumber = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value > 0 && value < 0.5) return "<1";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(Math.round(rounded)) : String(rounded);
};

function HomeCookingEstimateTable({
  servingValues,
  servingsCount,
  servingSizeG,
  totalWeightG,
  saltMissing,
}: {
  servingValues: {
    calories: number;
    protein_g: number;
    fat_g: number;
    saturates_g: number;
    carbs_g: number;
    sugars_g: number;
    fiber_g: number;
    salt_g: number;
  };
  servingsCount: number;
  servingSizeG?: number | null;
  totalWeightG?: number | null;
  saltMissing: boolean;
}) {
  const safeServingsCount = Number.isFinite(servingsCount) && servingsCount > 0 ? servingsCount : 1;
  const resolvedTotalWeightG =
    servingSizeG && safeServingsCount
      ? Math.round(servingSizeG * safeServingsCount)
      : totalWeightG && totalWeightG > 0
        ? Math.round(totalWeightG)
        : null;

  const perServingKcal = Math.round(servingValues.calories || 0);
  const totalKcal = Math.round((servingValues.calories || 0) * safeServingsCount);

  const topLineParts = [
    servingSizeG ? `${Math.round(servingSizeG)}g serving` : null,
    resolvedTotalWeightG ? `${resolvedTotalWeightG}g total` : null,
  ].filter(Boolean);

  const rows = [
    { label: "Energy", key: "calories", sub: false, unit: "kcal" },
    { label: "Protein", key: "protein_g", sub: false, unit: "g" },
    { label: "Total fat", key: "fat_g", sub: false, unit: "g" },
    { label: "Saturated fat", key: "saturates_g", sub: true, unit: "g" },
    { label: "Total carbohydrate", key: "carbs_g", sub: false, unit: "g" },
    { label: "Sugars", key: "sugars_g", sub: true, unit: "g" },
    { label: "Fiber", key: "fiber_g", sub: true, unit: "g" },
    { label: "Salt", key: "salt_g", sub: false, unit: "g" },
  ] as const;

  const renderValue = (key: typeof rows[number]["key"], unit: "g" | "kcal", multiplier = 1) => {
    if (key === "salt_g" && saltMissing) return "0g";
    const value = (servingValues[key] || 0) * multiplier;
    if (unit === "kcal") return `${Math.round(value)} kcal`;
    return `${formatTableNumber(value)}g`;
  };

  return (
    <div className="mb-4 rounded-[16px] border border-slate-200 bg-white px-5 py-[18px]">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-rose-600">
          Home cooking estimate
        </span>
        {topLineParts.length > 0 && (
          <span className="text-right text-[11.5px] font-medium text-slate-400">
            {topLineParts.join(" · ")}
          </span>
        )}
      </div>

      <div className="flex border-b-2 border-slate-950 pb-[14px]">
        <div className="flex-1">
          <div className="mb-[5px] text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
            Per serving
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[30px] font-extrabold leading-none tabular-nums text-slate-950">
              {perServingKcal}
            </span>
            <span className="text-[13px] font-bold text-slate-500">kcal</span>
          </div>
        </div>

        <div className="flex-1 border-l border-slate-200 pl-[18px]">
          <div className="mb-[5px] text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
            Recipe total
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[30px] font-extrabold leading-none tabular-nums text-slate-950">
              {totalKcal}
            </span>
            <span className="text-[13px] font-bold text-slate-500">kcal</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_78px_84px] border-b border-slate-200 py-[9px] pb-[7px] text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
        <div />
        <div className="text-right">Serving</div>
        <div className="text-right">Total</div>
      </div>

      {rows.map((row, index) => (
        <div
          key={row.label}
          className={`grid grid-cols-[1fr_78px_84px] items-baseline ${
            row.sub
              ? "py-[7px]"
              : `${index === 0 ? "py-[10px]" : "border-t border-slate-100 py-[10px]"}`
          }`}
        >
          <div className={row.sub ? "pl-4 text-[13.5px] font-medium text-slate-500" : "text-[13.5px] font-bold text-slate-950"}>
            {row.label}
          </div>
          <div className={`text-right tabular-nums ${row.sub ? "text-[14px] font-semibold text-slate-950" : "text-[14px] font-extrabold text-slate-950"}`}>
            {renderValue(row.key, row.unit)}
          </div>
          <div className={`text-right tabular-nums ${row.sub ? "text-[14px] font-medium text-slate-500" : "text-[14px] font-semibold text-slate-500"}`}>
            {renderValue(row.key, row.unit, safeServingsCount)}
          </div>
        </div>
      ))}

      <p className="mt-[13px] text-[11.5px] leading-[1.5] text-slate-400">
        Estimated from detected ingredients and usable quantities. Missing quantities are excluded.
      </p>
    </div>
  );
}

export default function NutritionCard({ ingredients, servings, recipeName, embedded = false }: NutritionCardProps) {
  const [mode, setMode] = useState<ViewMode>("serving");
  const [portionScale, setPortionScale] = useState(1);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    markPerfStep("NutritionCard first rendered");
  }, []);

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
      if (nutrition.confidence !== "high" && nutrition.servingSizeG && nutrition.servingSizeG > 220) {
        assumptions.push(`Displayed portion uses a practical 150g estimate because the source serving weight (${Math.round(nutrition.servingSizeG)}g) is based on partial ingredient matches.`);
      }
    } else if (nutrition.servingEstimateReason === "sauce_portion" && nutrition.servingSizeG) {
      assumptions.unshift(`No serving count found. Per portion estimated as ${nutrition.servingSizeG}g for a sauce, dip, or spread.`);
    } else if (nutrition.servingEstimateReason === "weight_portion" && nutrition.servingSizeG) {
      assumptions.unshift(`No serving count found. Per portion estimated as ${nutrition.servingSizeG}g.`);
    } else {
      assumptions.unshift("No serving count found. Per portion currently equals the total calculated recipe.");
    }

    return { assumptions, missing };
  }, [ingredients, servings, nutrition.effectiveServings, nutrition.servingEstimateReason, nutrition.servingSizeG, nutrition.confidence]);

  const saltMissing = nutritionNotes.missing.some((x) => {
    const value = x.toLowerCase();
    return value.includes("salt") || value.includes("sel");
  });

  const excludedNutritionItems = useMemo(() => {
    const normalizeExcludedName = (value: string) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[’']/g, " ")
        .replace(/[^\w\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const classifyExcluded = (name: string, fallbackReason: string) => {
      const normalized = normalizeExcludedName(name);
      const saltLike = /\b(salt|sel)\b/.test(normalized);
      const seasoningLike =
        /\b(thyme|thym|bay|laurier|pepper|poivre|rosemary|romarin|parsley|persil|oregano|basil|basilic|cilantro|coriander|cumin|paprika|nutmeg|muscade|cinnamon|cannelle|spice|spices|herb|herbs|bouquet garni)\b/.test(normalized);

      if (saltLike) {
        return { name, reason: "salt quantity unknown", impact: "seasoning" as const };
      }

      if (seasoningLike) {
        return { name, reason: "negligible seasoning", impact: "seasoning" as const };
      }

      return { name, reason: fallbackReason, impact: "main" as const };
    };

    const items = [
      ...nutritionNotes.missing.map((name) => classifyExcluded(name, "no usable quantity")),
      ...(nutrition.unmatchedIngredients ?? []).map((name) => classifyExcluded(name, "not matched")),
    ];

    const seen = new Set<string>();
    return items.filter((item) => {
      const key = String(item.name || "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [nutritionNotes.missing, nutrition.unmatchedIngredients]);

  const mainExcludedNutritionItems = excludedNutritionItems.filter((item) => item.impact === "main");
  const seasoningExcludedNutritionItems = excludedNutritionItems.filter((item) => item.impact === "seasoning");

  const excludedNutritionLabel = [
    mainExcludedNutritionItems.length > 0 ? `${mainExcludedNutritionItems.length} main excluded` : null,
    seasoningExcludedNutritionItems.length > 0
      ? `${seasoningExcludedNutritionItems.length} seasoning${seasoningExcludedNutritionItems.length === 1 ? "" : "s"} excluded`
      : null,
  ].filter(Boolean).join(" · ");

  const nutritionDisplayTotal = nutrition.matchedCount + mainExcludedNutritionItems.length;

  const hasServingSize =
    typeof nutrition.servingSizeG === "number" &&
    Number.isFinite(nutrition.servingSizeG) &&
    nutrition.servingSizeG > 0;

  const rawServingSizeG = hasServingSize ? Math.max(1, nutrition.servingSizeG as number) : null;

  const shouldUsePracticalPortion =
    nutrition.servingEstimateReason === "source" &&
    nutrition.confidence !== "high" &&
    rawServingSizeG !== null &&
    rawServingSizeG > 220;

  const baseServingSizeG = shouldUsePracticalPortion ? 150 : rawServingSizeG;

  const adjustedServingSizeG = baseServingSizeG
    ? Math.max(20, Math.round(baseServingSizeG * portionScale))
    : null;

  const adjustedPerServing = adjustedServingSizeG
    ? scaleNutritionValues(nutrition.per100g, adjustedServingSizeG / 100)
    : scaleNutritionValues(nutrition.perServing, portionScale);

  const activePortionSizeG = mode === "serving" || mode === "table" ? adjustedServingSizeG : 100;

  const servingWeightHelper =
    nutrition.servingEstimateReason === "source"
      ? "per recipe serving"
      : "estimated serving weight";

  const activePortionHelper =
    mode === "serving" || mode === "table"
      ? servingWeightHelper
      : "reference amount";

  const handlePortionScale = (nextScale: number) => {
    setPortionScale(Math.max(0.25, Math.min(4, Number(nextScale.toFixed(3)))));
    setMode("serving");
  };

  if (!hasUsableNutrition) {
    return <RecipeNutritionCard />;
  }

  const detailItems = [
    ...nutritionNotes.assumptions,
    ...(nutritionNotes.missing.length > 0
      ? [`Missing quantities excluded from calculation: ${nutritionNotes.missing.join(", ")}.`]
      : []),
    ...(nutrition.unmatchedIngredients && nutrition.unmatchedIngredients.length > 0
      ? [`Not matched: ${nutrition.unmatchedIngredients.join(", ")}.`]
      : []),
  ];

  const healthNotes = [
    adjustedPerServing.protein_g >= 20 ? "High protein per serving." : null,
    nutrition.per100g.fat_g >= 17.5 ? "High fat per 100g." : null,
    nutrition.per100g.saturates_g >= 5 ? "High saturated fat per 100g." : null,
    nutrition.per100g.carbs_g <= 5 ? "Low carbohydrate estimate." : null,
    saltMissing ? "Salt is present but quantity is unknown." : null,
  ].filter(Boolean);

  const portionValue =
    mode === "per100g"
      ? "100g"
      : activePortionSizeG
        ? formatPortionSize(activePortionSizeG)
        : null;

  const portionHelper =
    mode === "per100g"
      ? "reference amount"
      : activePortionSizeG
        ? activePortionHelper
        : "Serving size unavailable";

  const aiEstimateText = [
    excludedNutritionLabel || null,
    nutritionNotes.assumptions[0] || null,
  ].filter(Boolean).join(" · ") || "Values adjust with serving size.";

  const hasNutriScore = ["A", "B", "C", "D", "E"].includes(String(nutrition.nutriScore?.letter || ""));
  const showTableMode = mode === "table";
  const activeMacroValues = mode === "per100g" ? nutrition.per100g : adjustedPerServing;
  const cardModeLabel =
    mode === "per100g" ? "per 100g" :
    mode === "table" ? "full table" :
    "per serving";
  const modeToggle = (
    <div className="mb-5 grid w-full grid-cols-3 gap-[3px] rounded-[12px] bg-slate-100 p-1">
      {[
        { key: "serving", label: "Serving" },
        { key: "per100g", label: "Per 100g" },
        { key: "table", label: "Table" },
      ].map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => setMode(item.key as ViewMode)}
          className={`min-w-0 whitespace-nowrap rounded-[10px] px-2 py-2 text-center text-sm leading-none transition ${
            mode === item.key
              ? "bg-white font-bold text-primary-600 shadow-[0_1px_4px_rgba(15,23,42,0.10)]"
              : "bg-transparent font-medium text-slate-500 hover:text-primary-600"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
  const nutritionMetaBlock = ((excludedNutritionItems.length > 0) || detailItems.length > 0 || healthNotes.length > 0) ? (
    <div className="rounded-[14px] bg-slate-50 px-4 py-3 text-[12px] leading-[1.55] text-slate-400">
      <p className="font-semibold text-slate-500">
        {nutrition.matchedCount} of {nutritionDisplayTotal} main ingredients calculated.
      </p>
      {excludedNutritionItems.length > 0 && (
        <ul className="mt-2 space-y-1">
          {excludedNutritionItems.map((item) => (
            <li key={`${item.name}-${item.reason}`}>
              <span className="font-medium text-slate-600">{item.name}</span>
              <span> — {item.reason}</span>
            </li>
          ))}
        </ul>
      )}
      {detailItems.length > 0 && (
        <ul className="mt-2 space-y-1">
          {detailItems.map((note, idx) => (
            <li key={`detail-${idx}`}>• {note}</li>
          ))}
        </ul>
      )}
      {healthNotes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {healthNotes.map((note, idx) => (
            <li key={`health-${idx}`}>• {note}</li>
          ))}
        </ul>
      )}
    </div>
  ) : null;
  const trafficLightContent = (
    <NutrientTrafficStrip
      per100g={nutrition.per100g}
      perServing={mode === "per100g" ? nutrition.per100g : adjustedPerServing}
      saltMissing={saltMissing}
      servingSizeG={mode === "per100g" ? 100 : adjustedServingSizeG}
    />
  );
  const nutriScoreContent = hasNutriScore ? (
    <NutriScoreVisual letter={nutrition.nutriScore.letter} />
  ) : (
    <div className="rounded-[18px] border border-[#eef2f7] bg-slate-50 px-5 py-[22px]">
      <p className="mb-[18px] text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
        Nutri-Score · estimated
      </p>
      <p className="text-sm font-bold text-slate-900">Nutri-Score unavailable</p>
      <p className="mt-1 text-[12px] text-slate-500">
        A grade could not be estimated from the current recipe data.
      </p>
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-4">
        <section className="space-y-4 py-4 sm:px-5 sm:py-5">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h3 className="text-[20px] font-extrabold tracking-tight text-slate-950">Nutrition</h3>
            <span className="text-[12px] font-medium text-slate-400">{cardModeLabel}</span>
          </div>

          {modeToggle}

          {showTableMode ? (
            <div className="rounded-[18px] border border-slate-200 bg-white/80 px-4 py-4 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
              <HomeCookingEstimateTable
                servingValues={adjustedPerServing}
                servingsCount={nutrition.effectiveServings}
                servingSizeG={adjustedServingSizeG}
                totalWeightG={nutrition.totalWeightG}
                saltMissing={saltMissing}
              />
            </div>
          ) : (
            <div className="rounded-[18px] border border-slate-200 bg-white/80 px-4 py-4 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
              <div className="mb-4 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                Macro breakdown
              </div>
              <div className="rounded-[16px] bg-slate-50 px-2 pt-[22px] pb-[18px]">
                <MacroRingGrid values={activeMacroValues} />
              </div>
            </div>
          )}

          <div className="rounded-[13px] border border-slate-200 bg-white/80 px-4 py-[13px]">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13.5px] font-bold text-slate-700">Adjust serving</p>
                <p className="mt-1 text-[12px] text-slate-400">
                  {nutrition.matchedCount} of {nutritionDisplayTotal} ingredients calculated
                </p>
              </div>

              {adjustedServingSizeG && (
                <div className="flex shrink-0 items-center overflow-hidden rounded-[11px] border border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() => handlePortionScale(portionScale - 0.25)}
                    className="flex h-9 w-[34px] items-center justify-center bg-primary-50 text-lg font-bold text-slate-500 transition-colors hover:bg-primary-100"
                  >
                    −
                  </button>
                  <span className="flex min-w-[72px] items-center justify-center px-3 text-center text-[14px] font-bold tabular-nums text-slate-700">
                    {Math.round(portionScale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePortionScale(portionScale + 0.25)}
                    className="flex h-9 w-[34px] items-center justify-center bg-primary-50 text-lg font-bold text-slate-500 transition-colors hover:bg-primary-100"
                  >
                    +
                  </button>
                </div>
              )}
            </div>

            {portionValue && (
              <p className="mt-2 text-[12px] text-slate-400">
                <span className="font-medium text-slate-500">{portionValue}</span>
                <span className="ml-1">{portionHelper}</span>
              </p>
            )}
          </div>

          <div className="mt-[13px] flex items-center gap-2 px-0.5">
            <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-bold leading-none text-primary-600">
              AI estimated
            </span>
            <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-slate-400">
              {aiEstimateText}
            </span>
          </div>

          <section className="rounded-[18px] border border-slate-200 bg-white/80 px-4 py-4 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
            <h4 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              UK traffic light
            </h4>
            {trafficLightContent}
          </section>

          <section className="rounded-[18px] border border-slate-200 bg-white/80 px-4 py-4 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
            <h4 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              Nutri-Score
            </h4>
            {nutriScoreContent}
          </section>

          {nutritionMetaBlock}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className={embedded ? 'p-0' : 'rounded-[26px] border border-white/75 bg-white/90 p-5 shadow-[0_4px_18px_rgba(15,23,42,0.06)] backdrop-blur-sm sm:p-6'}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-[20px] font-extrabold tracking-tight text-slate-950">Nutrition</h3>
          <span className="text-[12px] font-medium text-slate-400">{cardModeLabel}</span>
        </div>

        {modeToggle}

        {showTableMode ? (
          <HomeCookingEstimateTable
            servingValues={adjustedPerServing}
            servingsCount={nutrition.effectiveServings}
            servingSizeG={adjustedServingSizeG}
            totalWeightG={nutrition.totalWeightG}
            saltMissing={saltMissing}
          />
        ) : (
          <div className="mb-4 rounded-[16px] bg-slate-50 px-2 pt-[22px] pb-[18px]">
            <MacroRingGrid values={activeMacroValues} />
          </div>
        )}

        <div className="rounded-[13px] border border-slate-200 bg-slate-50 px-4 py-[13px]">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold text-slate-700">Adjust serving</p>
              <p className="mt-1 text-[12px] text-slate-400">
                {nutrition.matchedCount} of {nutritionDisplayTotal} ingredients calculated
              </p>
            </div>

            {adjustedServingSizeG && (
              <div className="flex shrink-0 items-center overflow-hidden rounded-[11px] border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => handlePortionScale(portionScale - 0.25)}
                  className="flex h-9 w-[34px] items-center justify-center bg-primary-50 text-lg font-bold text-slate-500 transition-colors hover:bg-primary-100"
                >
                  −
                </button>
                <span className="flex min-w-[72px] items-center justify-center px-3 text-center text-[14px] font-bold tabular-nums text-slate-700">
                  {Math.round(portionScale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => handlePortionScale(portionScale + 0.25)}
                  className="flex h-9 w-[34px] items-center justify-center bg-primary-50 text-lg font-bold text-slate-500 transition-colors hover:bg-primary-100"
                >
                  +
                </button>
              </div>
            )}
          </div>

          {portionValue && (
            <p className="mt-2 text-[12px] text-slate-400">
              <span className="font-medium text-slate-500">{portionValue}</span>
              <span className="ml-1">{portionHelper}</span>
            </p>
          )}
        </div>

        <div className="mt-[13px] flex items-center gap-2 px-0.5">
          <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-bold leading-none text-primary-600">
            AI estimated
          </span>
          <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-slate-400">
            {aiEstimateText}
          </span>
        </div>
      </section>

      <section className="overflow-hidden rounded-[26px] border border-white/75 bg-white/90 shadow-[0_4px_18px_rgba(15,23,42,0.06)] backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setDetailsOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 px-[22px] py-[18px] text-left"
          aria-expanded={detailsOpen}
        >
          <div className="flex min-w-0 items-center gap-3">
            <Info size={19} className="shrink-0 text-primary-600" aria-hidden="true" />
            <span className="text-[18px] font-extrabold tracking-tight text-slate-950">
              More nutrition details
            </span>
          </div>
          <ChevronDown
            size={18}
            className={`shrink-0 text-slate-400 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>

        {detailsOpen && (
          <div className="px-[22px] pb-[22px] text-xs text-slate-500">
            <div className="space-y-5 leading-relaxed">
              <section>
                <h4 className="mb-3 text-[15px] font-extrabold text-slate-950">Traffic light guide</h4>
                {trafficLightContent}
              </section>

              <section>
                <h4 className="mb-3 text-[15px] font-extrabold text-slate-950">Nutri-Score</h4>
                {nutriScoreContent}
              </section>

              {nutritionMetaBlock}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
