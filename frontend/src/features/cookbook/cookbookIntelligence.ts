type RecipeUserState = {
  cookCount: number;
  lastCookedAt: string | null;
  hasActiveSession: boolean;
  hasNote: boolean;
};

export type RecipeTimeBand = 'quick' | 'weeknight' | 'slow' | 'project' | 'unknown';
export const RECIPE_TIME_BUCKETS = {
  QUICK_MEAL: 'QUICK_MEAL',
  WEEKNIGHT: 'WEEKNIGHT',
  SLOW_MEAL: 'SLOW_MEAL',
  PROJECT_MEAL: 'PROJECT_MEAL',
  UNKNOWN: 'UNKNOWN',
} as const;
export type RecipeTimeBucket = typeof RECIPE_TIME_BUCKETS[keyof typeof RECIPE_TIME_BUCKETS];
export type TodaysPick = {
  video: any;
  reason: string;
} | null;

export function parseObject(value: unknown): any {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return typeof value === 'object' ? value : {};
}

export function getVideoId(video: any): string {
  return String(video?.id ?? video?.process_id ?? video?.processId ?? '');
}

export function getVideoContentType(video: any): string {
  return String(
    video?.content_type ??
    video?.contentType ??
    video?.contenttype ??
    video?.raw?.content_type ??
    video?.__raw?.content_type ??
    ''
  ).toLowerCase();
}

export function getRecipePayload(videoOrRecipe: any): any {
  const root = parseObject(videoOrRecipe?.recipe ?? videoOrRecipe?.raw?.recipe ?? videoOrRecipe);
  return root?.recipe && typeof root.recipe === 'object' ? root.recipe : root;
}

export function getRecipeUserState(video: any): RecipeUserState {
  const raw = video?.recipeUserState ?? video?.recipe_user_state ?? video?.raw?.recipe_user_state ?? {};
  const cookCount = Number(raw?.cookCount ?? raw?.cook_count ?? 0);
  const lastCookedAt = raw?.lastCookedAt ?? raw?.last_cooked_at ?? null;

  return {
    cookCount: Number.isFinite(cookCount) && cookCount > 0 ? cookCount : 0,
    lastCookedAt,
    hasActiveSession: Boolean(raw?.hasActiveSession ?? raw?.has_active_session),
    hasNote: Boolean(raw?.hasNote ?? raw?.has_note),
  };
}

export function getRecipeTitle(video: any): string {
  const summary = parseObject(video?.summary ?? video?.summarytext ?? video?.raw?.summary);
  const recipe = getRecipePayload(video);

  return String(
    summary?.english?.title ??
    recipe?.english?.title ??
    recipe?.title ??
    video?.summaryTitle ??
    video?.summarytitle ??
    video?.title ??
    video?.caption?.split?.('\n')?.[0] ??
    'Recipe'
  ).trim();
}

