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
    mode === "per100g" ? "100g" :
    activePortionSizeG ? formatPortionSize(activePortionSizeG) :
    null;

  const portionHelper =
    mode === "per100g" ? "reference amount" :
    activePortionSizeG ? activePortionHelper :
    "Serving size unavailable";

  return (
    <section className="space-y-3">
      <div className="space-y-1.5 rounded-xl border border-gray-100 bg-gray-50/70 p-2">
        <div className="grid w-full grid-cols-3 rounded-xl bg-gray-100 p-1 text-xs font-bold">
          {[
            { key: "serving", label: "Serving" },
            { key: "per100g", label: "Per 100g" },
            { key: "table", label: "Table" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setMode(item.key as ViewMode)}
              className={`min-w-0 whitespace-nowrap rounded-lg px-2 py-0.5 text-center leading-none transition ${mode === item.key ? "bg-white text-rose-600 shadow-sm" : "text-gray-500 hover:text-rose-600"}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
              Portion size
            </p>
            <p className="mt-0.5 text-sm font-bold leading-snug text-gray-900">
              {portionValue && (
                <span className="whitespace-nowrap">{portionValue}</span>
              )}
              <span className={portionValue ? "ml-1 text-gray-500" : "text-gray-500"}>
                {portionHelper}
              </span>
            </p>
          </div>

          {adjustedServingSizeG && (
            <div className="flex h-7 w-[118px] shrink-0 items-center justify-between rounded-full border border-rose-100 bg-white px-1.5 shadow-sm">
              <button
                type="button"
                onClick={() => handlePortionScale(portionScale - 0.25)}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-50 text-sm font-black text-primary-600 transition hover:bg-primary-100"
              >
                −
              </button>
              <span className="min-w-[42px] text-center text-[11px] font-black text-rose-600 tabular-nums">
                {Math.round(portionScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => handlePortionScale(portionScale + 0.25)}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-50 text-sm font-black text-primary-600 transition hover:bg-primary-100"
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-bold text-primary-600">AI estimated</span>
        <span className="text-[11px] text-gray-400">Values adjust with serving size</span>
      </div>

      {mode === "serving" ? (
        <MacroRingGrid values={adjustedPerServing} />
      ) : mode === "per100g" ? (
        <MacroRingGrid values={nutrition.per100g} />
      ) : (
        <div className="space-y-3">
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

      <details className="border-t border-gray-100 pt-1.5 text-xs text-gray-500">
        <summary className="cursor-pointer text-sm font-bold text-gray-700 transition hover:text-gray-950">
          More nutrition details
        </summary>

        <div className="mt-1.5 space-y-2 leading-relaxed">
          <section className="space-y-1.5">
            <h4 className="text-sm font-black text-gray-900">Traffic light guide</h4>
            <NutrientTrafficStrip
              per100g={nutrition.per100g}
              perServing={mode === "per100g" ? nutrition.per100g : adjustedPerServing}
              saltMissing={saltMissing}
              servingSizeG={mode === "per100g" ? 100 : adjustedServingSizeG}
            />
          </section>

          <p>
            {nutrition.matchedCount} of {nutritionDisplayTotal} main ingredients calculated.
          </p>

          {excludedNutritionItems.length > 0 && (
            <div>
              <p className="font-bold text-gray-700">{excludedNutritionLabel}</p>
              <ul className="mt-1 space-y-1">
                {excludedNutritionItems.map((item) => (
                  <li key={`${item.name}-${item.reason}`}>
                    <span className="font-semibold text-gray-800">{item.name}</span>
                    <span className="text-gray-400"> — {item.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detailItems.length > 0 && (
            <ul className="space-y-1.5">
              {detailItems.map((note, idx) => (
                <li key={`detail-${idx}`}>• {note}</li>
              ))}
            </ul>
          )}

          {healthNotes.length > 0 && (
            <div>
              <p className="font-bold text-gray-700">Health notes</p>
              <ul className="mt-1 space-y-1.5">
                {healthNotes.map((note, idx) => (
                  <li key={`health-${idx}`}>• {note}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-gray-400">
            This is a Recolekt estimate based on detected ingredients and usable quantities. It is not an official Nutri-Score or medical nutrition label.
          </p>
        </div>
      </details>
    </section>
  );
}
