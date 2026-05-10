import React from "react";

function nutrientLevel(
  kind: "fat" | "saturates" | "sugars" | "salt" | "fiber",
  value: number
): "low" | "medium" | "high" {
  const v = Number(value) || 0;

  if (kind === "fat") {
    if (v <= 3) return "low";
    if (v <= 17.5) return "medium";
    return "high";
  }

  if (kind === "saturates") {
    if (v <= 1.5) return "low";
    if (v <= 5) return "medium";
    return "high";
  }

  if (kind === "sugars") {
    if (v <= 5) return "low";
    if (v <= 22.5) return "medium";
    return "high";
  }

  if (kind === "salt") {
    if (v <= 0.3) return "low";
    if (v <= 1.5) return "medium";
    return "high";
  }

  if (v >= 6) return "low";
  if (v >= 3) return "medium";
  return "high";
}

const NutrientTrafficStrip: React.FC<{
  per100g: any;
  perServing: any;
  saltMissing: boolean;
  servingSizeG?: number | null;
}> = ({
  per100g,
  perServing,
  saltMissing,
  servingSizeG,
}) => {
  const energyKj = Math.round((perServing.calories || 0) * 4.184);

  const shownAmountLabel = servingSizeG
    ? `${Math.round(servingSizeG)}g`
    : "selected amount";

  const levelClass = (
    level: "low" | "medium" | "high" | "neutral"
  ) => {
    if (level === "low") return "bg-[#12b24b] text-white";
    if (level === "medium") return "bg-[#f59e0b] text-white";
    if (level === "high") return "bg-[#ef233c] text-white";
    return "bg-white text-gray-950";
  };

  const cells = [
    {
      title: "Energy",
      value: `${energyKj}kJ\n${Math.round(perServing.calories || 0)}kcal`,
      level: "neutral" as const,
      ri: `${Math.round(((perServing.calories || 0) / 2000) * 100)}%`,
    },
    {
      title: "Fat",
      value: `${Math.round((perServing.fat_g || 0) * 10) / 10}g`,
      level: nutrientLevel("fat", per100g.fat_g || 0),
      ri: `${Math.round(((perServing.fat_g || 0) / 70) * 100)}%`,
    },
    {
      title: "Saturates",
      value: `${Math.round((perServing.saturates_g || 0) * 10) / 10}g`,
      level: nutrientLevel("saturates", per100g.saturates_g || 0),
      ri: `${Math.round(((perServing.saturates_g || 0) / 20) * 100)}%`,
    },
    {
      title: "Sugars",
      value: `${Math.round((perServing.sugars_g || 0) * 10) / 10}g`,
      level: nutrientLevel("sugars", per100g.sugars_g || 0),
      ri: `${Math.round(((perServing.sugars_g || 0) / 90) * 100)}%`,
    },
    {
      title: "Salt",
      value: saltMissing
        ? "—"
        : `${Math.round((perServing.salt_g || 0) * 10) / 10}g`,
      level: nutrientLevel("salt", per100g.salt_g || 0),
      ri: saltMissing
        ? "—"
        : `${Math.round(((perServing.salt_g || 0) / 6) * 100)}%`,
    },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-3 py-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
          UK traffic light
        </p>

        <p className="text-right text-[10px] font-black leading-tight text-gray-400">
          % RI
        </p>
      </div>

      <div className="grid grid-cols-5 gap-0 px-0.5">
        {cells.map((cell, idx) => (
          <div
            key={cell.title}
            className="relative min-w-0 overflow-hidden rounded-[28px] border border-black/10 bg-gray-100 text-center shadow-[0_2px_10px_rgba(15,23,42,0.10)] ring-1 ring-white/70 -ml-1 first:ml-0"
          >
            <div
              className={`flex min-h-[88px] flex-col items-center px-1.5 pt-3 pb-2 ${levelClass(cell.level)}`}
            >
              <p className="text-[10px] font-black uppercase leading-tight">
                {cell.title}
              </p>

              <div className="mt-3 flex min-h-[34px] flex-col items-center justify-center text-[13px] font-extrabold leading-tight whitespace-pre-line">
                {cell.value}
              </div>
            </div>

            <div className="border-t border-black/10">
              <div className="bg-gray-100 min-h-[16px] px-1 pt-0.5 pb-0 text-[9px] font-black uppercase leading-none text-gray-950">
                {cell.level === "neutral"
                  ? "\u00A0"
                  : cell.level.toUpperCase()}
              </div>

              <div
                className={`border-t border-black/10 px-1 pt-1.5 pb-1.5 text-[12px] font-black leading-none tabular-nums ${levelClass(cell.level)}`}
              >
                {cell.ri}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 text-center text-xs leading-relaxed text-gray-400">
        <p>% of adult's reference intake for the amount shown.</p>
        <p>
          Values shown for {shownAmountLabel}. Traffic-light colours use UK
          per-100g thresholds.
        </p>
      </div>
    </div>
  );
};

export default NutrientTrafficStrip;
