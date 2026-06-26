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

  const levelTheme = (
    level: "low" | "medium" | "high" | "neutral"
  ) => {
    if (level === "low") {
      return {
        card: "bg-[rgb(22,163,74)] shadow-[0_8px_18px_rgba(22,163,74,0.30)]",
        levelText: "text-[rgb(22,163,74)]",
      };
    }
    if (level === "medium") {
      return {
        card: "bg-[rgb(245,158,11)] shadow-[0_8px_18px_rgba(245,158,11,0.30)]",
        levelText: "text-[rgb(245,158,11)]",
      };
    }
    if (level === "high") {
      return {
        card: "bg-[rgb(225,29,72)] shadow-[0_8px_18px_rgba(225,29,72,0.30)]",
        levelText: "text-[rgb(225,29,72)]",
      };
    }
    return {
      card: "bg-white border border-[#e8edf3] shadow-[0_2px_9px_rgba(15,23,42,0.07)]",
      levelText: "text-slate-950",
    };
  };

  const formatAmount = (value: number) => {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(Math.round(rounded)) : String(rounded);
  };

  const cells = [
    {
      title: "Energy",
      value: [`${energyKj}kJ`, `${Math.round(perServing.calories || 0)}kcal`],
      level: "neutral" as const,
      ri: `${Math.round(((perServing.calories || 0) / 2000) * 100)}%`,
    },
    {
      title: "Fat",
      value: `${formatAmount(perServing.fat_g || 0)}g`,
      level: nutrientLevel("fat", per100g.fat_g || 0),
      ri: `${Math.round(((perServing.fat_g || 0) / 70) * 100)}%`,
    },
    {
      title: "Saturates",
      value: `${formatAmount(perServing.saturates_g || 0)}g`,
      level: nutrientLevel("saturates", per100g.saturates_g || 0),
      ri: `${Math.round(((perServing.saturates_g || 0) / 20) * 100)}%`,
    },
    {
      title: "Sugars",
      value: `${formatAmount(perServing.sugars_g || 0)}g`,
      level: nutrientLevel("sugars", per100g.sugars_g || 0),
      ri: `${Math.round(((perServing.sugars_g || 0) / 90) * 100)}%`,
    },
    {
      title: "Salt",
      value: saltMissing
        ? "—"
        : `${formatAmount(perServing.salt_g || 0)}g`,
      level: nutrientLevel("salt", per100g.salt_g || 0),
      ri: saltMissing
        ? "—"
        : `${Math.round(((perServing.salt_g || 0) / 6) * 100)}%`,
    },
  ];

  return (
    <div className="rounded-[18px] border border-[#eef2f7] bg-slate-50 p-[18px]">
      <div className="mb-[14px] flex items-center justify-between gap-3">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-400">
          UK traffic light
        </p>

        <p className="text-right text-[11px] font-bold tracking-[0.06em] text-slate-400">
          % RI
        </p>
      </div>

      <div className="grid grid-cols-2 gap-[8px] lg:grid-cols-5">
        {cells.map((cell) => {
          const theme = levelTheme(cell.level);

          if (cell.level === "neutral") {
            return (
              <div
                key={cell.title}
                className={`flex flex-col overflow-hidden rounded-[15px] ${theme.card}`}
              >
                <div className="flex flex-col items-center gap-2 px-[6px] py-[14px] text-center">
                  <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-slate-600">
                    {cell.title}
                  </p>
                  <div className="flex min-h-[40px] flex-col items-center justify-center gap-1 text-[15px] font-extrabold leading-tight text-slate-950">
                    {(cell.value as string[]).map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </div>
                </div>

                <div className="h-[26px] border-y border-slate-100 bg-[#fbfcfe]" />

                <div className="px-[9px] py-[9px] text-center text-[15px] font-extrabold text-slate-950">
                  {cell.ri}
                </div>
              </div>
            );
          }

          return (
            <div
              key={cell.title}
              className={`flex flex-col overflow-hidden rounded-[15px] ${theme.card}`}
            >
              <div className="flex flex-col items-center gap-[9px] px-[6px] py-[14px] text-center">
                <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-white">
                  {cell.title}
                </p>
                <div className="text-[20px] font-extrabold leading-none text-white">
                  {cell.value as string}
                </div>
              </div>

              <div className={`bg-white/94 px-[6px] py-[6px] text-center text-[10.5px] font-extrabold uppercase tracking-[0.05em] ${theme.levelText}`}>
                {cell.level.toUpperCase()}
              </div>

              <div className="px-[9px] py-[9px] text-center text-[15px] font-extrabold leading-none tabular-nums text-white">
                {cell.ri}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-[14px] text-center text-[12.5px] leading-[1.55] text-slate-400">
        <p>% of an adult&apos;s reference intake for the amount shown.</p>
        <p>
          Values shown for {shownAmountLabel}. Traffic-light colours use UK
          per-100g thresholds.
        </p>
      </div>
    </div>
  );
};

export default NutrientTrafficStrip;
