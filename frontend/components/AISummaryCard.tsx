import React, { useMemo } from 'react';

type HeadlineItem =
  | string
  | {
      headline?: string;
      text?: string;
      emoji?: string;
    };

type LangBlock = {
  title?: string;
  summary?: string;
  headlines?: HeadlineItem[];
  bullets?: HeadlineItem[];
};

type BilingualSummary =
  | {
      english?: LangBlock;
      original?: LangBlock;
      EN?: LangBlock;
      OG?: LangBlock;
      en?: LangBlock;
      og?: LangBlock;
      summary?: string;
      headlines?: HeadlineItem[];
      bullets?: HeadlineItem[];
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

const normalizeBilingual = (data: any): { english?: LangBlock; original?: LangBlock } => {
  if (!data || typeof data === 'string') return {};
  const english = data.english ?? data.EN ?? data.en ?? undefined;
  const original = data.original ?? data.OG ?? data.og ?? undefined;
  return { english, original };
};

const normalizeHeadline = (item: HeadlineItem) => {
  if (typeof item === 'string') return { headline: item, text: '', emoji: '' };
  const headline = safeStr(item?.headline) || safeStr(item?.text);
  const text = safeStr(item?.text);
  const emoji = safeStr((item as any)?.emoji);
  return { headline, text, emoji };
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

    const { english, original } = normalizeBilingual(summaryData);
    const selected = showOriginal ? original : english;

    const summary =
      safeStr(selected?.summary) ||
      safeStr(english?.summary) ||
      safeStr(original?.summary) ||
      safeStr((summaryData as any)?.summary) ||
      '';

    const headlinesRaw =
      asArray(selected?.headlines).length
        ? selected?.headlines
        : asArray(selected?.bullets).length
          ? selected?.bullets
          : asArray(english?.headlines).length
            ? english?.headlines
            : asArray(original?.headlines).length
              ? original?.headlines
              : (summaryData as any)?.headlines || (summaryData as any)?.bullets || [];

    const normalized = asArray(headlinesRaw)
      .map(normalizeHeadline)
      .filter(b => (b.headline || b.text));

    return {
      displaySummary: summary,
      bullets: normalized,
    };
  }, [summaryData, showOriginal]);

  const hasAnyContent = !!(displaySummary || bullets.length);
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
        ) : (
          displaySummary && (
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
              {displaySummary}
            </p>
          )
        )}

        {bullets.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
              Highlights
            </div>
            <ul className="space-y-2">
              {bullets.map((b, idx) => (
                <li key={idx} className="text-sm text-gray-800 leading-relaxed">
                <span className="font-medium">{b.headline}</span>
                {b.text ? <span className="text-gray-600"> — {b.text}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
