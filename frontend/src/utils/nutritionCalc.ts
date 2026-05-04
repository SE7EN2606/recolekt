import { nutritionTable, type NutritionPer100g } from "../data/nutritionTable";

export type NutritionTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  saturates_g: number;
  sugars_g: number;
  salt_g: number;
  fiber_g: number;
};

export type NutriScoreResult = {
  letter: "A" | "B" | "C" | "D" | "E";
  score: number;
  negativePoints: number;
  positivePoints: number;
  fruitVegPct: number;
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
  effectiveServings: number;
  servingSizeG: number | null;
  servingEstimateReason: "source" | "sauce_portion" | "weight_portion" | "fallback";
};

const zeroTotals = (): NutritionTotals => ({
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  saturates_g: 0,
  sugars_g: 0,
  salt_g: 0,
  fiber_g: 0,
});

const aliases: Record<string, string> = {
  // FR core
  "poulet": "chicken thigh",
  "cuisse de poulet": "chicken thigh",
  "cuisses de poulet": "chicken thigh",
  "blanc de poulet": "chicken breast",
  "ail": "garlic",
  "tete ail": "garlic",
  "tete d ail": "garlic",
  "gousse ail": "garlic",
  "oignon": "onion",
  "tomate": "tomato",
  "pomme de terre": "potato",
  "pommes de terre": "potato",
  "carotte": "carrot",
  "riz": "rice",
  "pates": "pasta",
  "pate": "pasta",
  "farine": "flour",
  "oeuf": "egg",
  "oeufs": "egg",
  "lait": "milk",
  "creme": "cream",
  "beurre": "butter",
  "huile olive": "olive oil",
  "huile d olive": "olive oil",
  "gras de canard": "duck fat",
  "fond de volaille": "chicken stock",
  "bouillon de volaille": "chicken stock",
  "sel": "salt",
  "poivre": "pepper",
  "thym": "thyme",
  "brins de thym": "thyme",
  "laurier": "bay leaf",
  "feuille de laurier": "bay leaf",
  "feuilles de laurier": "bay leaf",
  "saumon": "salmon",
  "crevette": "shrimp",
  "crevettes": "shrimp",
  "boeuf hache": "beef mince",
  "parmesan": "parmesan",
  "mozzarella": "mozzarella",
  "yaourt": "nonfat yogurt",
  "yaourt non gras": "nonfat yogurt",
  "skyr": "skyr",
  "moutarde": "dijon mustard",
  "moutarde de dijon": "dijon mustard",
  "miel": "honey",
  "sauce worcestershire": "worcestershire sauce",
  "paprika": "paprika",
  "paprika fume": "paprika",
  "vinaigre": "apple cider vinegar",
  "vinaigre de cidre": "apple cider vinegar",
  "vinaigre de cidre de pomme": "apple cider vinegar",

  // EN normalization
  "chicken thighs": "chicken thigh",
  "chicken breast fillet": "chicken breast",
  "cuisses poulet": "chicken thigh",
  "cuisse poulet": "chicken thigh",
  "gras canard": "duck fat",
  "brins thym": "thyme",
  "feuilles laurier": "bay leaf",
  "fond volaille": "chicken stock",
  "ground beef": "beef mince",
  "minced beef": "beef mince",
  "olive oil": "olive oil",
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
  "c a cafe": 5,
  "c. a cafe": 5,
  "cuillere a soupe": 15,
  "c a soupe": 15,
  "gousse": 5,
  "gousses": 5,
  "tete": 50,
  "tetes": 50,
  "brin": 1,
  "brins": 1,
  "feuille": 0.2,
  "feuilles": 0.2,
};

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const normalizeName = (name = "") =>
  stripAccents(name)
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\b(fresh|dried|chopped|sliced|minced|large|small|medium|frais|fraiche|seche|sechee|hache|hachee|tranche|grand|petit|moyen|ou|de|du|des|d|la|le|les)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/s$/, "");

const normalizeUnit = (unit = "") =>
  stripAccents(unit)
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^\w\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseQuantity = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value).trim().toLowerCase();

  if (
    !text ||
    text === "to taste" ||
    text === "as needed" ||
    text === "a/r" ||
    text === "q.s." ||
    text === "qs"
  ) {
    return null;
  }

  const mixedFractionMatch = text.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (mixedFractionMatch) {
    const whole = Number(mixedFractionMatch[1]);
    const numerator = Number(mixedFractionMatch[2]);
    const denominator = Number(mixedFractionMatch[3]);
    if (denominator > 0) return whole + numerator / denominator;
  }

  const fractionMatch = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (denominator > 0) return numerator / denominator;
  }

  const rangeMatch = text.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    return Number(rangeMatch[1]);
  }

  const numberMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (numberMatch) return Number(numberMatch[1]);

  return null;
};

