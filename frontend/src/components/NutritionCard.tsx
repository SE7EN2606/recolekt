import { useMemo, useState } from "react";
import { calculateNutrition, type NutritionTotals } from "../utils/nutritionCalc";

type NutritionCardProps = {
  ingredients: any[];
  servings?: number;
  recipeName?: string;
};

type ViewMode = "serving" | "per100g" | "total";

const fmt = (value: number, unit = "g") =>
  unit === "kcal" ? `${Math.round(value)} kcal` : `${Math.round(value * 10) / 10}${unit}`;

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

const nutriColors: Record<string, string> = {
  A: "#038141",
  B: "#85BB2F",
  C: "#FECB02",
  D: "#EE8100",
  E: "#E63E11"
};

function NutriScoreVisual({ letter }: { letter: "A" | "B" | "C" | "D" | "E" }) {
  const grades = [
    { l: "A", cls: "bg-[#038141]" },
    { l: "B", cls: "bg-[#85BB2F]" },
    { l: "C", cls: "bg-[#FECB02]" },
    { l: "D", cls: "bg-[#EE8100]" },
    { l: "E", cls: "bg-[#E63E11]" },
  ] as const;

  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
          Estimated Nutri-Score
        </p>
        <p className="text-[10px] font-bold text-gray-400">per 100g</p>
      </div>

      <div className="mx-auto w-full max-w-[280px]">
        <p className="mb-2 text-center text-lg font-black tracking-tight text-gray-500">
          NUTRI-SCORE
        </p>

        <div
          role="img"
          aria-label={`Estimated Nutri-Score ${letter}`}
          className="flex items-center justify-center gap-1"
        >
          {grades.map((grade) => {
            const active = grade.l === letter;

            return (
              <div
                key={grade.l}
                className={[
                  "flex h-10 w-12 items-center justify-center rounded-xl text-2xl font-black text-white transition-all",
                  grade.cls,
                  active ? "ring-4 ring-white shadow-md scale-110" : "opacity-80"
                ].join(" ")}
              >
                {grade.l}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ValueTable({ values, label }: { values: NutritionTotals; label: string }) {
  const rows = [
    ["Energy", fmt(values.calories, "kcal")],
    ["Protein", fmt(values.protein_g)],
    ["Carbohydrate", fmt(values.carbs_g)],
    ["Fat", fmt(values.fat_g)],
    ["Saturates", fmt(values.saturates_g)],
    ["Sugars", fmt(values.sugars_g)],
    ["Salt", "see notes"],
    ["Fiber", fmt(values.fiber_g)]
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200">
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

  const activeValues =
    mode === "serving" ? nutrition.perServing :
    mode === "per100g" ? nutrition.per100g :
    nutrition.totalRecipe;

  const activeLabel =
    mode === "serving" ? "Per portion" :
    mode === "per100g" ? "Per 100g" :
    "Total recipe";

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

  const trafficItems = [
    { key: "fat", label: "Fat", value: nutrition.per100g.fat_g, display: fmt(nutrition.per100g.fat_g) },
    { key: "saturates", label: "Saturates", value: nutrition.per100g.saturates_g, display: fmt(nutrition.per100g.saturates_g) },
    { key: "sugars", label: "Sugars", value: nutrition.per100g.sugars_g, display: fmt(nutrition.per100g.sugars_g) },
    {
      key: "salt",
      label: "Salt",
      value: nutrition.per100g.salt_g,
      display: saltMissing ? "Unknown" : fmt(nutrition.per100g.salt_g),
      forcedLabel: saltMissing ? "UNKNOWN" : undefined,
      forcedClass: saltMissing ? "bg-amber-500 text-white" : undefined,
    }
  ];

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

      <div className="mb-4 grid grid-cols-3 rounded-2xl bg-gray-100 p-1 text-xs font-bold">
        {[
          { key: "serving", label: "Per portion" },
          { key: "per100g", label: "Per 100g" },
          { key: "total", label: "Total" }
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

      <ValueTable values={activeValues} label={activeLabel} />

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
                • Excluded missing quantities: {nutritionNotes.missing.join(", ")}.
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="mt-4 grid grid-cols-4 overflow-hidden rounded-2xl border border-gray-200 text-center text-xs">
        {trafficItems.map((item) => {
          const level = traffic(item.key, item.value);
          return (
            <div key={item.key} className="border-r border-white last:border-r-0">
              <div className={`${item.forcedClass ?? level.cls} px-1 py-2`}>
                <p className="font-black">{item.display}</p>
                <p className="text-[10px] font-bold uppercase">{item.label}</p>
              </div>
              <div className="bg-gray-50 py-1 text-[10px] font-black text-gray-500">
                {item.forcedLabel ?? level.label}
              </div>
            </div>
          );
        })}
      </div>

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
