import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChefHat, CircleX, Clock3, Flame, Search, StickyNote } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
  detectRecipeTechniques,
  estimateRecipeTimeMinutes,
  getRecipeCuisineLabel,
  getRecipeIngredientCount,
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

type CookbookFilter = 'all' | 'cooked' | 'notes' | 'cooking';

const COOKBOOK_FILTERS: Array<{
  id: CookbookFilter;
  label: string;
  icon?: React.ElementType;
}> = [
  { id: 'all', label: 'Explore All', icon: ChefHat },
  { id: 'cooked', label: 'Cooked', icon: ChefHat },
  { id: 'notes', label: 'With Notes', icon: StickyNote },
  { id: 'cooking', label: 'Currently Cooking', icon: Clock3 },
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

function sortByProjectFit(a: any, b: any) {
  const aScore = (estimateRecipeTimeMinutes(a) ?? 0) + getRecipeIngredientCount(a) * 6 + getRecipeStepCount(a) * 10;
  const bScore = (estimateRecipeTimeMinutes(b) ?? 0) + getRecipeIngredientCount(b) * 6 + getRecipeStepCount(b) * 10;
  return bScore - aScore || sortBySavedAtDesc(a, b);
}

function savedWithinDays(video: any, days: number, now = new Date()): boolean {
  const rawDate = video?.savedAt ?? video?.saved_at ?? video?.createdAt ?? video?.created_at;
  const savedAt = rawDate ? new Date(rawDate).getTime() : 0;
  return Number.isFinite(savedAt) && savedAt > 0 && now.getTime() - savedAt <= days * 86400000;
}

function weekdayReason(video: any): string {
  const cookTime = formatCookTime(video);
  if (cookTime) return cookTime;
  const ingredientCount = getRecipeIngredientCount(video);
  if (ingredientCount > 0) return `${ingredientCount} ingredients`;
  return 'Weeknight fit';
}

function projectReason(video: any): string {
  const cookTime = formatCookTime(video);
  if (cookTime) return cookTime;
  const stepCount = getRecipeStepCount(video);
  if (stepCount > 0) return `${stepCount} steps`;
  const ingredientCount = getRecipeIngredientCount(video);
  if (ingredientCount > 0) return `${ingredientCount} ingredients`;
  return 'Project';
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
  featured?: boolean;
}> = ({ video, reason, searchLabels = [], compact = false, fill = false, featured = false }) => {
  const navigate = useNavigate();
  const title = getRecipeTitle(video);
  const thumbnailUrl = getThumbnailUrl(video);
  const cookTime = formatCookTime(video);
  const cuisine = getRecipeCuisineLabel(video);
  const technique = detectRecipeTechniques(video)[0];
  const bucket = timeBucketLabel(getRecipeTimeBucket(video));
  const state = getRecipeUserState(video);

  return (
    <button
      type="button"
      onClick={() => navigate(`/video/${getVideoId(video)}`, { state: { from: 'cookbook' } })}
      className={`group text-left ${
        featured
          ? 'grid w-full gap-4 rounded-[28px] bg-white p-3 shadow-sm ring-1 ring-amber-100 transition-shadow hover:shadow-md md:grid-cols-[minmax(220px,0.72fr)_1fr] md:items-center md:gap-6 md:p-4'
          : fill
            ? 'w-full'
            : `shrink-0 ${compact ? 'w-[172px] md:w-[196px]' : 'w-[236px] md:w-[276px]'}`
      }`}
    >
      <div className={`relative overflow-hidden bg-slate-900 shadow-sm transition-shadow group-hover:shadow-md ${
        featured ? 'aspect-[4/5] rounded-[24px] md:aspect-[5/4]' : 'aspect-[4/5] rounded-2xl'
      }`}>
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
      <div className={featured ? 'min-w-0 space-y-3 md:pr-2' : 'pt-2'}>
        {reason && (
          <p className={`font-black uppercase tracking-widest text-emerald-700 ${featured ? 'text-[11px]' : 'mb-1 text-[10px]'}`}>
            {reason}
          </p>
        )}
        <p className={`${featured ? 'text-xl md:text-2xl' : 'line-clamp-2 text-sm'} font-black leading-snug text-gray-950`}>
          {title}
        </p>
        {featured && (
          <p className="max-w-xl text-sm font-medium leading-relaxed text-gray-500">
            A good candidate to open next, based on your cookbook activity and the recipe details Recolekt already has.
          </p>
        )}
        <div className={`${featured ? 'mt-3' : 'mt-1.5'} flex flex-wrap gap-1.5`}>
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
          {searchLabels.length === 0 && technique && !featured && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-100">
              {technique}
            </span>
          )}
        </div>
        {featured && (
          <span className="inline-flex rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow-sm transition-colors group-hover:bg-emerald-700">
            Open recipe
          </span>
        )}
      </div>
    </button>
  );
};

