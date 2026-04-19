// src/utils/reelBadge.ts

import {
  Trophy,
  Star,
  Wrench,
  ChefHat,
  Dumbbell,
  MapPin,
  LucideIcon,
} from "lucide-react";

export type BadgeVariant =
  | "ranking"
  | "picks"
  | "tools"
  | "recipe"
  | "workout"
  | "places"
  | null;

export interface ReelBadge {
  label: string;
  icon: LucideIcon;
  variant: BadgeVariant;
  className: string;
}

const BADGE_STYLES: Record<NonNullable<BadgeVariant>, string> = {
  ranking: "bg-amber-50/90 text-amber-700 border-amber-200/80",
  picks:   "bg-violet-50/90 text-violet-700 border-violet-200/80",
  tools:   "bg-primary-50/90 text-primary-700 border-primary-200/80",
  recipe:  "bg-orange-50/90 text-orange-700 border-orange-200/80",
  workout: "bg-emerald-50/90 text-emerald-700 border-emerald-200/80",
  places:  "bg-teal-50/90 text-teal-700 border-teal-200/80",
};

export interface ReelBadgeInput {
  content_type?: string | null;
  // Full object — present on reel detail page
  tools_list?: {
    list_subtype?: string | null;
    is_ranked?: boolean | null;
  } | null;
  // Flat DB fields — present on gallery list response
  is_list?: boolean | null;
  list_type?: string | null;   // "albums", "movies", "places", etc.
  list_count?: number | null;
  // Structured content
  recipe?: unknown | null;
  workout?: unknown | null;
  location?: unknown | null;
}

/**
 * Single source of truth for reel badges.
 * Works whether tools_list is fully loaded (reel page)
 * or only flat DB fields are available (gallery card).
 *
 * Priority:
 *   tools_list.list_subtype → is_list (flat) → content_type → recipe/workout/location → null
 */
export function getReelBadge(reel: ReelBadgeInput): ReelBadge | null {
  // ── 1. tools_list present (reel detail page) ─────────────────────────────
  if (reel.tools_list) {
    const subtype = (reel.tools_list.list_subtype ?? "").toLowerCase();

    if (subtype === "ranking" || reel.tools_list.is_ranked) {
      return { label: "Ranking", icon: Trophy, variant: "ranking", className: BADGE_STYLES.ranking };
    }
    if (subtype === "picks" || subtype === "recommendation") {
      return { label: "Picks", icon: Star, variant: "picks", className: BADGE_STYLES.picks };
    }
    // software / apps / generic categorized list
    return { label: "Tools", icon: Wrench, variant: "tools", className: BADGE_STYLES.tools };
  }

  // ── 2. Flat DB fields fallback (gallery — tools_list not loaded) ──────────
  if (reel.is_list) {
    // is_list=true is only set for ranking/picks subtypes in assembly,
    // so this is always a ranked or curated list — show Ranking badge.
    return { label: "Ranking", icon: Trophy, variant: "ranking", className: BADGE_STYLES.ranking };
  }

  // Generic tools list (tools_list existed but is_list=false — e.g. software/apps)
  if (reel.content_type === "tools") {
    return { label: "Tools", icon: Wrench, variant: "tools", className: BADGE_STYLES.tools };
  }

  // ── 3. Structured content types ───────────────────────────────────────────
  if (reel.recipe) {
    return { label: "Recipe", icon: ChefHat, variant: "recipe", className: BADGE_STYLES.recipe };
  }
  if (reel.workout) {
    return { label: "Workout", icon: Dumbbell, variant: "workout", className: BADGE_STYLES.workout };
  }
  if (reel.location) {
    return { label: "Places", icon: MapPin, variant: "places", className: BADGE_STYLES.places };
  }

  return null;
}