function collectStrings(value: unknown, depth = 0): string {
  if (depth > 5 || value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(item => collectStrings(item, depth + 1)).join(' ');
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(item => collectStrings(item, depth + 1)).join(' ');
  return '';
}

function recipeText(video: any): string {
  return [getRecipeTitle(video), recipeBodyText(video)].filter(Boolean).join(' ');
}

function recipeBodyText(video: any): string {
  const recipe = getRecipePayload(video);
  const summary = parseObject(video?.summary ?? video?.summarytext ?? video?.raw?.summary);
  return [
    collectStrings(recipe?.ingredients),
    collectStrings(recipe?.ingredientLines ?? recipe?.ingredient_lines),
    collectStrings(recipe?.instructions ?? recipe?.steps ?? recipe?.directions ?? recipe?.method),
    collectStrings(recipe?.instruction_sections ?? recipe?.instructions_sections ?? recipe?.instructionSections),
    video?.summary_topic,
    video?.summaryTopic,
    summary?.topic,
    summary?.theme,
    video?.caption,
  ].filter(Boolean).join(' ');
}

function recipeInstructionText(video: any): string {
  const recipe = getRecipePayload(video);
  return collectStrings(
    recipe?.instructions ??
    recipe?.steps ??
    recipe?.directions ??
    recipe?.method ??
    recipe?.instruction_sections ??
    recipe?.instructions_sections ??
    recipe?.instructionSections
  );
}

function countArrayish(value: unknown): number {
  if (!value) return 0;
  if (Array.isArray(value)) {
    return value.reduce((total, item) => {
      if (item && typeof item === 'object') {
        const nestedItems =
          (item as any).items ??
          (item as any).ingredients ??
          (item as any).steps ??
          (item as any).instructions;
        if (Array.isArray(nestedItems)) return total + nestedItems.length;
      }
      return total + 1;
    }, 0);
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce<number>((total, item) => total + countArrayish(item), 0);
  }
  if (typeof value === 'string') {
    return value.split(/\n|\. /).map(part => part.trim()).filter(Boolean).length;
  }
  return 0;
}

export function getRecipeIngredientCount(video: any): number {
  const recipe = getRecipePayload(video);
  return countArrayish(
    recipe?.ingredients ??
    recipe?.ingredientLines ??
    recipe?.ingredient_lines ??
    recipe?.ingredient_sections ??
    recipe?.ingredientSections
  );
}

export function getRecipeStepCount(video: any): number {
  const recipe = getRecipePayload(video);
  return countArrayish(
    recipe?.instructions ??
    recipe?.steps ??
    recipe?.directions ??
    recipe?.method ??
    recipe?.instruction_sections ??
    recipe?.instructions_sections ??
    recipe?.instructionSections
  );
}

export function hasUsableCookbookRecipe(video: any): boolean {
  if (getVideoContentType(video) !== 'recipe') return false;
  if (isBrokenRecipe(video)) return false;
  return getRecipeIngredientCount(video) > 0 || getRecipeStepCount(video) > 0 || Boolean(recipeBodyText(video).trim());
}

export function isBrokenRecipe(video: any): boolean {
  const status = String(video?.status ?? video?.raw?.status ?? '').toLowerCase();
  if (['error', 'failed', 'deleted'].includes(status)) return true;
  const title = getRecipeTitle(video).toLowerCase();
  return title === 'recipe' && !recipeBodyText(video).trim();
}

function parseMinutes(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
  const text = String(value ?? '').toLowerCase();
  if (!text.trim()) return null;

  let total = 0;
  const timeRegex = /(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|hr|h|minutes?|mins?|min|m)\b/g;
  let match: RegExpExecArray | null;
  while ((match = timeRegex.exec(text)) !== null) {
    const amount = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(amount)) continue;
    const unit = match[2];
    total += /^h|hour|hr/.test(unit) ? amount * 60 : amount;
  }
  return total > 0 ? Math.round(total) : null;
}

export function estimateRecipeTimeMinutes(recipeInput: any): number | null {
  const recipe = getRecipePayload(recipeInput);
  const directCandidates = [
    recipe?.total_time,
    recipe?.totalTime,
    recipe?.cook_time,
    recipe?.cookTime,
    recipe?.prep_time,
    recipe?.prepTime,
    recipe?.time,
  ];

  for (const candidate of directCandidates) {
    const parsed = parseMinutes(candidate);
    if (parsed) return parsed;
  }

  return parseMinutes(recipeInstructionText(recipeInput));
}

export function getRecipeTimeBand(video: any): RecipeTimeBand {
  const minutes = estimateRecipeTimeMinutes(video);
  if (!minutes) return 'unknown';
  if (minutes <= 30) return 'quick';
  if (minutes <= 60) return 'weeknight';
  if (minutes <= 120) return 'slow';
  return 'project';
}

export function getRecipeTimeBucket(video: any): RecipeTimeBucket {
  const minutes = estimateRecipeTimeMinutes(video);
  if (!minutes) return RECIPE_TIME_BUCKETS.UNKNOWN;
  if (minutes < 30) return RECIPE_TIME_BUCKETS.QUICK_MEAL;
  if (minutes <= 60) return RECIPE_TIME_BUCKETS.WEEKNIGHT;
  if (minutes <= 120) return RECIPE_TIME_BUCKETS.SLOW_MEAL;
  return RECIPE_TIME_BUCKETS.PROJECT_MEAL;
}

