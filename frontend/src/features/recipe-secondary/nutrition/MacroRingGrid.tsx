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
  trackColor,
}: {
  label: string;
  value: number;
  unit: string;
  target: number;
  color: string;
  trackColor: string;
}) {
  const safeValue = Math.max(0, value || 0);

  const radius = 33;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(safeValue / target, 1);
  const dash = circumference * pct;

  const displayUnit = unit === "kcal" ? "kcal" : "grams";

  return (
    <div className="flex min-w-0 flex-col items-center gap-[10px]">
      <div className="relative h-20 w-20">
        <svg
          viewBox="0 0 88 88"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <circle
            cx="44"
            cy="44"
            r={radius}
            stroke={trackColor}
            strokeWidth="7"
            fill="none"
          />

          <circle
            cx="44"
            cy="44"
            r={radius}
            stroke={color}
            strokeWidth="7"
            fill="none"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeLinecap="round"
            transform="rotate(-90 44 44)"
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[19px] font-extrabold leading-none tracking-tight text-slate-950">
            {unit === "kcal"
              ? Math.round(safeValue)
              : fmtRing(safeValue)}
          </span>

          <span className="mt-1 text-[10px] font-medium leading-none text-slate-400">
            {displayUnit}
          </span>
        </div>
      </div>

      <span className="text-center text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
        {label}
      </span>
    </div>
  );
}

const MacroRingGrid: React.FC<{
  values: MacroBalanceInput;
}> = ({ values }) => {
  return (
    <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
      <MacroDonut
        label="Calories"
        value={values.calories}
        unit="kcal"
        target={700}
        color="#7c3aed"
        trackColor="#ede9fe"
      />

      <MacroDonut
        label="Protein"
        value={values.protein_g}
        unit="grams"
        target={50}
        color="#e11d48"
        trackColor="#ffe4e6"
      />

      <MacroDonut
        label="Carbs"
        value={values.carbs_g}
        unit="grams"
        target={90}
        color="#f97316"
        trackColor="#ffedd5"
      />

      <MacroDonut
        label="Fats"
        value={values.fat_g}
        unit="grams"
        target={35}
        color="#eab308"
        trackColor="#fef9c3"
      />
    </div>
  );
};

export default MacroRingGrid;
