import { useMemo, useState } from "react";
import { calculateNutrition, type NutritionTotals } from "../utils/nutritionCalc";

type NutritionCardProps = {
  ingredients: any[];
  servings?: number;
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
    { letter: "A", color: "#038141" },
    { letter: "B", color: "#85BB2F" },
    { letter: "C", color: "#FECB02" },
    { letter: "D", color: "#EE8100" },
    { letter: "E", color: "#E63E11" },
  ] as const;

  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Estimated Nutri-Score</p>
        <p className="text-[10px] font-bold text-gray-400">per 100g</p>
      </div>

      <div className="flex items-center gap-1">
        <div className="flex h-10 min-w-[92px] items-center justify-center rounded-l-full rounded-r-md bg-gray-950 px-3 text-[13px] font-black text-white">
          Nutri-Score
        </div>

        <div className="flex flex-1 items-center gap-1">
          {grades.map((grade) => {
            const active = grade.letter === letter;

            return (
              <div
                key={grade.letter}
                className={`relative flex h-10 flex-1 items-center justify-center rounded-md text-[18px] font-black text-white ${
                  active ? "z-10 scale-[1.16] shadow-lg" : ""
                }`}
                style={{ backgroundColor: grade.color }}
              >
                {active ? (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white bg-white/10 text-white shadow-inner">
                    {grade.letter}
                  </div>
                ) : (
                  grade.letter
                )}
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
    ["Salt", fmt(values.salt_g)]
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

export default function NutritionCard({ ingredients, servings = 1 }: NutritionCardProps) {
  const [mode, setMode] = useState<ViewMode>("serving");
  const nutrition = useMemo(() => calculateNutrition(ingredients, servings), [ingredients, servings]);

  const activeValues =
    mode === "serving" ? nutrition.perServing :
    mode === "per100g" ? nutrition.per100g :
    nutrition.totalRecipe;

  const activeLabel =
    mode === "serving" ? "Per portion" :
    mode === "per100g" ? "Per 100g" :
    "Total recipe";

  const trafficItems = [
    { key: "fat", label: "Fat", value: nutrition.per100g.fat_g, display: fmt(nutrition.per100g.fat_g) },
    { key: "saturates", label: "Saturates", value: nutrition.per100g.saturates_g, display: fmt(nutrition.per100g.saturates_g) },
    { key: "sugars", label: "Sugars", value: nutrition.per100g.sugars_g, display: fmt(nutrition.per100g.sugars_g) },
    { key: "salt", label: "Salt", value: nutrition.per100g.salt_g, display: fmt(nutrition.per100g.salt_g) }
  ];

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Estimated</p>
        <h3 className="text-lg font-semibold text-gray-950">Nutrition values</h3>
        <p className="mt-1 text-xs text-gray-500">
          {nutrition.matchedCount} of {nutrition.totalCount} ingredients calculated · {nutrition.confidence} confidence.
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

      <div className="mt-4 grid grid-cols-4 overflow-hidden rounded-2xl border border-gray-200 text-center text-xs">
        {trafficItems.map((item) => {
          const level = traffic(item.key, item.value);
          return (
            <div key={item.key} className="border-r border-white last:border-r-0">
              <div className={`${level.cls} px-1 py-2`}>
                <p className="font-black">{item.display}</p>
                <p className="text-[10px] font-bold uppercase">{item.label}</p>
              </div>
              <div className="bg-gray-50 py-1 text-[10px] font-black text-gray-500">{level.label}</div>
            </div>
          );
        })}
      </div>

      <NutriScoreVisual letter={nutrition.nutriScore.letter} />

      <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
        Estimated from calculated per-100g values. Fruit/veg/pulse/nut percentage and fiber are not yet inferred, so this is demo-grade, not a regulatory label.
      </p>
    </section>
  );
}
