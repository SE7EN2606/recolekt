import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChefHat, CircleX, Clock3, Flame, Search, ShoppingBasket, StickyNote } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
  detectRecipeTechniques,
  estimateRecipeTimeMinutes,
  getRecipeCuisineLabel,
  getRecipeIngredientCount,
  getRecipeKeyIngredients,
  getRecipeStepCount,
  getRecipeTimeBucket,
  getRecipeTitle,
  getRecipeUserState,
  getVideoId,
  hasUsableCookbookRecipe,
  isNeverCooked,
  isUntouchedSave,
  pickTodaysRecipe,
  RECIPE_TIME_BUCKETS,
  type RecipeTimeBucket,
} from '../features/cookbook/cookbookIntelligence';
import { searchCookbookRecipes, type CookbookSearchResult } from '../features/cookbook/cookbookSearch';
import useShoppingList from '../features/shopping/useShoppingList';

type CookbookFilter = 'all' | 'quick' | 'never' | 'cooked' | 'notes' | 'planned';

const COOKBOOK_FILTERS: Array<{
  id: CookbookFilter;
  label: string;
  icon?: React.ElementType;
}> = [
  { id: 'all', label: 'All recipes', icon: ChefHat },
  { id: 'quick', label: 'Quick', icon: Clock3 },
  { id: 'never', label: 'Never cooked', icon: Flame },
  { id: 'cooked', label: 'Cooked before', icon: ChefHat },
  { id: 'notes', label: 'Has notes', icon: StickyNote },
  { id: 'planned', label: 'In shopping plan', icon: ShoppingBasket },
];

function getThumbnailUrl(video: any): string {
  return String(
    video?.posterUrl ||
    video?.coverUrl ||
    video?.gcsurls?.poster ||
    video?.thumbnailUrl ||
    video?.thumbnailurl ||
    video?.gcsurls?.previewthumbnail ||
    video?.gcsUrls?.previewThumbnail ||
    video?.previewthumbnail ||
    video?.gcs_urls?.preview_thumbnail ||
    ''
  );
}

function timeBucketLabel(bucket: RecipeTimeBucket): string | null {
  if (bucket === RECIPE_TIME_BUCKETS.QUICK_MEAL) return 'Quick';
  if (bucket === RECIPE_TIME_BUCKETS.WEEKNIGHT) return 'Weeknight';
  if (bucket === RECIPE_TIME_BUCKETS.SLOW_MEAL) return 'Slow cook';
  if (bucket === RECIPE_TIME_BUCKETS.PROJECT_MEAL) return 'Project';
  return null;
}

function formatCookTime(video: any): string | null {
  const minutes = estimateRecipeTimeMinutes(video);
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function sortBySavedAtDesc(a: any, b: any) {
  const aTime = new Date(a?.savedAt ?? a?.saved_at ?? a?.createdAt ?? a?.created_at ?? 0).getTime();
  const bTime = new Date(b?.savedAt ?? b?.saved_at ?? b?.createdAt ?? b?.created_at ?? 0).getTime();
  return bTime - aTime;
}

function sortByCookedAtDesc(a: any, b: any) {
  const aTime = new Date(getRecipeUserState(a).lastCookedAt || 0).getTime();
  const bTime = new Date(getRecipeUserState(b).lastCookedAt || 0).getTime();
  return bTime - aTime;
}

function sortByWeekdayFit(a: any, b: any) {
  const aMinutes = estimateRecipeTimeMinutes(a) ?? 45;
  const bMinutes = estimateRecipeTimeMinutes(b) ?? 45;
  const aScore = aMinutes + getRecipeIngredientCount(a) * 4 + getRecipeStepCount(a) * 6;
  const bScore = bMinutes + getRecipeIngredientCount(b) * 4 + getRecipeStepCount(b) * 6;
  return aScore - bScore || sortBySavedAtDesc(a, b);
}

function savedWithinDays(video: any, days: number, now = new Date()): boolean {
  const rawDate = video?.savedAt ?? video?.saved_at ?? video?.createdAt ?? video?.created_at;
  const savedAt = rawDate ? new Date(rawDate).getTime() : 0;
  return Number.isFinite(savedAt) && savedAt > 0 && now.getTime() - savedAt <= days * 86400000;
}

function isQuickCookingCandidate(video: any): boolean {
  const bucket = getRecipeTimeBucket(video);
  const ingredientCount = getRecipeIngredientCount(video);
  const stepCount = getRecipeStepCount(video);
  return (
    bucket === RECIPE_TIME_BUCKETS.QUICK_MEAL ||
    (bucket === RECIPE_TIME_BUCKETS.WEEKNIGHT && (ingredientCount === 0 || ingredientCount <= 10) && (stepCount === 0 || stepCount <= 6)) ||
    (!estimateRecipeTimeMinutes(video) && ingredientCount > 0 && ingredientCount <= 8 && stepCount > 0 && stepCount <= 5)
  );
}

function weekdayReason(video: any): string {
  const cookTime = formatCookTime(video);
  if (cookTime) return cookTime;
  const ingredientCount = getRecipeIngredientCount(video);
  if (ingredientCount > 0) return `${ingredientCount} ingredients`;
  return 'Weeknight fit';
}

function getCurrentStepLabel(video: any): string | null {
  const stepIndex = Number(
    video?.recipeUserState?.currentStepIndex ??
    video?.recipe_user_state?.current_step_index ??
    video?.__raw?.recipe_user_state?.current_step_index
  );
  if (!Number.isFinite(stepIndex) || stepIndex < 0) return null;
  return `Step ${stepIndex + 1}`;
}

const CookbookSection: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, children }) => (
  <section className="space-y-4">
    <div>
      <h2 className="text-lg font-black tracking-tight text-gray-950">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm font-medium text-gray-500">{subtitle}</p>}
    </div>
    {children}
  </section>
);

const CookbookEmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-[22px] border border-dashed border-amber-100 bg-white/55 px-4 py-5 text-sm font-medium text-gray-500 shadow-sm">
    {children}
  </div>
);

const RecipeDecisionCard: React.FC<{
  video: any;
  reason?: string;
  searchLabels?: string[];
  compact?: boolean;
  fill?: boolean;
  planned?: boolean;
}> = ({ video, reason, searchLabels = [], compact = false, fill = false, planned = false }) => {
  const navigate = useNavigate();
  const title = getRecipeTitle(video);
  const thumbnailUrl = getThumbnailUrl(video);
  const cookTime = formatCookTime(video);
  const cuisine = getRecipeCuisineLabel(video);
  const technique = detectRecipeTechniques(video)[0];
  const bucket = timeBucketLabel(getRecipeTimeBucket(video));
  const state = getRecipeUserState(video);
  const keyIngredients = getRecipeKeyIngredients(video);

  return (
    <button
      type="button"
      onClick={() => navigate(`/video/${getVideoId(video)}`, { state: { from: 'cookbook' } })}
      className={`group text-left ${
        fill
          ? 'w-full'
          : `shrink-0 ${compact ? 'w-[172px] md:w-[196px]' : 'w-[236px] md:w-[276px]'}`
      }`}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-slate-900 shadow-sm transition-shadow group-hover:shadow-md">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-500">
            No preview
          </div>
        )}
        {cookTime && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-black text-white backdrop-blur">
            {cookTime}
          </span>
        )}
        {state.hasActiveSession && (
          <span className="absolute left-2 top-2 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-black text-white shadow-sm">
            Resume
          </span>
        )}
      </div>
      <div className="pt-2">
        {reason && (
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
            {reason}
          </p>
        )}
        <p className="line-clamp-2 text-sm font-black leading-snug text-gray-950">
          {title}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {searchLabels.slice(0, 3).map((label) => (
            <span key={label} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
              {label}
            </span>
          ))}
          {searchLabels.length === 0 && bucket && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700 ring-1 ring-amber-100">
              {bucket}
            </span>
          )}
          {searchLabels.length === 0 && cuisine && (
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-black text-stone-600">
              {cuisine}
            </span>
          )}
          {searchLabels.length === 0 && technique && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-100">
              {technique}
            </span>
          )}
          {planned && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-100">
              Planned
            </span>
          )}
          {state.cookCount > 0 && (
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-gray-600 ring-1 ring-gray-100">
              Cooked {state.cookCount}x
            </span>
          )}
          {state.hasNote && (
            <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-black text-stone-600">
              <StickyNote size={10} aria-hidden="true" />
              Note
            </span>
          )}
        </div>
        {keyIngredients.length > 0 && (
          <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-snug text-gray-500">
            {keyIngredients.join(' · ')}
          </p>
        )}
        <span className="mt-2 inline-flex text-xs font-black text-emerald-700">
          View recipe
        </span>
      </div>
    </button>
  );
};