const HorizontalRecipeRow: React.FC<{
  videos: any[];
  emptyText: string;
  reason?: (video: any) => string;
}> = ({ videos, emptyText, reason }) => {
  if (videos.length === 0) {
    return <CookbookEmptyState>{emptyText}</CookbookEmptyState>;
  }

  return (
    <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
      {videos.slice(0, 10).map((video) => (
        <RecipeDecisionCard key={getVideoId(video)} video={video} reason={reason?.(video)} compact />
      ))}
    </div>
  );
};

export const Cookbook: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { videos, isLoading } = useData();
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
        const bucket = getRecipeTimeBucket(video);
        const ingredientCount = getRecipeIngredientCount(video);
        const stepCount = getRecipeStepCount(video);
        return (
          bucket === RECIPE_TIME_BUCKETS.QUICK_MEAL ||
          (bucket === RECIPE_TIME_BUCKETS.WEEKNIGHT && (ingredientCount === 0 || ingredientCount <= 10) && (stepCount === 0 || stepCount <= 6)) ||
          (!estimateRecipeTimeMinutes(video) && ingredientCount > 0 && ingredientCount <= 8 && stepCount > 0 && stepCount <= 5)
        );
      })
      .sort(sortByWeekdayFit),
    [primaryRecommendationIds, recipes]
  );

  const weekendProjects = useMemo(
    () => recipes
      .filter((video: any) => {
        const id = getVideoId(video);
        if (primaryRecommendationIds.has(id)) return false;
        if (quickWins.some((quickVideo: any) => getVideoId(quickVideo) === id)) return false;
        if (getRecipeUserState(video).hasActiveSession) return false;
        const bucket = getRecipeTimeBucket(video);
        return (
          bucket === RECIPE_TIME_BUCKETS.SLOW_MEAL ||
          bucket === RECIPE_TIME_BUCKETS.PROJECT_MEAL ||
          getRecipeIngredientCount(video) >= 12 ||
          getRecipeStepCount(video) >= 8
        );
      })
      .sort(sortByProjectFit),
    [primaryRecommendationIds, quickWins, recipes]
  );

  const primarySectionIds = useMemo(() => {
    const ids = new Set(primaryRecommendationIds);
    quickWins.slice(0, 10).forEach((video: any) => ids.add(getVideoId(video)));
    weekendProjects.slice(0, 10).forEach((video: any) => ids.add(getVideoId(video)));
    return ids;
  }, [primaryRecommendationIds, quickWins, weekendProjects]);

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
  const recipesWithNotes = useMemo(() => recipes.filter((video: any) => getRecipeUserState(video).hasNote), [recipes]);
  const currentlyCooking = useMemo(() => recipes.filter((video: any) => getRecipeUserState(video).hasActiveSession), [recipes]);

  const counts: Record<CookbookFilter, number> = {
    all: recipes.length,
    cooked: cookedRecipes.length,
    notes: recipesWithNotes.length,
    cooking: currentlyCooking.length,
  };

  const filteredRecipeResults = useMemo<CookbookSearchResult[]>(() => {
    const byFilter = recipes.filter((video: any) => {
      const state = getRecipeUserState(video);
      if (activeFilter === 'cooked') return state.cookCount > 0;
      if (activeFilter === 'notes') return state.hasNote;
      if (activeFilter === 'cooking') return state.hasActiveSession;
      return true;
    });

    if (query.trim()) return searchCookbookRecipes(byFilter, query);
    return byFilter.map((video: any) => ({ video, score: 1, labels: [] }));
  }, [activeFilter, query, recipes]);

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
      <div className="mb-10 space-y-5 rounded-[28px] border border-amber-100 bg-white/55 p-4 shadow-sm md:p-5">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-700">Cookbook</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-gray-950 md:text-3xl">What should I cook?</h1>
          <p className="mt-1 text-sm font-medium text-gray-500">Your cooking plan, saved recipes, and repeat favorites in one place.</p>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Search recipes, ingredients, cuisine, or method"
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
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[28px] border border-dashed border-amber-100 bg-white/60 py-16 text-center shadow-sm">
              <Search className="mx-auto mb-4 text-gray-400" size={24} />
              <h3 className="font-black text-gray-900">No recipes found</h3>
              <p className="mt-1 text-sm font-medium text-gray-500">Try a different search or filter.</p>
            </div>
          )}
        </CookbookSection>
      ) : (
        <div className="space-y-12">
          {recipes.length === 0 && (
            <CookbookSection title="Start your cookbook" subtitle="Recipes you save will become a cooking memory here.">
              <CookbookEmptyState>
                Save a recipe from the gallery first. Once it has usable recipe details, Recolekt will organize it into quick ideas, projects, and recipes to revisit.
              </CookbookEmptyState>
            </CookbookSection>
          )}

          {continueCooking.length > 0 && (
            <CookbookSection title="Continue Cooking" subtitle="Pick up active recipe sessions">
              <HorizontalRecipeRow videos={continueCooking} emptyText="No active cooking sessions." reason={() => 'In progress'} />
            </CookbookSection>
          )}

          {todaysPick && (
            <CookbookSection title="Today's Pick" subtitle="One recipe worth considering now">
              <div className="rounded-[32px] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-emerald-50/50 p-3 shadow-sm md:p-4">
                <div className="mb-3 flex items-center gap-2 px-1 text-[11px] font-black uppercase tracking-widest text-amber-700">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <Flame size={14} aria-hidden="true" />
                  </span>
                  {todaysPick.reason}
                </div>
                <RecipeDecisionCard video={todaysPick.video} reason={todaysPick.reason} featured />
              </div>
            </CookbookSection>
          )}

          {quickWins.length > 0 && (
            <CookbookSection title="Quick Wins" subtitle="Likely manageable on a normal weekday.">
              <HorizontalRecipeRow videos={quickWins} emptyText="No quick recipes found yet." reason={weekdayReason} />
            </CookbookSection>
          )}

          {weekendProjects.length > 0 && (
            <CookbookSection title="Weekend Projects" subtitle="Longer recipes with more steps or ingredients.">
              <HorizontalRecipeRow videos={weekendProjects} emptyText="No weekend projects found yet." reason={projectReason} />
            </CookbookSection>
          )}

          {neverCooked.length > 0 && (
            <CookbookSection title="Never Cooked" subtitle="Saved recipes that have not become part of your routine yet.">
              <HorizontalRecipeRow videos={neverCooked} emptyText="No never-cooked recipes right now." reason={() => 'Never cooked'} />
            </CookbookSection>
          )}

          {cookedBefore.length > 0 && (
            <CookbookSection title="Cooked Before" subtitle="Recipes you have already made.">
              <HorizontalRecipeRow videos={cookedBefore} emptyText="Cooked recipes will appear here." reason={() => 'Cooked before'} />
            </CookbookSection>
          )}

          {recentlySaved.length > 0 && (
            <CookbookSection title="Recently Saved" subtitle="Newer saves waiting for a first cook.">
              <HorizontalRecipeRow videos={recentlySaved} emptyText="Recently saved recipes will appear here." reason={() => 'Recently saved'} />
            </CookbookSection>
          )}

          {untouchedSaves.length > 0 && (
            <CookbookSection title="Saved for Later" subtitle="Older saves that still have useful recipe details.">
              <HorizontalRecipeRow videos={untouchedSaves} emptyText="No older untouched saves right now." reason={() => 'Saved for later'} />
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
