import { API_BASE } from "../utils/api";
// src/types.ts

import React from 'react';

// =========================
// Ingredient / Recipe types
// =========================

export interface IngredientItem {
  // Main name for display (what the UI shows as the ingredient text)
  item: string;
  // Optional alternate name used by backend
  name?: string;

  // Quantity as received from backend (string or number, optional)
  quantity?: string | number | null;

  // Unit (cup, g, tsp, etc.)
  unit?: string | null;

  // Optional emoji
  emoji?: string | null;

  // Optional note (e.g. "room temp", "not pie filling")
  note?: string | null;
}

export interface IngredientGroup {
  title: string;
  items: IngredientItem[];
}

/**
 * Single-language recipe, matches what backend returns for
 * recipe.english and recipe.original in your logs.
 */
export interface SingleLanguageRecipe {
  title?: string;
  servings?: string | null;
  prep_time?: string | null;
  cook_time?: string | null;
  total_time?: string | null;

  // Structured ingredients list (what RecipeComponents expects)
  ingredients?: IngredientItem[];

  // Optional grouped ingredients (e.g. "Base" vs "Frosting")
  ingredients_groups?: IngredientGroup[];

  instructions: string[];
  tips?: string[];
  notes?: string[];
}

/**
 * Bilingual recipe wrapper: backend sends { english, original, language_code }.
 */
export interface BilingualRecipe {
  english?: SingleLanguageRecipe;
  original?: SingleLanguageRecipe;
  language_code?: string;
}

// =========================
// Summary / Video types
// =========================

export interface SummaryBullet {
  headline: string;
  text: string;
  emoji?: string;
}

/**
 * Flexible summary payload – supports both legacy string summary
 * and structured english/original blocks from backend.
 */
export interface SummaryObject {
  // Legacy / simple fields
  title?: string | { english: string; original: string };
  category?: string;
  topic?: string;
  summary?: string;
  bullets?: SummaryBullet[];
  hashtags?: string[];
  emojis?: string[];

  // New backend shape used in viewModel.summary_text / summary
  english?: {
    title?: string;
    summary?: string;
    headlines?: SummaryBullet[];
    hashtags?: string[];
    emojis?: string[];
  };

  original?: {
    title?: string;
    summary?: string;
    headlines?: SummaryBullet[];
    hashtags?: string[];
    emojis?: string[];
  };
}

export type Platform = 'instagram' | 'youtube' | 'tiktok' | 'facebook';

export interface Video {
  id: string;
  title: string;
  author: string;
  platform: Platform;

  thumbnailUrl: string;
  duration: string;
  savedAt: string;

  category: string;
  subCategory?: string;
  topic?: string;

  tags: string[];

  // Summary may be plain string (legacy) or structured object
  summary: SummaryObject | string;

  // Bullets may be structured or simple strings
  bullets?: SummaryBullet[] | string[];

  // Transcript from backend (or undefined if missing)
  transcript?: string;

  // Where the reel comes from
  originalUrl: string;
  sourceUrl?: string;

  views?: string;

  // Persistence
  isFavorite: boolean;
  folderId: string;
  favoritedAt?: string;

  // Content typing from backend
  content_type?: string;

  // NEW: strongly-typed bilingual recipe instead of `any`
  recipe?: BilingualRecipe | null;

  workout?: any;

  // Backend status + raw payload
  status?: string;
  __raw?: any;
}

// =========================
// Folder / Navigation types
// =========================

export interface Folder {
  id: string;
  name: string;
  itemCount?: number;
  coverUrl?: string;
  subFolders?: Folder[];
  parentId?: string | null;
}

export interface NavigationItem {
  label: string;
  path: string;
  icon: React.ElementType;
}
