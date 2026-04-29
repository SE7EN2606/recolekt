// src/components/ContentTypeBadge.tsx
import React from 'react';
import {
  ChefHat,
  Dumbbell,
  MapPin,
  Wrench,
  Sparkles,
  Backpack,
  UtensilsCrossed,
  Trophy,
  Heart,
  Layers3,
  Landmark,
} from 'lucide-react';

export type ContentType =
  | 'recipe'
  | 'products'
  | 'software'
  | 'finance'
  | 'workout'
  | 'location'
  | 'general';

export type ToolsSubtype =
  | 'software'
  | 'lifestyle'
  | 'gear'
  | 'food'
  | 'ranking'
  | 'tier'
  | 'verdict'
  | 'grouped'
  | 'picks';

export const safeStr = (v: any): string => {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return String(v);
};

const LIFESTYLE_SIGNALS = new Set([
  'fragrance', 'perfume', 'scent', 'cologne', 'parfum', 'eau de', 'skincare', 'beauty',
  'makeup', 'cosmetic', 'serum', 'moisturizer', 'foundation', 'lipstick', 'mascara',
  'cream', 'lotion', 'fashion', 'shirt', 'jacket', 'coat', 'suit', 'jeans',
  'sneaker', 'shoe', 'watch', 'jewel', 'jewelry', 'handbag', 'purse', 'luxury',
  'marque', 'vetement', 'vêtement', 'montre', 'sac',
]);

const GEAR_SIGNALS = new Set([
  'ski', 'snowboard', 'surf', 'skate', 'bike', 'cycling', 'hiking', 'climbing', 'running',
  'golf', 'tennis', 'yoga', 'crossfit', 'camera', 'lens', 'drone', 'microphone',
  'headphone', 'speaker', 'keyboard', 'mouse', 'monitor', 'laptop', 'phone', 'tablet',
  'gear', 'equipment', 'kit', 'setup', 'rig', 'matériel', 'supplement', 'protein',
  'vitamin', 'creatine',
]);

const FOOD_SIGNALS = new Set([
  'wine', 'whisky', 'whiskey', 'bourbon', 'beer', 'cocktail', 'coffee', 'tea',
  'restaurant', 'food', 'dish', 'cuisine', 'chef', 'vin', 'bière', 'café', 'boisson',
]);

const SOFTWARE_SIGNALS = new Set([
  'app', 'website', 'tool', 'platform', 'software', 'extension', 'plugin', 'api', 'saas',
  'dashboard', 'chrome', 'browser', 'ai', 'gpt', 'llm', 'bot', 'automation', 'workflow',
  'integration', 'notion', 'figma', 'slack', 'github', 'vercel', 'supabase',
  'outils', 'logiciel', 'application', 'site web', 'site',
]);

export function resolveContentType(rawContentType: string): ContentType {
  const ct = safeStr(rawContentType).toLowerCase();

  if (ct === 'recipe') return 'recipe';
  if (ct === 'workout') return 'workout';
  if (ct === 'location' || ct === 'places') return 'location';
  if (ct === 'software') return 'software';
  if (ct === 'finance') return 'finance';
  if (ct === 'products' || ct === 'tools') return 'products';

  return 'general';
}

export function deriveToolsSubtype(toolsList: any): ToolsSubtype {
  if (!toolsList) return 'picks';

  const stored = safeStr(
    toolsList?.list_subtype ?? toolsList?.listSubtype,
  ).toLowerCase() as ToolsSubtype;

  if (
    [
      'software',
      'lifestyle',
      'gear',
      'food',
      'ranking',
      'tier',
      'verdict',
      'grouped',
      'picks',
    ].includes(stored)
  ) {
    return stored;
  }

  const cats: any[] =
    toolsList?.en?.categories ??
    toolsList?.english?.categories ??
    toolsList?.categories ??
    [];

  if (!Array.isArray(cats) || cats.length === 0) return 'picks';

  let hasUrl = false;
  let isRanked = false;
  let hasTier = false;
  const allText: string[] = [];

  for (const cat of cats) {
    allText.push(safeStr(cat?.name).toLowerCase());

    if (Array.isArray(cat?.items)) {
      for (const item of cat.items) {
        if (item?.url) hasUrl = true;
        if (typeof item?.rank === 'number' && item.rank <= 10) isRanked = true;
        if (typeof item?.tier === 'string' && item.tier.trim()) hasTier = true;

        allText.push(safeStr(item?.name).toLowerCase());
        allText.push(safeStr(item?.description).toLowerCase());
      }
    }
  }

  const combined = allText.join(' ');

  if (hasTier) return 'tier';
  if ([...LIFESTYLE_SIGNALS].some((s) => combined.includes(s))) return 'lifestyle';
  if ([...FOOD_SIGNALS].some((s) => combined.includes(s))) return 'food';
  if ([...GEAR_SIGNALS].some((s) => combined.includes(s))) return 'gear';
  if (hasUrl) return 'software';
  if ([...SOFTWARE_SIGNALS].some((s) => combined.includes(s))) return 'software';
  if (isRanked) return 'ranking';

  return 'picks';
}

const STRUCTURED_META: Record<ToolsSubtype, { icon: React.ReactElement; label: string }> = {
  software: { icon: <Wrench size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'Software' },
  lifestyle: { icon: <Sparkles size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'Lifestyle' },
  gear: { icon: <Backpack size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'Gear' },
  food: { icon: <UtensilsCrossed size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'Food' },
  ranking: { icon: <Trophy size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'Ranking' },
  tier: { icon: <Layers3 size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'Tier' },
  verdict: { icon: <Layers3 size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'Verdict' },
  grouped: { icon: <Layers3 size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'List' },
  picks: { icon: <Heart size={11} strokeWidth={2.5} aria-hidden="true" />, label: 'Picks' },
};

interface ContentTypeBadgeProps {
  type: ContentType;
  toolsSubtype?: ToolsSubtype;
}

export const ContentTypeBadge: React.FC<ContentTypeBadgeProps> = ({ type, toolsSubtype }) => {
  if (type === 'general') return null;

  if (type === 'recipe') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide uppercase bg-orange-50 text-orange-600 border-orange-200">
        <ChefHat size={11} strokeWidth={2.5} aria-hidden="true" />
        Recipe
      </span>
    );
  }

  if (type === 'workout') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide uppercase bg-emerald-50 text-emerald-700 border-emerald-200">
        <Dumbbell size={11} strokeWidth={2.5} aria-hidden="true" />
        Workout
      </span>
    );
  }

  if (type === 'location') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide uppercase bg-sky-50 text-sky-700 border-sky-200">
        <MapPin size={11} strokeWidth={2.5} aria-hidden="true" />
        Places
      </span>
    );
  }

  if (type === 'software') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide uppercase bg-primary-50 text-primary-700 border-primary-200">
        <Wrench size={11} strokeWidth={2.5} aria-hidden="true" />
        Software
      </span>
    );
  }

  if (type === 'finance') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide uppercase bg-amber-50 text-amber-700 border-amber-200">
        <Landmark size={11} strokeWidth={2.5} aria-hidden="true" />
        Finance
      </span>
    );
  }

  if (type === 'products') {
    const { icon, label } = STRUCTURED_META[toolsSubtype ?? 'picks'];
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide uppercase bg-violet-50 text-violet-700 border-violet-200">
        {icon}
        {label}
      </span>
    );
  }

  return null;
};

export default ContentTypeBadge;