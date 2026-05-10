import React from "react";
import type { NutritionTotals } from "../../../utils/nutritionCalc";

export const fmt = (value: number, unit = "g") => {
  if (unit === "kcal") return `${Math.round(value)} kcal`;
  if (value > 0 && value < 0.5) return `<1${unit}`;
  return `${Math.round(value * 10) / 10}${unit}`;
};

export const fmtRing = (value: number) => {
  if (value > 0 && value < 0.5) return "<1";
  return String(Math.round(value));
};

export const traffic = (kind: string, value: number) => {
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

export function NutriScoreVisual({
  letter,
}: {
  letter: "A" | "B" | "C" | "D" | "E";
}) {
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

export function ValueTable({
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
        <div
          key={name}
          className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-sm"
        >
          <span className="font-medium text-gray-600">{name}</span>
          <span className="font-black text-gray-950">{value}</span>
        </div>
      ))}
    </div>
  );
}
