export function scaleNutritionValues<T extends Record<string, number>>(
  values: T,
  scale: number
): T {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === "number" ? value * scale : value,
    ])
  ) as T;
}

export function formatPortionSize(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${Math.round(value)}g`;
}

export function pct(value: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((value / total) * 100);
}
