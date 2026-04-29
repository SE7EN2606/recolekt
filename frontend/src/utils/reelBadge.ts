// src/utils/reelBadge.ts
import {
  Trophy,
  Star,
  Wrench,
  ChefHat,
  Dumbbell,
  MapPin,
  Landmark,
  LucideIcon,
} from "lucide-react";

export type BadgeVariant =
  | "ranking"
  | "picks"
  | "products"
  | "software"
  | "finance"
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
  picks: "bg-violet-50/90 text-violet-700 border-violet-200/80",
  products: "bg-violet-50/90 text-violet-700 border-violet-200/80",
  software: "bg-primary-50/90 text-primary-700 border-primary-200/80",
  finance: "bg-amber-50/90 text-amber-700 border-amber-200/80",
  recipe: "bg-orange-50/90 text-orange-700 border-orange-200/80",
  workout: "bg-emerald-50/90 text-emerald-700 border-emerald-200/80",
  places: "bg-teal-50/90 text-teal-700 border-teal-200/80",
};

export interface ReelBadgeInput {
  content_type?: string | null;
  tools_list?: {
    list_subtype?: string | null;
    is_ranked?: boolean | null;
  } | null;
  is_list?: boolean | null;
  list_type?: string | null;
  list_count?: number | null;
  recipe?: unknown | null;
  workout?: unknown | null;
  location?: unknown | null;
}

export function getReelBadge(reel: ReelBadgeInput): ReelBadge | null {
  const contentType = String(reel.content_type || "").toLowerCase();

  if (contentType === "location" || contentType === "places" || reel.location) {
    return {
      label: "Places",
      icon: MapPin,
      variant: "places",
      className: BADGE_STYLES.places,
    };
  }

  if (reel.tools_list) {
    const subtype = String(reel.tools_list.list_subtype ?? "").toLowerCase();

    if (subtype === "ranking" || reel.tools_list.is_ranked) {
      return {
        label: "Ranking",
        icon: Trophy,
        variant: "ranking",
        className: BADGE_STYLES.ranking,
      };
    }

    if (subtype === "picks" || subtype === "recommendation" || subtype === "places") {
      return {
        label: "Picks",
        icon: Star,
        variant: "picks",
        className: BADGE_STYLES.picks,
      };
    }

    if (contentType === "software") {
      return {
        label: "Software",
        icon: Wrench,
        variant: "software",
        className: BADGE_STYLES.software,
      };
    }

    if (contentType === "finance") {
      return {
        label: "Finance",
        icon: Landmark,
        variant: "finance",
        className: BADGE_STYLES.finance,
      };
    }

    return {
      label: "Products",
      icon: Star,
      variant: "products",
      className: BADGE_STYLES.products,
    };
  }

  if (reel.is_list) {
    return {
      label: "Ranking",
      icon: Trophy,
      variant: "ranking",
      className: BADGE_STYLES.ranking,
    };
  }

  if (contentType === "software") {
    return {
      label: "Software",
      icon: Wrench,
      variant: "software",
      className: BADGE_STYLES.software,
    };
  }

  if (contentType === "finance") {
    return {
      label: "Finance",
      icon: Landmark,
      variant: "finance",
      className: BADGE_STYLES.finance,
    };
  }

  if (contentType === "products") {
    return {
      label: "Products",
      icon: Star,
      variant: "products",
      className: BADGE_STYLES.products,
    };
  }

  if (contentType === "recipe" || reel.recipe) {
    return { 
      label: "Recipe", 
      icon: ChefHat, 
      variant: "recipe", 
      className: BADGE_STYLES.recipe };
  }

  if (contentType === "workout" || reel.workout) {
    return { label: "Workout", 
      icon: Dumbbell, 
      variant: "workout", 
      className: BADGE_STYLES.workout };
  }

  return null;
}