import { nutritionTable, type NutritionPer100g } from "../data/nutritionTable";

export type NutritionTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  saturates_g: number;
  sugars_g: number;
  salt_g: number;
};

export type NutriScoreResult = {
  letter: "A" | "B" | "C" | "D" | "E";
  score: number;
  negativePoints: number;
  positivePoints: number;
};

export type NutritionResult = {
  perServing: NutritionTotals;
  per100g: NutritionTotals;
  totalRecipe: NutritionTotals;
  totalWeightG: number;
  matchedCount: number;
  totalCount: number;
  confidence: "high" | "medium" | "low";
  nutriScore: NutriScoreResult;
};

const zeroTotals = (): NutritionTotals => ({
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  saturates_g: 0,
  sugars_g: 0,
  salt_g: 0
});

const aliases: Record<string, string> = {
  "cuisse de poulet": "chicken thigh",
  "cuisses de poulet": "chicken thigh",
  "poulet": "chicken thigh",
  "tete d ail": "garlic",
  "tete ail": "garlic",
  "brin de thym": "thyme",
  "brins de thym": "thyme",
  "feuille de laurier": "bay leaf",
  "feuilles de laurier": "bay leaf",
  "gras de canard": "duck fat",
  "fond de volaille": "chicken stock",
  "skyr": "skyr",
  "yaourt": "nonfat yogurt",
  "yaourt non gras": "nonfat yogurt",
  "moutarde": "dijon mustard",
  "moutarde de dijon": "dijon mustard",
  "miel": "honey",
  "ail": "garlic",
  "gousse ail": "garlic",
  "sauce worcestershire": "worcestershire sauce",
  "paprika": "paprika",
  "paprika fume": "paprika",
  "vinaigre": "apple cider vinegar",
  "vinaigre de cidre": "apple cider vinegar",
  "vinaigre de cidre de pomme": "apple cider vinegar",
  "sel": "salt",
  "poivre": "pepper"
};

const unitToGrams: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5,
  tbsp: 15,
  tablespoon: 15,
  tablespoons: 15,
  cup: 240,
  cups: 240,
  oz: 28.35,
  lb: 453.59,

  "cuillere a cafe": 5,
  "c. a cafe": 5,
  "c a cafe": 5,
  "cuillere a soupe": 15,
  "gousse": 5,
  "gousses": 5
};

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const normalizeName = (name = "") =>
  stripAccents(name)
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\b(fresh|dried|chopped|sliced|minced|large|small|medium|frais|seche|hach[eé]|tranche|grand|petit|moyen|ou)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/s$/, "");

const normalizeUnit = (unit = "") =>
  stripAccents(unit)
    .toLowerCase()
    .replace(/[^\w\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseQuantity = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 1;

  const clean = value.trim().replace(",", ".");
  const fraction = clean.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);

  const mixed = clean.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);

  const decimal = clean.match(/[\d.]+/);
  return decimal ? Number(decimal[0]) : 1;
};

const ingredientToGrams = (ingredient: any): number => {
  if (ingredient.quantityRange?.min && ingredient.quantityRange?.max) {
    const avg = (Number(ingredient.quantityRange.min) + Number(ingredient.quantityRange.max)) / 2;
    const rangeUnit = normalizeUnit(String(ingredient.quantityRange.unit ?? "g"));
    return avg * (unitToGrams[rangeUnit] ?? 1);
  }

  const quantity = parseQuantity(ingredient.quantity ?? ingredient.amount ?? ingredient.qty);
  const rawUnit = String(ingredient.unit ?? "");
  const unit = normalizeUnit(rawUnit);
  return quantity * (unitToGrams[unit] ?? 100);
};

const findNutrition = (rawName: string): NutritionPer100g | undefined => {
  const name = normalizeName(rawName);
  const aliased = aliases[name] ?? Object.entries(aliases).find(([key]) => {
    const normalizedKey = normalizeName(key);
    return name.includes(normalizedKey) || normalizedKey.includes(name);
  })?.[1];
  const lookup = aliased ?? name;

  return (
    nutritionTable[lookup] ??
    nutritionTable[name] ??
    Object.entries(nutritionTable).find(([key]) => lookup.includes(key) || key.includes(lookup))?.[1]
  );
};


