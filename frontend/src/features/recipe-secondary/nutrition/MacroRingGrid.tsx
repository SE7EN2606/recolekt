import React from "react";
import { fmtRing } from "./NutritionShared";

type MacroBalanceInput = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

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
  const safeValue = Math.max(0, value || 0);

  const radius = 41;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(safeValue / target, 1);
  const dash = circumference * pct;

  const displayUnit = unit === "kcal" ? "kcal" : "grams";

  return (
    <div className="flex min-w-0 flex-col items-center">
      <div className="relative h-[96px] w-[96px]">
        <svg
          viewBox="0 0 108 108"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
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
            {unit === "kcal"
              ? Math.round(safeValue)
              : fmtRing(safeValue)}
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

const MacroRingGrid: React.FC<{
  values: MacroBalanceInput;
}> = ({ values }) => {
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
};

export default MacroRingGrid;
