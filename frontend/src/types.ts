// src/types.ts
import React from "react";

export interface IngredientItem {
  item: string;
  name?: string;
  quantity?: string | number | null;
  unit?: string | null;
  emoji?: string | null;
  note?: string | null;
}

export interface IngredientGroup {
  title: string;
  items: IngredientItem[];
}

export interface SingleLanguageRecipe {
  title?: string;
  servings?: string | null;
  prep_time?: string | null;
  cook_time?: string | null;
  total_time?: string | null;
  ingredients?: IngredientItem[];
  ingredients_groups?: IngredientGroup[];
  instructions: string[];
  tips?: string[];
  notes?: string[];
}

export interface BilingualRecipe {
  english?: SingleLanguageRecipe;
  original?: SingleLanguageRecipe;
  language_code?: string;
}

export interface SummaryBullet {
  headline: string;
  text: string;
  emoji?: string;
}

export interface SummaryLanguageBlock {
  title?: string;
  summary?: string;
  headlines?: SummaryBullet[];
  hashtags?: string[];
  emojis?: string[];
}

export interface SummaryObject {
  title?: string | { english: string; original: string };
  category?: string;
  topic?: string;
  summary?: string;
  bullets?: SummaryBullet[];
  headlines?: SummaryBullet[];
  hashtags?: string[];
  emojis?: string[];
  english?: SummaryLanguageBlock;
  original?: SummaryLanguageBlock;
}

export type Platform = "instagram" | "youtube" | "tiktok" | "facebook";

export type ContentType =
  | "recipe"
  | "workout"
  | "location"
  | "products"
  | "software"
  | "finance"
  | "general";

export interface WorkoutExercise {
  info?: string;
  name: string;
}

export interface WorkoutGroup {
  title: string;
  items: WorkoutExercise[];
}

export interface Workout {
  duration: string;
  format: string;
  level: string;
  equipment: string[];
  groups: WorkoutGroup[];
  tips?: string[];
}

export interface ToolsListCategoryItem {
  name?: string;
  description?: string;
  url?: string;
  rank?: number;
  tier?: string;
  [key: string]: unknown;
}

export interface ToolsListCategory {
  name?: string;
  items?: ToolsListCategoryItem[];
  [key: string]: unknown;
}

export interface ToolsListLanguageBlock {
  categories?: ToolsListCategory[];
  [key: string]: unknown;
}

export interface ToolsList {
  list_subtype?: string | null;
  is_ranked?: boolean | null;
  categories?: ToolsListCategory[];
  en?: ToolsListLanguageBlock;
  english?: ToolsListLanguageBlock;
  original?: ToolsListLanguageBlock;
  [key: string]: unknown;
}

export interface LocationPlace {
  id?: string;
  name?: string;
  type?: string;
  city?: string;
  region?: string;
  country?: string;
  address?: string;
  neighborhood?: string;
  description?: string;
  instagram?: string;
  emoji?: string;
  rank?: number;
  lat?: number | null;
  lng?: number | null;
  _vid?: string;
  _idx?: number;
  [key: string]: unknown;
}

export interface GcsUrls {
  video?: string | null;
  thumbnail?: string | null;
  preview_thumbnail?: string | null;
  caption_json?: string | null;
  transcription?: string | null;
  result_json?: string | null;
  [key: string]: unknown;
}

export interface TranscriptionData {
  transcript?: string;
  detected_language?: string;
  transcription_source?: string;
  status?: string;
  [key: string]: unknown;
}

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
  summary: SummaryObject | string;
  bullets?: SummaryBullet[] | string[];
  transcript?: string;
  transcription?: TranscriptionData | null;
  originalUrl: string;
  sourceUrl?: string;
  views?: string;
  isFavorite: boolean;
  folderId: string;
  favoritedAt?: string;
  content_type?: ContentType | string;
  recipe?: BilingualRecipe | null;
  workout?: Workout | null;
  tools_list?: ToolsList | null;
  location?: LocationPlace[] | Record<string, unknown> | null;
  gcs_urls?: GcsUrls;
  status?: string;
  errorMessage?: string | null;
  __raw?: any;
}

export interface Folder {
  isSystem?: boolean;
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