import { API_BASE } from "../utils/api";
// components/AISummaryCard.tsx

import React, { useEffect, useMemo, useRef } from 'react';

type HeadlineItem =
  | string
  | {
      headline?: string;
      text?: string;
      description?: string;
      emoji?: string;
    };

type LangBlock = {
  title?: string;
  summary?: string;
  text?: string;
  headlines?: HeadlineItem[];
  bullets?: HeadlineItem[];
  emojis?: string[];
};

type BilingualSummary =
  | {
      english?: LangBlock;
      original?: LangBlock;
      EN?: LangBlock;
      OG?: LangBlock;
      en?: LangBlock;
      og?: LangBlock;
      summary?:
        | string
        | {
            english?: LangBlock;
            original?: LangBlock;
            EN?: LangBlock;
            OG?: LangBlock;
            en?: LangBlock;
            og?: LangBlock;
            [k: string]: any;
          };
      headlines?: HeadlineItem[];
      bullets?: HeadlineItem[];
      emojis?: string[];
      [key: string]: any;
    }
  | string
  | null
  | undefined;

interface AISummaryCardProps {
  isEditMode: boolean;
  value: string;
  onChange: (v: string) => void;
  summaryData: BilingualSummary;
  showOriginal: boolean;
}

const safeStr = (v: any) => (typeof v === 'string' ? v : '');
const asArray = (v: any) => (Array.isArray(v) ? v : []);

const stripEmojiPrefix = (s: string) =>
  s
    .replace(/^[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D]+\s*/u, '')
    .trim();

const extractEmojiPrefix = (s: string) => {
  const m = s.match(/^([\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D]+)\s*/u);
  return m ? m[1] : '';
};

/**
 * Normalize summaryData into { english, original }.
 * Supports:
 * - { english: {...}, original: {...} }
 * - { EN: {...}, OG: {...} }
 * - { summary: { english: {...}, original: {...} } }
 */
const normalizeBilingual = (data: any): { english?: LangBlock; original?: LangBlock } => {
  if (!data || typeof data === 'string') return {};

  const hasTopLevelLang =
    data.english || data.original || data.EN || data.OG || data.en || data.og;

  const container =
    hasTopLevelLang && typeof data === 'object'
      ? data
      : typeof data.summary === 'object' && data.summary
        ? data.summary
        : data;

  const english = container.english ?? container.EN ?? container.en ?? undefined;
  const original = container.original ?? container.OG ?? container.og ?? undefined;

  return { english, original };
};

const normalizeHeadline = (item: HeadlineItem) => {
  if (typeof item === 'string') {
    const raw = item.trim();
    const emoji = extractEmojiPrefix(raw);
    const remaining = stripEmojiPrefix(raw);

    const colonIdx = remaining.indexOf(':');
    if (colonIdx > -1) {
      const headline = remaining.slice(0, colonIdx).trim();
      const text = remaining.slice(colonIdx + 1).trim();
      return { emoji, headline: headline || remaining, text };
    }

    const parts = remaining.split(/\s+(?:—|-)\s+/);
    if (parts.length >= 2) {
      return {
        emoji,
        headline: parts[0].trim(),
        text: parts.slice(1).join(' — ').trim(),
      };
    }

    return { emoji, headline: remaining, text: '' };
  }

  const rawHeadline = safeStr((item as any)?.headline).trim();
  const rawText =
    safeStr((item as any)?.text).trim() || safeStr((item as any)?.description).trim();

  let emoji = safeStr((item as any)?.emoji).trim();

  if (!emoji && rawHeadline) {
    const prefix = extractEmojiPrefix(rawHeadline);
    if (prefix) emoji = prefix;
  }

  const headline = stripEmojiPrefix(rawHeadline);

  if (!headline && rawText) {
    return { emoji, headline: rawText, text: '' };
  }

  return { emoji, headline, text: rawText };
};

export const AISummaryCard: React.FC<AISummaryCardProps> = ({
  isEditMode,
  value,
  onChange,
  summaryData,
  showOriginal,
}) => {
  const { displaySummary, bullets } = useMemo(() => {
    if (typeof summaryData === 'string') {
      return {
        displaySummary: summaryData,
        bullets: [] as Array<{ headline: string; text: string; emoji?: string }>,
      };
    }

    if (!summaryData) {
      return {
        displaySummary: '',
        bullets: [] as Array<{ headline: string; text: string; emoji?: string }>,
      };
    }

    const { english, original } = normalizeBilingual(summaryData);

    const primary = showOriginal ? original : english;
    const fallback = showOriginal ? english : original;
    const block = primary || fallback;

    let summary = '';
    let headlinesRaw: HeadlineItem[] = [];
    let emojisArray: string[] = [];

    if (block) {
      summary = safeStr(block.summary) || safeStr(block.text) || '';
      const h = asArray(block.headlines);
      const b = asArray(block.bullets);
      headlinesRaw = h.length ? h : b;
      emojisArray = asArray(block.emojis);
    }

    if (!summary && !headlinesRaw.length) {
      const flatSummary = (summaryData as any).summary;
      summary = safeStr(flatSummary);
      headlinesRaw = asArray((summaryData as any).headlines).length
        ? asArray((summaryData as any).headlines)
        : asArray((summaryData as any).bullets);
      emojisArray = asArray((summaryData as any).emojis);
    }

    const normalized = asArray(headlinesRaw)
      .map((item, index) => {
        const result = normalizeHeadline(item);
        if (!result.emoji && emojisArray[index]) {
          result.emoji = emojisArray[index];
        }
        return result;
      })
      .filter((b) => (b.headline && b.headline.trim()) || (b.text && b.text.trim()));

    return { displaySummary: summary, bullets: normalized };
  }, [summaryData, showOriginal]);

  // Seed edit textarea once when entering edit mode if empty
  const prevEditMode = useRef<boolean>(false);
  useEffect(() => {
    const justEnteredEdit = isEditMode && !prevEditMode.current;
    prevEditMode.current = isEditMode;

    if (justEnteredEdit) {
      const hasValue = typeof value === 'string' && value.trim().length > 0;
      if (!hasValue && displaySummary && displaySummary.trim().length > 0) {
        onChange(displaySummary);
      }
    }
  }, [isEditMode, value, displaySummary, onChange]);

  const hasAnyContent = isEditMode
    ? Boolean((value && value.trim()) || (displaySummary && displaySummary.trim()) || bullets.length)
    : Boolean((displaySummary && displaySummary.trim()) || bullets.length);

  if (!hasAnyContent) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="text-xs uppercase tracking-wide text-gray-600 font-semibold">
          AI Summary
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">
        {isEditMode ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full min-h-[96px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            placeholder="Edit summary..."
          />
        ) : displaySummary ? (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            {displaySummary}
          </p>
        ) : null}

        {bullets.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-3">
              Highlights
            </div>
            <ul className="space-y-3">
              {bullets.map((b, idx) => (
                <li key={idx} className="flex gap-3 items-start text-sm leading-relaxed">
                  {b.emoji ? (
                    <span className="text-xl leading-none flex-shrink-0 mt-0.5">
                      {b.emoji}
                    </span>
                  ) : (
                    <span className="w-6 flex-shrink-0" aria-hidden="true" />
                  )}

                  <div className="flex-1 min-w-0">
                    {b.headline ? (
                      <div className="font-semibold text-gray-900 leading-snug mb-1">
                        {b.headline}
                      </div>
                    ) : null}
                    {b.text ? (
                      <div className="text-gray-600 text-sm leading-relaxed">{b.text}</div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