export function detectRecipeTechniques(video: any): string[] {
  const text = recipeInstructionText(video).toLowerCase();
  const patterns: Array<[string, RegExp]> = [
    ['bake', /\bbak(e|ed|ing)\b/],
    ['braise', /\bbrais(e|ed|ing)\b/],
    ['fry', /\bfry|fried|frying\b/],
    ['grill', /\bgrill(s|ed|ing)?\b/],
    ['roast', /\broast(s|ed|ing)?\b/],
    ['air fryer', /\bair fryer|air-fryer\b/],
    ['no-cook', /\bno cook|no-cook|without cooking|raw\b/],
    ['one-pot', /\bone pot|one-pot|single pot|same pot|in the pot\b/],
  ];
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

export function getRecipeCuisineLabel(video: any): string | null {
  const recipe = getRecipePayload(video);
  const summary = parseObject(video?.summary ?? video?.summarytext ?? video?.raw?.summary);
  const value =
    recipe?.cuisine ??
    recipe?.cuisine_type ??
    recipe?.style ??
    recipe?.recipe_style ??
    video?.summary_topic ??
    video?.summaryTopic ??
    summary?.topic ??
    summary?.theme ??
    video?.category;

  const label = String(value ?? '').trim();
  if (!label || label.toLowerCase() === 'processing' || label.toLowerCase() === 'failed') return null;
  return label;
}

export function isNeverCooked(video: any): boolean {
  return getRecipeUserState(video).cookCount === 0;
}

export function isUntouchedSave(video: any, now = new Date()): boolean {
  const state = getRecipeUserState(video);
  const rawDate = video?.savedAt ?? video?.saved_at ?? video?.createdAt ?? video?.created_at;
  const savedAt = rawDate ? new Date(rawDate) : null;
  if (!savedAt || Number.isNaN(savedAt.getTime())) return false;

  const ageDays = (now.getTime() - savedAt.getTime()) / 86400000;
  return ageDays > 14 && state.cookCount === 0 && !state.hasActiveSession && !state.hasNote;
}

export function recipeSearchScore(video: any, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const text = [
    recipeText(video),
    getRecipeCuisineLabel(video),
    detectRecipeTechniques(video).join(' '),
  ].join(' ').toLowerCase();
  return text.includes(q) ? 1 : 0;
}

export function pickTodaysRecipe(videos: any[], now = new Date()): TodaysPick {
  const candidates = videos.filter((video) => hasUsableCookbookRecipe(video) && !getRecipeUserState(video).hasActiveSession);
  if (candidates.length === 0) return null;

  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const isWeekdayEvening = !isWeekend && now.getHours() >= 16;
  const recentCutoff = now.getTime() - 7 * 86400000;

  const scored = candidates.map((video) => {
    const state = getRecipeUserState(video);
    const bucket = getRecipeTimeBucket(video);
    const ingredientCount = getRecipeIngredientCount(video);
    const stepCount = getRecipeStepCount(video);
    const savedAt = new Date(video?.savedAt ?? video?.saved_at ?? video?.createdAt ?? video?.created_at ?? 0).getTime();
    const lastCookedAt = state.lastCookedAt ? new Date(state.lastCookedAt).getTime() : 0;
    const lastOpenedAt = new Date(
      video?.lastOpenedAt ??
      video?.last_opened_at ??
      video?.openedAt ??
      video?.opened_at ??
      video?.viewedAt ??
      video?.viewed_at ??
      0
    ).getTime();
    let score = Number.isFinite(savedAt) ? savedAt / 100000000000 : 0;
    let reason = 'Never cooked';

    if (state.cookCount === 0) {
      score += 24;
      reason = 'Never cooked';
    } else if (lastCookedAt && now.getTime() - lastCookedAt > 30 * 86400000) {
      score += 18;
      reason = 'Worth revisiting';
    }
    if (isUntouchedSave(video, now)) {
      score += 28;
      reason = 'You saved this a while ago';
    }
    if (ingredientCount > 0 && ingredientCount <= 10) score += 8;
    if (stepCount > 0 && stepCount <= 6) score += 6;
    if (ingredientCount > 16 || stepCount > 10) score -= isWeekend ? 0 : 8;
    if (isWeekdayEvening) {
      if (bucket === RECIPE_TIME_BUCKETS.QUICK_MEAL) {
        score += 34;
        reason = 'Fast enough for tonight';
      } else if (bucket === RECIPE_TIME_BUCKETS.WEEKNIGHT) {
        score += 18;
        reason = 'Weeknight-friendly';
      }
    }
    if (isWeekend) {
      if (bucket === RECIPE_TIME_BUCKETS.PROJECT_MEAL) {
        score += 34;
        reason = 'Worth trying this weekend';
      } else if (bucket === RECIPE_TIME_BUCKETS.SLOW_MEAL) {
        score += 18;
        reason = 'Weekend-friendly';
      }
    }
    if (Number.isFinite(lastCookedAt) && lastCookedAt > recentCutoff) score -= 10;
    if (Number.isFinite(lastOpenedAt) && lastOpenedAt > recentCutoff) score -= 6;
    if (bucket === RECIPE_TIME_BUCKETS.UNKNOWN) score -= 4;

    return { video, reason, savedAt, score };
  });

  scored.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;
    return b.savedAt - a.savedAt;
  });
  const pick = scored[0];
  return pick ? { video: pick.video, reason: pick.reason } : null;
}
