type RecipeUserState = {
  cookCount: number;
  lastCookedAt: string | null;
  hasActiveSession: boolean;
  hasNote: boolean;
};

export type RecipeTimeBand = 'quick' | 'weeknight' | 'slow' | 'project' | 'unknown';
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
  const recipe = getRecipePayload(video);
  const summary = parseObject(video?.summary ?? video?.summarytext ?? video?.raw?.summary);
  return [
    getRecipeTitle(video),
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

  const instructionText = collectStrings(
    recipe?.instructions ??
    recipe?.steps ??
    recipe?.directions ??
    recipe?.method ??
    recipe?.instruction_sections ??
    recipe?.instructions_sections ??
    recipe?.instructionSections
  );
  return parseMinutes(instructionText);
}

export function getRecipeTimeBand(video: any): RecipeTimeBand {
  const minutes = estimateRecipeTimeMinutes(video);
  if (!minutes) return 'unknown';
  if (minutes <= 30) return 'quick';
  if (minutes <= 60) return 'weeknight';
  if (minutes <= 120) return 'slow';
  return 'project';
}

export function detectRecipeTechniques(video: any): string[] {
  const text = recipeText(video).toLowerCase();
  const patterns: Array<[string, RegExp]> = [
    ['bake', /\bbak(e|ed|ing)\b/],
    ['roast', /\broast(s|ed|ing)?\b/],
    ['grill', /\bgrill(s|ed|ing)?\b/],
    ['fry', /\bfry|fried|frying\b/],
    ['sauté', /\bsaut[eé](s|ed|ing)?\b/],
    ['braise', /\bbrais(e|ed|ing)\b/],
    ['stew', /\bstew(s|ed|ing)?\b/],
    ['slow cooker', /\bslow cooker|crockpot|crock pot\b/],
    ['air fryer', /\bair fryer|air-fryer\b/],
    ['no-cook', /\bno cook|no-cook|without cooking|raw\b/],
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
  const candidates = videos.filter((video) => !getRecipeUserState(video).hasActiveSession);
  if (candidates.length === 0) return null;

  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const isWeekdayEvening = !isWeekend && now.getHours() >= 16;

  const scored = candidates.map((video) => {
    const state = getRecipeUserState(video);
    const band = getRecipeTimeBand(video);
    const savedAt = new Date(video?.savedAt ?? video?.saved_at ?? video?.createdAt ?? video?.created_at ?? 0).getTime();
    let score = Number.isFinite(savedAt) ? savedAt / 100000000000 : 0;
    let reason = 'Never cooked';

    if (state.cookCount === 0) score += 20;
    if (isUntouchedSave(video, now)) {
      score += 18;
      reason = 'You saved this a while ago';
    }
    if (isWeekdayEvening && band === 'quick') {
      score += 30;
      reason = 'Quick enough for tonight';
    }
    if (isWeekend && (band === 'slow' || band === 'project')) {
      score += 30;
      reason = 'Weekend project';
    }
    if (band === 'unknown') score -= 4;

    return { video, reason, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const pick = scored[0];
  return pick ? { video: pick.video, reason: pick.reason } : null;
}
