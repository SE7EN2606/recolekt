import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChefHat, Clock3, Search, StickyNote, CircleX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { VideoCard } from '../components/VideoCard';

type CookbookFilter = 'all' | 'cooked' | 'notes' | 'cooking';

const COOKBOOK_FILTERS: Array<{
  id: CookbookFilter;
  label: string;
  icon?: React.ElementType;
}> = [
  { id: 'all', label: 'All Recipes', icon: ChefHat },
  { id: 'cooked', label: 'Cooked', icon: ChefHat },
  { id: 'notes', label: 'With Notes', icon: StickyNote },
  { id: 'cooking', label: 'Currently Cooking', icon: Clock3 },
];

function getVideoId(video: any): string {
  return String(video?.id ?? video?.process_id ?? video?.processId ?? '');
}

function parseObject(value: unknown): any {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return typeof value === 'object' ? value : {};
}

function getVideoContentType(video: any): string {
  return String(
    video?.content_type ??
    video?.contentType ??
    video?.contenttype ??
    video?.raw?.content_type ??
    video?.__raw?.content_type ??
    ''
  ).toLowerCase();
}

function getRecipeUserState(video: any) {
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

function getRecipeTitle(video: any): string {
  const summary = parseObject(video?.summary ?? video?.summarytext ?? video?.raw?.summary);
  const recipeRoot = parseObject(video?.recipe ?? video?.raw?.recipe);
  const recipe = recipeRoot?.recipe ?? recipeRoot;

  return String(
    summary?.english?.title ??
    recipe?.english?.title ??
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

function getRecipeSearchScore(video: any, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;

  const summary = parseObject(video?.summary ?? video?.summarytext ?? video?.raw?.summary);
  const recipeRoot = parseObject(video?.recipe ?? video?.raw?.recipe);
  const recipe = recipeRoot?.recipe ?? recipeRoot;
  const title = getRecipeTitle(video).toLowerCase();
  const ingredients = collectStrings(recipe?.ingredients ?? recipe?.ingredientLines ?? recipe?.ingredient_lines ?? recipeRoot?.ingredients).toLowerCase();
  const topic = String(video?.summary_topic ?? video?.summaryTopic ?? summary?.topic ?? summary?.theme ?? '').toLowerCase();
  const caption = String(video?.caption ?? video?.raw?.caption ?? '').toLowerCase();

  let score = 0;
  if (title.includes(q)) score += 40;
  if (ingredients.includes(q)) score += 30;
  if (topic.includes(q)) score += 20;
  if (caption.includes(q)) score += 10;
  return score;
}

function matchesFilter(video: any, filter: CookbookFilter): boolean {
  const state = getRecipeUserState(video);
  if (filter === 'cooked') return state.cookCount > 0;
  if (filter === 'notes') return state.hasNote;
  if (filter === 'cooking') return state.hasActiveSession;
  return true;
}

function formatLastCookedLabel(video: any): string {
  const rawDate = getRecipeUserState(video).lastCookedAt;
  const date = rawDate ? new Date(rawDate) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Recently cooked';

  const now = new Date();
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayDiff = Math.round((today - dateDay) / 86400000);

  if (dayDiff === 0) return 'Cooked today';
  if (dayDiff === 1) return 'Cooked yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const CookbookSection: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, children }) => (
  <section className="space-y-3">
    <div>
      <h2 className="text-base font-black text-gray-950">{title}</h2>
      {subtitle && <p className="text-xs font-medium text-gray-500">{subtitle}</p>}
    </div>
    {children}
  </section>
);

const CookbookGrid: React.FC<{ videos: any[] }> = ({ videos }) => (
  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 md:gap-6">
    {videos.map((video: any) => (
      <VideoCard key={getVideoId(video)} video={video} variant="cookbook" />
    ))}
  </div>
);

const CookbookRailList: React.FC<{
  videos: any[];
  getLabel: (video: any) => string;
  emptyText: string;
}> = ({ videos, getLabel, emptyText }) => {
  const navigate = useNavigate();

  if (videos.length === 0) {
    return <p className="rounded-2xl bg-white/60 p-4 text-sm font-medium text-gray-500">{emptyText}</p>;
  }

  return (
    <div className="grid gap-2">
      {videos.slice(0, 5).map((video: any) => (
        <button
          key={getVideoId(video)}
          type="button"
          onClick={() => navigate(`/video/${getVideoId(video)}`)}
          className="rounded-2xl bg-white/70 p-3 text-left ring-1 ring-gray-100 transition-colors hover:bg-white"
        >
          <span className="text-[10px] font-black text-emerald-700">{getLabel(video)}</span>
          <p className="mt-1 line-clamp-2 text-sm font-black text-gray-950">{getRecipeTitle(video)}</p>
        </button>
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

  React.useEffect(() => {
    if (!loading && !user) navigate('/auth', { replace: true });
  }, [loading, user, navigate]);

  const recipes = useMemo(() => {
    return (videos || []).filter((video: any) => getVideoContentType(video) === 'recipe');
  }, [videos]);

  const continueCooking = useMemo(() => {
    return recipes.filter((video: any) => getRecipeUserState(video).hasActiveSession);
  }, [recipes]);

  const recentlyCooked = useMemo(() => {
    return recipes
      .filter((video: any) => Boolean(getRecipeUserState(video).lastCookedAt))
      .sort((a: any, b: any) => {
        const aTime = new Date(getRecipeUserState(a).lastCookedAt || 0).getTime();
        const bTime = new Date(getRecipeUserState(b).lastCookedAt || 0).getTime();
        return bTime - aTime;
      });
  }, [recipes]);

  const filteredRecipes = useMemo(() => {
    const q = query.trim();
    return recipes
      .filter((video: any) => matchesFilter(video, activeFilter))
      .filter((video: any) => !q || getRecipeSearchScore(video, q) > 0)
      .sort((a: any, b: any) => {
        if (q) {
          const scoreDiff = getRecipeSearchScore(b, q) - getRecipeSearchScore(a, q);
          if (scoreDiff !== 0) return scoreDiff;
        }
        const aTime = new Date(a.savedAt || a.created_at || 0).getTime();
        const bTime = new Date(b.savedAt || b.created_at || 0).getTime();
        return bTime - aTime;
      });
  }, [recipes, activeFilter, query]);

  const cookedRecipes = useMemo(() => recipes.filter((video: any) => getRecipeUserState(video).cookCount > 0), [recipes]);
  const recipesWithNotes = useMemo(() => recipes.filter((video: any) => getRecipeUserState(video).hasNote), [recipes]);
  const currentlyCooking = useMemo(() => recipes.filter((video: any) => getRecipeUserState(video).hasActiveSession), [recipes]);

  const counts: Record<CookbookFilter, number> = {
    all: recipes.length,
    cooked: cookedRecipes.length,
    notes: recipesWithNotes.length,
    cooking: currentlyCooking.length,
  };

  if (loading || (isLoading && videos.length === 0)) {
    return (
      <div className="w-full animate-pulse pt-4 md:pt-0">
        <div className="mb-2 h-8 w-48 rounded-lg bg-gray-200" />
        <div className="mb-8 h-4 w-64 rounded-lg bg-gray-100" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
          {Array.from({ length: 8 }).map((_, index) => <div key={index} className="aspect-9/16 rounded-2xl bg-gray-200/60" />)}
        </div>
      </div>
    );
  }

  if (!user) return null;

  const showHomeSections = !query.trim() && activeFilter === 'all';

  return (
    <div className="w-full animate-fade-in pb-24 pt-4 md:pb-12 md:pt-0">
      <div className="mb-8 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 md:text-2xl">Cookbook</h1>
          <p className="mt-0.5 text-xs text-gray-500 md:text-sm">Find recipes you can cook, remember, and reuse.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search recipes, ingredients, or notes"
              value={query}
              onChange={event => setQuery(event.target.value)}
              className="w-full rounded-xl border border-white/40 bg-white/60 py-3 pl-10 pr-9 text-sm shadow-sm backdrop-blur-sm transition-all hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {COOKBOOK_FILTERS.map(({ id, label, icon: Icon }) => {
            const active = activeFilter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveFilter(id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-black transition-colors ${
                  active
                    ? 'bg-amber-600 text-white'
                    : 'border border-amber-100 bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                {Icon && <Icon size={14} aria-hidden="true" />}
                {label}
                <span className={active ? 'text-white/75' : 'text-amber-700/60'}>{counts[id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {showHomeSections && (
        <div className="mb-10 grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
          <aside className="space-y-7 lg:sticky lg:top-24">
            <CookbookSection title="Continue Cooking" subtitle="Pick up active recipe sessions">
              <CookbookRailList videos={continueCooking} getLabel={() => 'In progress'} emptyText="No active cooking sessions." />
            </CookbookSection>
            <CookbookSection title="Recently Cooked" subtitle="Recipes you have made most recently">
              <CookbookRailList videos={recentlyCooked} getLabel={formatLastCookedLabel} emptyText="Cooked recipes will appear here." />
            </CookbookSection>
          </aside>
          <main className="space-y-9">
            {currentlyCooking.length > 0 && (
              <CookbookSection title="Currently Cooking" subtitle="Active cook sessions">
                <CookbookGrid videos={currentlyCooking} />
              </CookbookSection>
            )}
            <CookbookSection title="All Recipes" subtitle="Your complete cookbook">
              <CookbookGrid videos={recipes} />
            </CookbookSection>
            {cookedRecipes.length > 0 && (
              <CookbookSection title="Cooked" subtitle="Recipes you have made at least once">
                <CookbookGrid videos={cookedRecipes} />
              </CookbookSection>
            )}
            {recipesWithNotes.length > 0 && (
              <CookbookSection title="With Notes" subtitle="Recipes with personal notes">
                <CookbookGrid videos={recipesWithNotes} />
              </CookbookSection>
            )}
          </main>
        </div>
      )}

      {!showHomeSections && (
        <CookbookSection title={COOKBOOK_FILTERS.find(filter => filter.id === activeFilter)?.label || 'Recipes'} subtitle={`${filteredRecipes.length} recipe${filteredRecipes.length === 1 ? '' : 's'}`}>
          {filteredRecipes.length > 0 ? <CookbookGrid videos={filteredRecipes} /> : (
            <div className="py-20 text-center">
              <Search className="mx-auto mb-4 text-gray-400" size={24} />
              <h3 className="font-medium text-gray-900">No recipes found</h3>
              <p className="mt-1 text-sm text-gray-500">Try a different search or filter.</p>
            </div>
          )}
        </CookbookSection>
      )}
    </div>
  );
};