const estimateUnitlessCountGrams = (ingredient: any, quantity: number): number | null => {
  const name = String(
    ingredient.displayName ??
    ingredient.name ??
    ingredient.ingredient ??
    ingredient.rawText ??
    ""
  ).toLowerCase();

  const unitText = String(
    ingredient.unit ??
    ingredient.measurementUnit ??
    ingredient.rawText ??
    ""
  ).toLowerCase();

  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  if (name.includes("garlic") && (unitText.includes("clove") || quantity <= 12)) return quantity * 3;
  if (name.includes("egg")) return quantity * 50;
  if (name.includes("lime")) return quantity * 67;
  if (name.includes("lemon")) return quantity * 58;
  if (name.includes("onion")) return quantity * 110;
  if (name.includes("shallot")) return quantity * 35;
  if (name.includes("tomato")) return quantity * 120;
  if (name.includes("potato")) return quantity * 170;
  if (name.includes("carrot")) return quantity * 60;
  if (name.includes("scallop")) return quantity * 25;

  return null;
};

const ingredientToGrams = (ingredient: any): number | null => {
  const quantity = parseQuantity(
    ingredient.quantity ??
    ingredient.amount ??
    ingredient.qty ??
    ingredient.rawQuantity ??
    ingredient.quantityRange?.min
  );

  if (quantity === null) return null;

  const rawUnit =
    ingredient.unit ??
    ingredient.measurementUnit ??
    ingredient.quantityRange?.unit;

  const unit = normalizeUnit(String(rawUnit ?? ""));

  if (!unit) {
    return estimateUnitlessCountGrams(ingredient, quantity);
  }

  const factor = unitToGrams[unit];
  if (!factor) return null;

  return quantity * factor;
};


const roundTotals = (totals: NutritionTotals): NutritionTotals => ({
  calories: Math.round(totals.calories),
  protein_g: Math.round(totals.protein_g * 10) / 10,
  carbs_g: Math.round(totals.carbs_g * 10) / 10,
  fat_g: Math.round(totals.fat_g * 10) / 10,
  saturates_g: Math.round(totals.saturates_g * 10) / 10,
  sugars_g: Math.round(totals.sugars_g * 10) / 10,
  salt_g: Math.round(totals.salt_g * 100) / 100,
  fiber_g: Math.round(totals.fiber_g * 10) / 10,
});

const pointsFromThresholds = (value: number, thresholds: number[]) =>
  thresholds.reduce((points, threshold) => points + (value > threshold ? 1 : 0), 0);

