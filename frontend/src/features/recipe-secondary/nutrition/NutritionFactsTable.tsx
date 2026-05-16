import React from "react";
import type { NutritionTotals } from "../../../utils/nutritionCalc";
import { fmt } from "./NutritionShared";

function formatPortionSize(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${Math.round(value)}g`;
}

type Props = {
  servingValues: NutritionTotals;
  totalValues: NutritionTotals;
  servingSizeG?: number | null;
  totalWeightG?: number | null;
  saltMissing: boolean;
};

const NutritionFactsTable: React.FC<Props> = ({
  servingValues,
  totalValues,
  servingSizeG,
  totalWeightG,
  saltMissing,
}) => {
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
    },
    {
      label: "Salt",
      serving: saltMissing ? "needs quantity" : fmt(servingValues.salt_g),
      total: saltMissing ? "needs quantity" : fmt(totalValues.salt_g),
      strong: true,
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Nutrition facts
            </p>

            <h4 className="mt-1 text-sm font-black text-gray-950">
              Estimated values
            </h4>
          </div>

          <div className="text-right text-[11px] text-gray-500">
            <div>Serving: {formatPortionSize(servingSizeG || 0)}</div>
            <div>Total: {formatPortionSize(totalWeightG || 0)}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1.3fr_1fr_1fr] border-b border-gray-200 bg-gray-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
        <div />
        <div className="text-right">Per serving</div>
        <div className="text-right">Recipe total</div>
      </div>

      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[1.3fr_1fr_1fr] border-t border-gray-100 px-4 py-3 text-sm"
        >
          <div
            className={[
              "text-gray-700",
              row.strong ? "font-black" : "font-medium",
              row.indent ? "pl-3" : "",
            ].join(" ")}
          >
            {row.label}
          </div>

          <div className="text-right font-black text-gray-950">
            {row.serving}
          </div>

          <div className="text-right font-black text-gray-950">
            {row.total}
          </div>
        </div>
      ))}
    </div>
  );
};

export default NutritionFactsTable;
