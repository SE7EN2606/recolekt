import { useMemo, useState } from "react";
import { calculateNutrition, type NutritionTotals } from "../utils/nutritionCalc";
import {
  fmt,
  fmtRing,
  traffic,
  NutriScoreVisual,
  ValueTable,
} from "../features/recipe-secondary/nutrition/NutritionShared";
import {
  RecipeNutritionCard,
  NutritionFactsTable,
  MacroRingGrid,
  NutrientTrafficStrip,
} from "../features/recipe-secondary/nutrition";
import {
  scaleNutritionValues,
  formatPortionSize,
  pct,
} from "../features/recipe-secondary/nutrition/utils/nutritionFormatting";

type NutritionCardProps = {
  ingredients: any[];
  servings?: number;
  recipeName?: string;
};

type ViewMode = "serving" | "per100g" | "table";













type MacroBalanceInput = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

const riPct = (value: number, reference: number) =>
  `${Math.max(0, Math.round((value / reference) * 100))}%`;










export default function NutritionCard({ ingredients, servings, recipeName }: NutritionCardProps) {
  const [mode, setMode] = useState<ViewMode>("serving");
  const [portionScale, setPortionScale] = useState(1);
  const [showExcludedDetails, setShowExcludedDetails] = useState(false);
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
  }, [ingredients, servings, nutrition.effectiveServings, nutrition.servingEstimateReason, nutrition.servingSizeG]);

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
        return {
          name,
          reason: "salt quantity unknown",
          impact: "seasoning" as const,
        };
      }

      if (seasoningLike) {
        return {
          name,
          reason: "negligible seasoning",
          impact: "seasoning" as const,
        };
      }

      return {
        name,
        reason: fallbackReason,
        impact: "main" as const,
      };
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
    mainExcludedNutritionItems.length > 0
      ? `${mainExcludedNutritionItems.length} main excluded`
      : null,
    seasoningExcludedNutritionItems.length > 0
      ? `${seasoningExcludedNutritionItems.length} seasoning${seasoningExcludedNutritionItems.length === 1 ? "" : "s"} excluded`
      : null,
  ].filter(Boolean).join(" · ");

  const nutritionDisplayTotal = nutrition.matchedCount + mainExcludedNutritionItems.length;


  const hasServingSize =
    typeof nutrition.servingSizeG === "number" &&
    Number.isFinite(nutrition.servingSizeG) &&
    nutrition.servingSizeG > 0;

  const rawServingSizeG = hasServingSize
    ? Math.max(1, nutrition.servingSizeG as number)
    : null;

  // Keep the visible portion weight and visible nutrition values on the same basis.
  // If we show a capped practical portion, we calculate its values from per-100g.
  const shouldUsePracticalPortion =
    nutrition.servingEstimateReason === "source" &&
    nutrition.confidence !== "high" &&
    rawServingSizeG !== null &&
    rawServingSizeG > 220;

  const baseServingSizeG = shouldUsePracticalPortion
    ? 150
    : rawServingSizeG;

  const adjustedServingSizeG = baseServingSizeG
    ? Math.max(20, Math.round(baseServingSizeG * portionScale))
    : null;

  const adjustedPerServing = adjustedServingSizeG
    ? scaleNutritionValues(nutrition.per100g, adjustedServingSizeG / 100)
    : scaleNutritionValues(nutrition.perServing, portionScale);

  const activePortionSizeG =
    mode === "serving" || mode === "table" ? adjustedServingSizeG :
    100;

  const servingWeightHelper =
    nutrition.servingEstimateReason === "source"
      ? "per recipe serving"
      : "estimated serving weight";

  const activePortionHelper =
    mode === "serving" || mode === "table" ? servingWeightHelper :
    "reference amount";

  const handlePortionScale = (nextScale: number) => {
    setPortionScale(Math.max(0.25, Math.min(4, Number(nextScale.toFixed(3)))));
    setMode("serving");
  };

  if (!hasUsableNutrition) {
    return (
      
<RecipeNutritionCard>
  {/* nutrition content moved here temporarily */}
</RecipeNutritionCard>

    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Estimated
            </p>
            <h3 className="text-lg font-semibold text-gray-950">
              Nutrition values
            </h3>

            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-500">
              <span>
                {nutrition.matchedCount} of {nutritionDisplayTotal} main ingredients calculated
              </span>
            </div>
          </div>

          {excludedNutritionItems.length > 0 && (
            <button
              type="button"
              onClick={() => setShowExcludedDetails((prev) => !prev)}
              aria-expanded={showExcludedDetails}
              className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-gray-500 transition hover:border-gray-300 hover:bg-white hover:text-gray-800"
            >
              {excludedNutritionLabel}
            </button>
          )}
        </div>

        {showExcludedDetails && excludedNutritionItems.length > 0 && (
          <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50/80 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Excluded from nutrition estimate
            </p>

            <div className="mt-2 space-y-1.5">
              {excludedNutritionItems.map((item) => (
                <p key={`${item.name}-${item.reason}`} className="text-[11px] leading-snug text-gray-600">
                  <span className="font-bold text-gray-900">{item.name}</span>
                  <span className="text-gray-400"> — {item.reason}</span>
                </p>
              ))}
            </div>
          </div>
        )}
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

          {mode === "serving" && adjustedServingSizeG && (
            <div className="mb-4 rounded-[24px] border border-rose-100 bg-rose-50/60 px-4 py-4">
              <div className="grid min-h-[44px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-rose-400">
                    Portion size
                  </p>
                  <p className="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-base font-black text-gray-950">
                    <span>{formatPortionSize(adjustedServingSizeG)}</span>
                    <span className="truncate text-xs font-bold text-gray-400">
                      estimated serving weight
                    </span>
                  </p>
                </div>

                <div className="flex h-10 w-[132px] shrink-0 items-center justify-between rounded-[16px] border border-rose-100 bg-white px-1.5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => handlePortionScale(portionScale - 0.25)}
                    className="flex h-7 w-7 items-center justify-center rounded-xl bg-rose-50 text-sm font-black text-rose-600 transition hover:bg-rose-100"
                  >
                    −
                  </button>
                  <span className="min-w-[42px] text-center text-[11px] font-black text-rose-600 tabular-nums">
                    {Math.round(portionScale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePortionScale(portionScale + 0.25)}
                    className="flex h-7 w-7 items-center justify-center rounded-xl bg-rose-50 text-sm font-black text-rose-600 transition hover:bg-rose-100"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}

          {mode === "serving" ? (
            <div className="space-y-4">
              <MacroRingGrid values={adjustedPerServing} />
              <NutrientTrafficStrip
                per100g={nutrition.per100g}
                perServing={adjustedPerServing}
                saltMissing={saltMissing}
                servingSizeG={adjustedServingSizeG}
              />
            </div>
          ) : mode === "per100g" ? (
            <div className="space-y-4">
              <MacroRingGrid values={nutrition.per100g} />
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

          {(nutritionNotes.assumptions.length > 0 || nutritionNotes.missing.length > 0 || nutrition.unmatchedIngredients.length > 0) && (
            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                Estimate notes
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

                {nutrition.unmatchedIngredients && nutrition.unmatchedIngredients.length > 0 && (
                  <li>
                    • Not matched: {nutrition.unmatchedIngredients.join(", ")}.
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