const pointsAbove = (value: number, thresholds: number[]) =>
  thresholds.reduce((points, threshold) => points + (value > threshold ? 1 : 0), 0);

const pointsAtLeast = (value: number, thresholds: number[]) =>
  thresholds.reduce((points, threshold) => points + (value >= threshold ? 1 : 0), 0);

const calculateNutriScore = (per100g: NutritionTotals): NutriScoreResult => {
  const sodiumMg = per100g.salt_g * 400;

  const negativePoints =
    pointsAbove(per100g.calories, [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350]) +
    pointsAbove(per100g.sugars_g, [4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45]) +
    pointsAbove(per100g.saturates_g, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) +
    pointsAbove(sodiumMg, [90, 180, 270, 360, 450, 540, 630, 720, 810, 900]);

  // Demo v1: fruit/veg/pulse/nut % and fiber are not inferred yet.
  const fruitVegPoints = 0;
  const fiberPoints = 0;
  const proteinPoints = pointsAtLeast(per100g.protein_g, [1.6, 3.2, 4.8, 6.4, 8]);

  const positivePoints = fruitVegPoints + fiberPoints + proteinPoints;
  const score = negativePoints - positivePoints;

  const letter =
    score <= -1 ? "A" :
    score <= 2 ? "B" :
    score <= 10 ? "C" :
    score <= 18 ? "D" : "E";

  return { letter, score, negativePoints, positivePoints };
};

const roundTotals = (totals: NutritionTotals): NutritionTotals => ({
  calories: Math.round(totals.calories),
  protein_g: Math.round(totals.protein_g),
  carbs_g: Math.round(totals.carbs_g),
  fat_g: Math.round(totals.fat_g),
  saturates_g: Math.round(totals.saturates_g),
  sugars_g: Math.round(totals.sugars_g),
  salt_g: Math.round(totals.salt_g * 10) / 10
});

export const calculateNutrition = (ingredients: any[] = [], servings = 1): NutritionResult => {
  const totalRecipe = zeroTotals();
  let matchedCount = 0;
  let totalWeightG = 0;

  ingredients.forEach((ingredient) => {
    const name = ingredient.name ?? ingredient.item ?? ingredient.ingredient ?? ingredient.text ?? "";
    const nutrition = findNutrition(name);

    if (!nutrition) return;

    matchedCount += 1;
    const grams = ingredientToGrams(ingredient);
    totalWeightG += grams;
    const factor = grams / 100;

    totalRecipe.calories += nutrition.calories * factor;
    totalRecipe.protein_g += nutrition.protein_g * factor;
    totalRecipe.carbs_g += nutrition.carbs_g * factor;
    totalRecipe.fat_g += nutrition.fat_g * factor;
    totalRecipe.saturates_g += (nutrition.saturates_g ?? 0) * factor;
    totalRecipe.sugars_g += (nutrition.sugars_g ?? 0) * factor;
    totalRecipe.salt_g += (nutrition.salt_g ?? 0) * factor;
  });

  const safeServings = Math.max(Number(servings) || 1, 1);
  const perServing = Object.fromEntries(
    Object.entries(totalRecipe).map(([key, value]) => [key, value / safeServings])
  ) as NutritionTotals;

  const per100g = Object.fromEntries(
    Object.entries(totalRecipe).map(([key, value]) => [key, totalWeightG > 0 ? (value / totalWeightG) * 100 : 0])
  ) as NutritionTotals;

  const roundedPer100g = roundTotals(per100g);
  const ratio = ingredients.length ? matchedCount / ingredients.length : 0;

  return {
    perServing: roundTotals(perServing),
    per100g: roundedPer100g,
    totalRecipe: roundTotals(totalRecipe),
    totalWeightG: Math.round(totalWeightG),
    matchedCount,
    totalCount: ingredients.length,
    confidence: ratio >= 0.8 ? "high" : ratio >= 0.5 ? "medium" : "low",
    nutriScore: calculateNutriScore(roundedPer100g)
  };
};
