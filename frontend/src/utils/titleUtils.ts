export const safeStr = (v: any): string => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return safeStr(v[0]);
  if (typeof v === 'object')
    return String(v.text || v.title || v.summary || v.headline || v.name || '');
  return String(v);
};

export function resolveTitle(
  video: any,
  t: any
): { english: string; original: string; hasTwoLanguages: boolean } {
  const DEFAULT = t('videoCard:untitledVideo', 'Saved Video');

  // 1. Parse summary JSON
  let summaryObj: any = video?.summary ?? video?.summarytext ?? video?.raw?.summary ?? {};
  if (typeof summaryObj === 'string') {
    try { summaryObj = JSON.parse(summaryObj); } catch { summaryObj = {}; }
  }
  if (!summaryObj || typeof summaryObj !== 'object') summaryObj = {};

  const sumEngTitle  = safeStr(summaryObj?.english?.title).trim();
  const sumOrigTitle = safeStr(summaryObj?.original?.title).trim();

  // 2. Parse recipe JSON (old DB rows hide the title here)
  let recipeObj: any = video?.recipe ?? video?.raw?.recipe ?? {};
  if (typeof recipeObj === 'string') {
    try { recipeObj = JSON.parse(recipeObj); } catch { recipeObj = {}; }
  }
  if (!recipeObj || typeof recipeObj !== 'object') recipeObj = {};
  if (recipeObj?.recipe) recipeObj = recipeObj.recipe; // unwrap double-nesting

  const recEngTitle  = safeStr(recipeObj?.english?.title).trim();
  const recOrigTitle = safeStr(recipeObj?.original?.title).trim();

  // 3. Flat DB column — Flask returns snake_case, so check all variants
  const dbTitle = safeStr(
    video?.summary_title ?? // ← snake_case (Flask default) — THIS was the missing key
    video?.summarytitle  ??
    video?.summaryTitle
  ).trim();

  // 4. Title passed in from parent — reject if it's just a caption cutoff
  let passedTitle = safeStr(video?.title).trim();
  const captionFirstLine  = safeStr(video?.caption ?? '').split('\n')[0].trim();
  const captionCutoff56   = captionFirstLine.substring(0, 56).trim();
  const isJustCaption =
    passedTitle.length > 0 &&
    (passedTitle === captionFirstLine ||
      passedTitle === captionCutoff56 ||
      (passedTitle.length <= 60 && captionFirstLine.startsWith(passedTitle)));
  if (isJustCaption) passedTitle = '';

  // 5. Top-level summary.title (not nested under english/original)
  const flatSummaryTitle = safeStr(summaryObj?.title).trim();

  // Priority: AI summary → AI recipe → DB column → passed title → flat summary → caption → default
  const english =
    sumEngTitle  || recEngTitle  || dbTitle || passedTitle || flatSummaryTitle ||
    (captionFirstLine ? captionFirstLine.substring(0, 80) : DEFAULT);

  const original =
    sumOrigTitle || recOrigTitle || dbTitle || passedTitle || flatSummaryTitle || english;

  const hasTwoLanguages =
    (!!sumEngTitle && !!sumOrigTitle) || (!!recEngTitle && !!recOrigTitle);

  return { english, original, hasTwoLanguages };
}
