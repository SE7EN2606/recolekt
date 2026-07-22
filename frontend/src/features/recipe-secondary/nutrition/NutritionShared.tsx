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
  grouped = false,
}: {
  letter: "A" | "B" | "C" | "D" | "E";
  grouped?: boolean;
}) {
  const slots = [
    { l: "A", fill: "rgb(27,138,63)" },
    { l: "B", fill: "rgb(122,192,67)" },
    { l: "C", fill: "rgb(246,200,0)" },
    { l: "D", fill: "rgb(239,130,0)" },
    { l: "E", fill: "rgb(230,51,18)" },
  ] as const;

  const activeIdx = Math.max(0, slots.findIndex((slot) => slot.l === letter));
  const activeFill = slots[activeIdx]?.fill ?? slots[0].fill;
  const shadowByLetter: Record<string, string> = {
    A: "rgba(27, 138, 63, 0.35) 0px 8px 18px",
    B: "rgba(122, 192, 67, 0.35) 0px 8px 18px",
    C: "rgba(246, 200, 0, 0.35) 0px 8px 18px",
    D: "rgba(239, 130, 0, 0.35) 0px 8px 18px",
    E: "rgba(230, 51, 18, 0.35) 0px 8px 18px",
  };

  return (
    <div className={grouped ? "rounded-[18px] border border-[#eef2f7] bg-slate-50 p-[18px]" : ""}>
      <div className={grouped ? "mb-[18px] flex items-center justify-between gap-3" : "mb-[18px] flex items-center justify-between gap-3 rounded-[18px] border border-[#eef2f7] bg-slate-50 px-5 py-[22px]"}>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
          Nutri-Score · estimated
        </p>
      </div>

      <div
        role="img"
        aria-label={`Estimated Nutri-Score ${letter}`}
        className="mx-auto flex max-w-[380px] items-center justify-center"
      >
        {slots.map((slot, idx) => {
          const isActive = idx === activeIdx;
          const isFirst = idx === 0;
          const isLast = idx === slots.length - 1;

          if (isActive) {
            return (
              <div
                key={slot.l}
                className="relative z-10 flex h-[72px] w-[72px] items-center justify-center rounded-[18px] border-[3px] border-white text-[34px] font-extrabold text-white"
                style={{
                  margin: "0 -5px",
                  backgroundColor: slot.fill,
                  boxShadow: shadowByLetter[slot.l],
                }}
              >
                {slot.l}
              </div>
            );
          }

          return (
            <div
              key={slot.l}
              className={`flex h-[50px] flex-1 items-center justify-center text-[22px] font-extrabold text-white/55 ${
                isFirst ? "rounded-l-[13px]" : ""
              } ${isLast ? "rounded-r-[13px]" : ""}`}
              style={{ backgroundColor: slot.fill }}
            >
              {slot.l}
            </div>
          );
        })}
      </div>

      <p className="mt-[20px] text-center text-[12.5px] leading-[1.5] text-slate-400">
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