const HorizontalRecipeRow: React.FC<{
  videos: any[];
  emptyText: string;
  reason?: (video: any) => string;
  plannedRecipeIds?: Set<string>;
}> = ({ videos, emptyText, reason, plannedRecipeIds }) => {
  if (videos.length === 0) {
    return <CookbookEmptyState>{emptyText}</CookbookEmptyState>;
  }

  return (
    <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
      {videos.slice(0, 10).map((video) => (
        <RecipeDecisionCard
          key={getVideoId(video)}
          video={video}
          reason={reason?.(video)}
          compact
          planned={plannedRecipeIds?.has(getVideoId(video))}
        />
      ))}
    </div>
  );
};

const TodaysPickPanel: React.FC<{
  pick: NonNullable<ReturnType<typeof pickTodaysRecipe>>;
  planned: boolean;
}> = ({ pick, planned }) => {
  const navigate = useNavigate();
  const video = pick.video;
  const videoId = getVideoId(video);
  const title = getRecipeTitle(video);
  const thumbnailUrl = getThumbnailUrl(video);
  const cookTime = formatCookTime(video);
  const cuisine = getRecipeCuisineLabel(video);
  const keyIngredients = getRecipeKeyIngredients(video);
  const state = getRecipeUserState(video);

  const openRecipe = () => navigate(`/video/${videoId}`, { state: { from: 'cookbook' } });

  return (
    <div className="grid gap-4 rounded-[30px] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-emerald-50/60 p-3 shadow-sm md:grid-cols-[minmax(220px,0.72fr)_1fr] md:items-center md:gap-6 md:p-4">
      <button
        type="button"
        onClick={openRecipe}
        className="group relative aspect-[4/5] overflow-hidden rounded-[24px] bg-slate-900 text-left shadow-sm md:aspect-[5/4]"
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-500">
            No preview
          </span>
        )}
        {cookTime && (
          <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-[11px] font-black text-white backdrop-blur">
            {cookTime}
          </span>
        )}
      </button>
      <div className="min-w-0 space-y-3 md:pr-2">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-amber-700">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Flame size={14} aria-hidden="true" />
          </span>
          Today's Pick
        </div>
        <div>
          <h2 className="text-xl font-black leading-tight tracking-tight text-gray-950 md:text-2xl">{title}</h2>
          <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-gray-600">
            {pick.explanation}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {pick.signals.map((signal) => (
            <span key={signal} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-gray-700 ring-1 ring-amber-100">
              {signal}
            </span>
          ))}
          {cuisine && (
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-black text-stone-600">
              {cuisine}
            </span>
          )}
          {planned && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-100">
              In plan
            </span>
          )}
          {state.hasNote && !pick.signals.includes('Has notes') && (
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-black text-stone-600">
              Has notes
            </span>
          )}
        </div>
        {keyIngredients.length > 0 && (
          <p className="text-sm font-medium text-gray-500">
            Key ingredients: {keyIngredients.join(', ')}
          </p>
        )}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <button
            type="button"
            onClick={openRecipe}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            Cook this
          </button>
          <button
            type="button"
            onClick={openRecipe}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-amber-200 bg-white px-5 py-2.5 text-sm font-black text-amber-900 shadow-sm transition-colors hover:bg-amber-50"
          >
            View recipe
          </button>
        </div>
      </div>
    </div>
  );
};

