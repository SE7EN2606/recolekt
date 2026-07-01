import React, { useEffect, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';

interface RecipeAiSummaryCardProps {
  summaryText?: string;
  headlines: any[];
  collapsedByDefault?: boolean;
}

export const RecipeAiSummaryCard: React.FC<RecipeAiSummaryCardProps> = ({
  summaryText,
  headlines,
  collapsedByDefault = false,
}) => {
  const [summaryOpen, setSummaryOpen] = useState(!collapsedByDefault);
  const [summaryHighlightsOpen, setSummaryHighlightsOpen] = useState(false);

  useEffect(() => {
    setSummaryOpen(!collapsedByDefault);
    setSummaryHighlightsOpen(false);
  }, [collapsedByDefault, summaryText]);

  return (
    <section className="mb-5">
      <div className="overflow-hidden rounded-[26px] border border-primary-100/70 bg-[linear-gradient(180deg,rgba(250,245,255,0.98),rgba(245,243,255,0.92))] shadow-[0_4px_18px_rgba(15,23,42,0.06)] backdrop-blur-sm">
        <div className="px-4 py-4 md:px-5 md:py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/85 text-primary-600 ring-1 ring-primary-100/80 shadow-[0_2px_8px_rgba(124,58,237,0.08)]">
              <Sparkles size={18} aria-hidden="true" />
            </span>
            <div>
              <div className="text-[11px] font-black uppercase tracking-widest text-primary-700/70">
                AI Summary
              </div>
              <div className="mt-1 text-[18px] font-bold tracking-tight text-gray-900">
                Quick read before you cook
              </div>
            </div>
          </div>

          {summaryOpen && (
            <div className="mt-4 max-w-[72ch]">
              {summaryText && (
                <p className="text-[15px] font-medium leading-7 text-gray-700">
                  {summaryText}
                </p>
              )}
            </div>
          )}
        </div>

        {summaryOpen && headlines.length > 0 && summaryHighlightsOpen && (
          <div className="border-t border-primary-100/70 px-4 pb-4 pt-4 md:px-5 md:pb-5">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Key Highlights
            </h4>
            <div className="mt-3 flex flex-col gap-2.5">
              {headlines.map((item: any, index: number) => (
                <div
                  key={`${item.headline || item.text}-${index}`}
                  className="flex min-w-0 gap-3 rounded-2xl bg-white/78 px-4 py-3 ring-1 ring-primary-100/80"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-base leading-none">
                    {item.emoji || '•'}
                  </span>
                  <div className="min-w-0">
                    {item.headline && (
                      <div className="text-sm font-bold leading-snug text-gray-900">
                        {item.headline}
                      </div>
                    )}
                    {item.text && (
                      <div className="mt-1 text-sm font-medium leading-relaxed text-gray-600">
                        {item.text}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(collapsedByDefault || headlines.length > 0) && (
          <div className="px-4 pb-4 md:px-5 md:pb-5">
            <button
              type="button"
              onClick={() => {
                if (!summaryOpen) {
                  setSummaryOpen(true);
                  setSummaryHighlightsOpen(true);
                  return;
                }
                if (headlines.length > 0) {
                  setSummaryHighlightsOpen((value) => !value);
                  return;
                }
                setSummaryOpen(false);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary-100 bg-primary-50/70 py-3 text-sm font-bold text-primary-700 transition-colors hover:bg-primary-100"
            >
              {!summaryOpen ? 'See highlights' : headlines.length > 0 ? (summaryHighlightsOpen ? 'Hide highlights' : 'See highlights') : 'Hide summary'}
              <ChevronDown
                size={16}
                className={`transition-transform duration-200 ${summaryOpen && summaryHighlightsOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default RecipeAiSummaryCard;
