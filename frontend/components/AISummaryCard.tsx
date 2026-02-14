import React, { useMemo } from 'react';


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


const normalizeHeadline = (item: HeadlineItem, allEmojis: string[] = []) => {
  if (typeof item === 'string') {
    const emojiMatch = item.match(/^([\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D]+)\s*/u);
    const emoji = emojiMatch ? emojiMatch[1] : '';
    const remaining = item.replace(/^[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D]+\s*/u, '').trim();
    
    const parts = remaining.split(/\s*[—-]\s*/);
    if (parts.length >= 2) {
      return {
        emoji,
        headline: parts[0].trim(),
        text: parts.slice(1).join(' — ').trim()
      };
    }
    return { emoji, headline: remaining, text: '' };
  }
  
  const headline = safeStr(item?.headline) || safeStr(item?.text) || '';
  const text = safeStr((item as any)?.text) || safeStr((item as any)?.description) || '';
  let emoji = safeStr((item as any)?.emoji) || '';
  
  if (!emoji && headline) {
    const emojiMatch = headline.match(/^([\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D]+)\s*/u);
    if (emojiMatch) {
      emoji = emojiMatch[1];
      return {
        emoji,
        headline: headline.replace(/^[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D]+\s*/u, '').trim(),
        text
      };
    }
  }
  
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


    if (!summaryData) {
      return {
        displaySummary: '',
        bullets: [] as Array<{ headline: string; text: string; emoji?: string }>,
      };
    }


    const { english, original } = normalizeBilingual(summaryData);


    let summary = '';
    let headlinesRaw: HeadlineItem[] = [];
    let emojisArray: string[] = [];


    if (showOriginal) {
      summary = safeStr(original?.summary) || safeStr(original?.text) || '';
      headlinesRaw = asArray(original?.headlines).length
        ? original?.headlines || []
        : asArray(original?.bullets) || [];
      emojisArray = asArray(original?.emojis) || [];
    } else {
      summary = safeStr(english?.summary) || safeStr(english?.text) || '';
      headlinesRaw = asArray(english?.headlines).length
        ? english?.headlines || []
        : asArray(english?.bullets) || [];
      emojisArray = asArray(english?.emojis) || [];
    }


    if (!summary && !headlinesRaw.length) {
      summary = safeStr((summaryData as any)?.summary) || '';
      headlinesRaw = (summaryData as any)?.headlines || (summaryData as any)?.bullets || [];
      emojisArray = (summaryData as any)?.emojis || [];
    }


    const normalized = asArray(headlinesRaw)
      .map((item, index) => {
        const result = normalizeHeadline(item, emojisArray);
        
        if (!result.emoji && emojisArray[index]) {
          result.emoji = emojisArray[index];
        }
        
        return result;
      })
      .filter(b => (b.headline || b.text));


    return {
      displaySummary: summary,
      bullets: normalized,
    };
  }, [summaryData, showOriginal]);


  const hasAnyContent = !!(displaySummary || bullets.length);


  if (!hasAnyContent) {
    return null;
  }


  return (
    <div className="mb-8">
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
                    {b.emoji && (
                      <span className="text-xl leading-none flex-shrink-0 mt-0.5">
                        {b.emoji}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 leading-snug mb-1">
                        {b.headline}
                      </div>
                      {b.text && (
                        <div className="text-gray-600 text-sm leading-relaxed">
                          {b.text}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