const calculateNutriScore = (
  per100g: NutritionTotals,
  fruitVegPct = 0
): NutriScoreResult => {
  // Soft estimate for foods only. This is not an official certified Nutri-Score implementation.
  // Nutri-Score sodium thresholds use sodium mg, while Recolekt stores salt in grams.
  const sodiumMg = Math.max(0, per100g.salt_g) * 1000 * 0.4;

  const energyPoints = pointsFromThresholds(per100g.calories, [80, 160, 240, 320, 400, 480, 560, 640, 720, 800]);
  const sugarsPoints = pointsFromThresholds(per100g.sugars_g, [3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34]);
  const saturatesPoints = pointsFromThresholds(per100g.saturates_g, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const sodiumPoints = pointsFromThresholds(sodiumMg, [90, 180, 270, 360, 450, 540, 630, 720, 810, 900]);

  const negativePoints = energyPoints + sugarsPoints + saturatesPoints + sodiumPoints;

  const fruitVegPoints =
    fruitVegPct >= 80 ? 5 :
    fruitVegPct >= 60 ? 2 :
    fruitVegPct >= 40 ? 1 :
    0;

  const fiberPoints = pointsFromThresholds(per100g.fiber_g, [0.9, 1.9, 2.8, 3.7, 4.7]);
  const proteinPoints = pointsFromThresholds(per100g.protein_g, [1.6, 3.2, 4.8, 6.4, 8.0]);

  const canCountProtein = negativePoints < 11 || fruitVegPoints === 5;
  const positivePoints = fruitVegPoints + fiberPoints + (canCountProtein ? proteinPoints : 0);

  const score = negativePoints - positivePoints;

  let letter: NutriScoreResult["letter"] = "C";
  if (score <= -1) letter = "A";
  else if (score <= 2) letter = "B";
  else if (score <= 10) letter = "C";
  else if (score <= 18) letter = "D";
  else letter = "E";

  return {
    letter,
    score,
    negativePoints,
    positivePoints,
    fruitVegPct: Math.round(fruitVegPct),
  };
};

const findNutrition = (input: any): NutritionPer100g | null => {
  const rawName = typeof input === "string"
    ? input
    : String(
        input?.displayName ??
        input?.name ??
        input?.ingredient ??
        input?.item ??
        input?.text ??
        input?.rawText ??
        ""
      );

  const normalizedName = normalizeName(rawName);
  if (!normalizedName) return null;

  const normalizedAliases = Object.fromEntries(
    Object.entries(aliases).map(([key, value]) => [normalizeName(key), value])
  );

  const aliasedName = normalizedAliases[normalizedName] ?? aliases[normalizedName] ?? normalizedName;

  const entries = Object.entries(nutritionTable ?? {});

  // 1) Direct normalized key match
  for (const [key, value] of entries) {
    const normalizedKey = normalizeName(key);
    if (normalizedKey === aliasedName) return value;
  }

  // 2) Alias points to table key
  for (const [key, value] of entries) {
    const normalizedKey = normalizeName(key);
    if (normalizedKey === normalizeName(aliases[aliasedName] ?? "")) return value;
  }

  // 3) Ingredient contains nutrition table key
  for (const [key, value] of entries) {
    const normalizedKey = normalizeName(key);
    if (normalizedKey && aliasedName.includes(normalizedKey)) return value;
  }

  // 4) Nutrition table key contains ingredient name
  for (const [key, value] of entries) {
    const normalizedKey = normalizeName(key);
    if (aliasedName && normalizedKey.includes(aliasedName)) return value;
  }

  return null;
};

export const calculateNutrition = (
  ingredients: any[] = [],
  servings?: number | null,
  options: { recipeName?: string } = {}
): NutritionResult => {
  const totalRecipe = zeroTotals();
  let matchedCount = 0;
  let totalWeightG = 0;
  let fruitVegWeightG = 0;

  ingredients.forEach((ingredient) => {
    const nutrition = findNutrition(ingredient);
    if (!nutrition) return;

    const grams = ingredientToGrams(ingredient);
    if (grams === null || grams <= 0) return;

    matchedCount += 1;

    const factor = grams / 100;
    totalWeightG += grams;

    if (nutrition.isFruitVegNutPulseOil) {
      fruitVegWeightG += grams;
    }

    totalRecipe.calories += nutrition.calories * factor;
    totalRecipe.protein_g += nutrition.protein_g * factor;
    totalRecipe.carbs_g += nutrition.carbs_g * factor;
    totalRecipe.fat_g += nutrition.fat_g * factor;
    totalRecipe.saturates_g += (nutrition.saturates_g ?? 0) * factor;
    totalRecipe.sugars_g += (nutrition.sugars_g ?? 0) * factor;
    totalRecipe.salt_g += (nutrition.salt_g ?? 0) * factor;
    totalRecipe.fiber_g += (nutrition.fiber_g ?? 0) * factor;
  });

  const explicitServings = Number(servings);
  const hasExplicitServings = Number.isFinite(explicitServings) && explicitServings > 0;

  const recipeHint = normalizeName(options.recipeName ?? "");
  const sauceLike =
    /\b(mayo|mayonnaise|hollandaise|sauce|dip|spread|dressing|pesto|aioli|vinaigrette|salsa|chutney|jam|jar)\b/.test(recipeHint);

  const servingSizeG =
    hasExplicitServings ? null :
    sauceLike ? 20 :
    totalWeightG >= 300 ? 150 :
    totalWeightG >= 120 ? 100 :
    null;

  const estimatedServings =
    hasExplicitServings ? explicitServings :
    servingSizeG && totalWeightG > 0 ? Math.max(1, totalWeightG / servingSizeG) :
    1;

  const safeServings = Math.max(estimatedServings, 1);

  const servingEstimateReason =
    hasExplicitServings ? "source" :
    sauceLike ? "sauce_portion" :
    servingSizeG ? "weight_portion" :
    "fallback";

  const perServing = Object.fromEntries(
    Object.entries(totalRecipe).map(([key, value]) => [key, value / safeServings])
  ) as NutritionTotals;

  const per100g = Object.fromEntries(
    Object.entries(totalRecipe).map(([key, value]) => [key, totalWeightG > 0 ? (value / totalWeightG) * 100 : 0])
  ) as NutritionTotals;

  const roundedPer100g = roundTotals(per100g);
  const fruitVegPct = totalWeightG > 0 ? (fruitVegWeightG / totalWeightG) * 100 : 0;
  const ratio = ingredients.length ? matchedCount / ingredients.length : 0;

  return {
    perServing: roundTotals(perServing),
    per100g: roundedPer100g,
    totalRecipe: roundTotals(totalRecipe),
    totalWeightG: Math.round(totalWeightG),
    matchedCount,
    totalCount: ingredients.length,
    confidence: ratio >= 0.8 ? "high" : ratio >= 0.5 ? "medium" : "low",
    nutriScore: calculateNutriScore(roundedPer100g, fruitVegPct),
    effectiveServings: Math.round(safeServings * 10) / 10,
    servingSizeG,
    servingEstimateReason,
  };
};
