// frontend/src/components/ToolsListCard.tsx

import React from 'react';
import { ExternalLink } from 'lucide-react';

export interface ToolItem {
  rank?: number | null;
  tier?: string | null;
  name: string;
  description?: string;
  why_it_matters?: string;
  free?: boolean | null;
  url?: string | null;
  source?: string;
  creator_rating?: 'best' | 'good' | 'bad' | null;
}

export interface ToolCategory {
  name: string;
  emoji?: string;
  items: ToolItem[];
}

export interface ToolsList {
  list_type?: string;
  list_subtype?: string;
  listSubtype?: string;
  is_ranked?: boolean;
  en?: { categories: ToolCategory[] };
  original?: { categories: ToolCategory[] };
}

interface Props {
  toolsList?: ToolsList;
  showOriginal?: boolean;
}

const TIER_ORDER = ['S', 'A', 'B', 'C', 'D', 'F'] as const;
type TierLetter = typeof TIER_ORDER[number];

const TIER_CIRCLE: Record<TierLetter, string> = {
  S: 'bg-yellow-400 text-black',
  A: 'bg-emerald-500 text-white',
  B: 'bg-blue-400 text-white',
  C: 'bg-purple-400 text-white',
  D: 'bg-orange-500 text-white',
  F: 'bg-red-700 text-white',
};

function isValidTier(t: unknown): t is TierLetter {
  return typeof t === 'string' && (TIER_ORDER as readonly string[]).includes(t);
}

function isTierLetterList(items: ToolItem[]): boolean {
  return items.some((i) => isValidTier(i.tier));
}

function dedupeByRank(items: ToolItem[]): ToolItem[] {
  const seen = new Set<number>();
  return items.filter((item) => {
    const r = typeof item.rank === 'number' ? item.rank : null;
    if (r === null) return true;
    if (seen.has(r)) return false;
    seen.add(r);
    return true;
  });
}

function resolveQualityRating(
  item: ToolItem,
  isRankedList: boolean,
): 'best' | 'good' | 'bad' | null {
  if (isRankedList) return null;

  const r = item.creator_rating;
  if (r === 'best' || r === 'good' || r === 'bad') return r;
  return null;
}

function listHasQualityJudgment(items: ToolItem[]): boolean {
  return items.some(
    (i) => i.creator_rating === 'bad' || i.creator_rating === 'best' || i.creator_rating === 'good',
  );
}

const QUALITY_CIRCLE: Record<'best' | 'good' | 'bad', string> = {
  best: 'bg-emerald-500 text-white',
  good: 'bg-orange-400 text-white',
  bad: 'bg-red-400 text-white',
};

const RATING_PILL: Record<'best' | 'good' | 'bad', string> = {
  best: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  good: 'bg-orange-50 text-orange-600 border-orange-200',
  bad: 'bg-red-50 text-red-600 border-red-200',
};

const RATING_LABEL: Record<'best' | 'good' | 'bad', string> = {
  best: 'Best',
  good: 'Good',
  bad: 'Bad',
};

const FreeBadge: React.FC<{ free?: boolean | null }> = ({ free }) => {
  if (free === null || free === undefined) return null;

  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wide ${
        free
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-gray-50 text-gray-500 border-gray-200'
      }`}
    >
      {free ? 'Free' : 'Paid'}
    </span>
  );
};

const RatingBadge: React.FC<{ rating: 'best' | 'good' | 'bad' | null }> = ({ rating }) => {
  if (!rating) return null;

  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wide ${RATING_PILL[rating]}`}
    >
      {RATING_LABEL[rating]}
    </span>
  );
};

export const ToolsListCard: React.FC<Props> = ({ toolsList, showOriginal = false }) => {
  if (!toolsList) return null;

  const isRankedList = toolsList.is_ranked === true;

  const cats: ToolCategory[] = showOriginal
    ? (toolsList.original?.categories ?? toolsList.en?.categories ?? [])
    : (toolsList.en?.categories ?? toolsList.original?.categories ?? []);

  if (!cats.length) return null;

  return (
    <div className="mt-4 pt-4 border-t border-primary-100/50 space-y-5">
      {cats.map((cat, ci) => {
        const rawItems = Array.isArray(cat.items) ? cat.items : [];
        const useTiers = isTierLetterList(rawItems);

        const items = useTiers
          ? [...rawItems].sort(
              (a, b) =>
                TIER_ORDER.indexOf(isValidTier(a.tier) ? a.tier : 'F') -
                TIER_ORDER.indexOf(isValidTier(b.tier) ? b.tier : 'F'),
            )
          : dedupeByRank(rawItems);

        const showQualityBadges =
          !isRankedList && !useTiers && listHasQualityJudgment(items);

        return (
          <div key={`${cat.name}-${ci}`}>
            <div className="flex items-center gap-2 mb-2.5">
              {cat.emoji && (
                <span className="text-base leading-none">{cat.emoji}</span>
              )}
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">
                {cat.name}
              </h4>
            </div>

            <div className="space-y-2">
              {items.map((item, ii) => {
                const tier = isValidTier(item.tier) ? item.tier : null;
                const quality = showQualityBadges
                  ? resolveQualityRating(item, isRankedList)
                  : null;

                const circleClass = tier
                  ? TIER_CIRCLE[tier]
                  : quality
                    ? QUALITY_CIRCLE[quality]
                    : 'bg-primary-600 text-white';

                return (
                  <div
                    key={`${item.name}-${ii}`}
                    className="bg-white border border-gray-100 rounded-xl p-3.5 flex flex-col gap-1.5 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      {tier ? (
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${circleClass}`}
                        >
                          {tier}
                        </div>
                      ) : typeof item.rank === 'number' && item.rank > 0 ? (
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${circleClass}`}
                        >
                          {item.rank}
                        </div>
                      ) : null}

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-gray-900 text-sm leading-snug flex-1 break-words">
                            {item.name}
                          </span>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {!isRankedList && !tier && (
                              <FreeBadge free={item.free} />
                            )}
                            {showQualityBadges && !tier && (
                              <RatingBadge rating={quality} />
                            )}
                          </div>
                        </div>

                        {item.description && (
                          <p className="text-xs text-gray-600 leading-relaxed">
                            {item.description}
                          </p>
                        )}

                        {!isRankedList && !tier && item.why_it_matters && (
                          <p className="text-xs text-gray-500 leading-relaxed italic">
                            {item.why_it_matters}
                          </p>
                        )}

                        {!isRankedList && !tier && item.url && (
                          <a
                            href={`https://${item.url.replace(/^https?:\/\//, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-700 hover:text-primary-800 pt-0.5"
                          >
                            <ExternalLink size={12} aria-hidden="true" />
                            Open link
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};