export const Cookbook: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { videos, isLoading } = useData();
  const {
    recipeEntries: shoppingRecipeEntries,
    plannedRecipeIds,
    loading: shoppingLoading,
  } = useShoppingList();
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<CookbookFilter>('all');
  const [showAllRecipes, setShowAllRecipes] = useState(false);

  React.useEffect(() => {
    if (!loading && !user) navigate('/auth', { replace: true });
  }, [loading, user, navigate]);

  const recipes = useMemo(() => {
    return (videos || [])
      .filter((video: any) => hasUsableCookbookRecipe(video))
      .sort(sortBySavedAtDesc);
  }, [videos]);

  const continueCooking = useMemo(
    () => recipes.filter((video: any) => getRecipeUserState(video).hasActiveSession),
    [recipes]
  );

  const plannedRecipes = useMemo(() => {
    const recipesById = new Map(recipes.map((video: any) => [getVideoId(video), video]));
    return shoppingRecipeEntries
      .map((entry) => {
        const fromCookbook = recipesById.get(entry.reelId);
        if (fromCookbook) return fromCookbook;
        if (!entry.recipe) return null;
        return {
          ...entry.recipe,
          id: entry.recipe?.id || entry.reelId,
          process_id: entry.recipe?.process_id || entry.reelId,
        };
      })
      .filter(Boolean);
  }, [recipes, shoppingRecipeEntries]);

  const todaysPick = useMemo(() => pickTodaysRecipe(recipes, new Date()), [recipes]);

  const primaryRecommendationIds = useMemo(() => {
    const ids = new Set<string>();
    if (todaysPick) ids.add(getVideoId(todaysPick.video));
    return ids;
  }, [todaysPick]);

  const quickWins = useMemo(
    () => recipes
      .filter((video: any) => {
        if (primaryRecommendationIds.has(getVideoId(video))) return false;
        if (getRecipeUserState(video).hasActiveSession) return false;
        return isQuickCookingCandidate(video);
      })
      .sort(sortByWeekdayFit),
    [primaryRecommendationIds, recipes]
  );

  const primarySectionIds = useMemo(() => {
    const ids = new Set(primaryRecommendationIds);
    quickWins.slice(0, 10).forEach((video: any) => ids.add(getVideoId(video)));
    return ids;
  }, [primaryRecommendationIds, quickWins]);

  const neverCooked = useMemo(
    () => recipes
      .filter((video: any) => isNeverCooked(video) && !getRecipeUserState(video).hasActiveSession && !primarySectionIds.has(getVideoId(video))),
    [primarySectionIds, recipes]
  );

  const untouchedSaves = useMemo(
    () => recipes
      .filter((video: any) => isUntouchedSave(video, new Date()) && !primarySectionIds.has(getVideoId(video)))
      .sort(sortBySavedAtDesc),
    [primarySectionIds, recipes]
  );

  const cookedBefore = useMemo(
    () => recipes.filter((video: any) => getRecipeUserState(video).cookCount > 0).sort(sortByCookedAtDesc),
    [recipes]
  );

  const recentlySaved = useMemo(
    () => recipes
      .filter((video: any) => isNeverCooked(video) && savedWithinDays(video, 14) && !primarySectionIds.has(getVideoId(video)))
      .sort(sortBySavedAtDesc),
    [primarySectionIds, recipes]
  );

  const cookedRecipes = useMemo(() => recipes.filter((video: any) => getRecipeUserState(video).cookCount > 0), [recipes]);
  const quickRecipes = useMemo(() => recipes.filter((video: any) => isQuickCookingCandidate(video)), [recipes]);
  const recipesWithNotes = useMemo(() => recipes.filter((video: any) => getRecipeUserState(video).hasNote), [recipes]);
  const savedForLater = useMemo(() => {
    const videosById = new Map<string, any>();
    [...untouchedSaves, ...recentlySaved].forEach((video: any) => videosById.set(getVideoId(video), video));
    return Array.from(videosById.values()).sort(sortBySavedAtDesc);
  }, [recentlySaved, untouchedSaves]);

  const counts: Record<CookbookFilter, number> = {
    all: recipes.length,
    quick: quickRecipes.length,
    never: recipes.filter((video: any) => isNeverCooked(video)).length,
    cooked: cookedRecipes.length,
    notes: recipesWithNotes.length,
    planned: recipes.filter((video: any) => plannedRecipeIds.has(getVideoId(video))).length,
  };

  const filteredRecipeResults = useMemo<CookbookSearchResult[]>(() => {
    const byFilter = recipes.filter((video: any) => {
      const state = getRecipeUserState(video);
      if (activeFilter === 'quick') return isQuickCookingCandidate(video);
      if (activeFilter === 'never') return state.cookCount === 0;
      if (activeFilter === 'cooked') return state.cookCount > 0;
      if (activeFilter === 'notes') return state.hasNote;
      if (activeFilter === 'planned') return plannedRecipeIds.has(getVideoId(video));
      return true;
    });

    if (query.trim()) return searchCookbookRecipes(byFilter, query);
    return byFilter.map((video: any) => ({ video, score: 1, labels: [] }));
  }, [activeFilter, plannedRecipeIds, query, recipes]);

  if (loading || (isLoading && videos.length === 0)) {
    return (
      <div className="w-full animate-pulse pt-4 md:pt-0">
        <div className="mb-2 h-8 w-44 rounded-lg bg-gray-200" />
        <div className="mb-8 h-4 w-72 rounded-lg bg-gray-100" />
        <div className="space-y-8">
          {Array.from({ length: 3 }).map((_, sectionIndex) => (
            <div key={sectionIndex} className="space-y-3">
              <div className="h-5 w-36 rounded-lg bg-gray-200" />
              <div className="flex gap-4 overflow-hidden">
                {Array.from({ length: 4 }).map((__, cardIndex) => (
                  <div key={cardIndex} className="h-64 w-44 shrink-0 rounded-2xl bg-gray-200/60" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!user) return null;

  const searchActive = Boolean(query.trim()) || activeFilter !== 'all' || showAllRecipes;

  return (
    <div className="w-full animate-fade-in pb-24 pt-4 md:pb-14 md:pt-0">
      <div className="mb-8 rounded-[28px] border border-amber-100 bg-white/55 p-4 shadow-sm md:p-5">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-700">Cookbook</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-gray-950 md:text-3xl">What should I cook?</h1>
          <p className="mt-1 max-w-2xl text-sm font-medium text-gray-500">
            Turn saved recipe reels into tonight's decision, your cooking plan, and recipes worth returning to.
          </p>
        </div>
      </div>

      {!searchActive && todaysPick && (
        <div className="mb-10">
          <TodaysPickPanel pick={todaysPick} planned={plannedRecipeIds.has(getVideoId(todaysPick.video))} />
        </div>
      )}

      {!searchActive && recipes.length > 0 && !todaysPick && !isLoading && (
        <div className="mb-10">
          <CookbookEmptyState>
            Save a recipe reel with ingredients or steps and Recolekt will suggest one recipe to cook next.
          </CookbookEmptyState>
        </div>
      )}

      {!searchActive && continueCooking.length > 0 && (
        <div className="mb-10">
          <CookbookSection title="Continue cooking" subtitle="Active recipe sessions stay close to the top.">
            <HorizontalRecipeRow
              videos={continueCooking}
              emptyText="No active cooking sessions."
              reason={(video) => getCurrentStepLabel(video) || 'Session in progress'}
              plannedRecipeIds={plannedRecipeIds}
            />
          </CookbookSection>
        </div>
      )}

      {!searchActive && !shoppingLoading && plannedRecipes.length > 0 && (
        <div className="mb-10">
          <CookbookSection title="This Week's Cooking Plan" subtitle="Recipes already shaping your shopping list.">
            <HorizontalRecipeRow
              videos={plannedRecipes}
              emptyText=""
              reason={() => 'In shopping plan'}
              plannedRecipeIds={plannedRecipeIds}
            />
            <button
              type="button"
              onClick={() => navigate('/shopping-list')}
              className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-emerald-100 bg-white px-4 py-2 text-sm font-black text-emerald-800 shadow-sm transition-colors hover:bg-emerald-50"
            >
              <ShoppingBasket size={16} aria-hidden="true" />
              Shopping List
            </button>
          </CookbookSection>
        </div>
      )}

      <div className="mb-10 space-y-4 rounded-[26px] border border-amber-100 bg-white/55 p-4 shadow-sm md:p-5">
        <div className="relative">
          <input
            type="text"
            placeholder="Search by dish, ingredient, cuisine, method..."
            value={query}
            onChange={event => setQuery(event.target.value)}
            className="w-full rounded-2xl border border-amber-100 bg-white py-3.5 pl-10 pr-9 text-sm font-medium shadow-sm transition-all hover:bg-amber-50/30 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
              aria-label="Clear search"
            >
              <CircleX size={16} />
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {COOKBOOK_FILTERS.map(({ id, label, icon: Icon }) => {
            const active = activeFilter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setActiveFilter(id);
                  setShowAllRecipes(false);
                }}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-black transition-colors ${
                  active
                    ? 'bg-gray-950 text-white'
                    : 'border border-amber-100 bg-white text-amber-800 hover:bg-amber-50'
                }`}
              >
                {Icon && <Icon size={14} aria-hidden="true" />}
                {label}
                <span className={active ? 'text-white/70' : 'text-amber-700/55'}>{counts[id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {searchActive ? (
        <CookbookSection
          title={query.trim() ? 'Top matches' : showAllRecipes && activeFilter === 'all' ? 'Explore all recipes' : 'Search results'}
          subtitle={query.trim() ? `Ranked for "${query.trim()}"` : `${filteredRecipeResults.length} recipe${filteredRecipeResults.length === 1 ? '' : 's'}`}
        >
          {filteredRecipeResults.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-3 lg:grid-cols-4 md:gap-x-6 md:gap-y-9">
              {filteredRecipeResults.map((result) => (
                <RecipeDecisionCard
                  key={getVideoId(result.video)}
                  video={result.video}
                  searchLabels={query.trim() ? result.labels : []}
                  compact
                  fill
                  planned={plannedRecipeIds.has(getVideoId(result.video))}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[28px] border border-dashed border-amber-100 bg-white/60 py-16 text-center shadow-sm">
              <Search className="mx-auto mb-4 text-gray-400" size={24} />
              <h3 className="font-black text-gray-900">No recipes found</h3>
              <p className="mt-1 text-sm font-medium text-gray-500">Try a dish, ingredient, cuisine, or cooking method.</p>
            </div>
          )}
        </CookbookSection>
      ) : (
        <div className="space-y-12">
          {recipes.length === 0 && (
            <CookbookSection title="Start your cookbook" subtitle="Recipes you save will become a cooking memory here.">
              <CookbookEmptyState>
                Recipe reels appear here after saving. Once they have ingredients or steps, Recolekt will help you choose what to cook next.
              </CookbookEmptyState>
            </CookbookSection>
          )}

          {quickWins.length > 0 && (
            <CookbookSection title="Quick Wins" subtitle="Likely manageable on a normal weekday.">
              <HorizontalRecipeRow videos={quickWins} emptyText="No quick recipes found yet." reason={weekdayReason} plannedRecipeIds={plannedRecipeIds} />
            </CookbookSection>
          )}

          {cookedBefore.length > 0 && (
            <CookbookSection title="Cook Again" subtitle="Recipes you have already made and can revisit.">
              <HorizontalRecipeRow videos={cookedBefore} emptyText="Cooked recipes will appear here." reason={() => 'Cooked before'} plannedRecipeIds={plannedRecipeIds} />
            </CookbookSection>
          )}

          {neverCooked.length > 0 && (
            <CookbookSection title="Never Cooked" subtitle="Saved recipes that have not become part of your routine yet.">
              <HorizontalRecipeRow videos={neverCooked} emptyText="No never-cooked recipes right now." reason={() => 'Never cooked'} plannedRecipeIds={plannedRecipeIds} />
            </CookbookSection>
          )}

          {savedForLater.length > 0 && (
            <CookbookSection title="Saved for Later" subtitle="Recent and older saves waiting for the right cooking window.">
              <HorizontalRecipeRow
                videos={savedForLater}
                emptyText="Saved recipes waiting for a first cook will appear here."
                reason={(video) => isUntouchedSave(video) ? 'Saved for later' : 'Recently saved'}
                plannedRecipeIds={plannedRecipeIds}
              />
            </CookbookSection>
          )}

          {recipes.length > 0 && (
            <CookbookSection title="Explore All Recipes" subtitle="Browse the full cookbook shelf.">
              <button
                type="button"
                onClick={() => {
                  setActiveFilter('all');
                  setShowAllRecipes(true);
                }}
                className="rounded-2xl border border-amber-200 bg-white px-5 py-3 text-sm font-black text-amber-800 shadow-sm transition-colors hover:bg-amber-50"
              >
                Explore all recipes
              </button>
            </CookbookSection>
          )}
        </div>
      )}
    </div>
  );
};
