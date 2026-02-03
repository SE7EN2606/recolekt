import React, { useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  Pencil,
  Trash2,
  Layers,
  Tags,
  CircleAlert,
  Globe,
} from 'lucide-react';
import { RecipeMeta, Ingredients, Steps } from './RecipeComponents';
import {
  EditableTitle,
  EditableBullets,
  EditableHashtags,
} from './VideoDetailComponents';
import { IOSShareIcon } from './VideoIcons';
import { AISummaryCard } from './AISummaryCard';
import { useLanguage } from '../context/LanguageContext';

interface VideoDetailDesktopProps {
  viewModel: any;
  isEditMode: boolean;
  tempTitle: string;
  tempCategory: string;
  tempTopic: string;
  tempDescription: string;
  tempBullets: Array<{ headline: string; text: string; emoji?: string }>;
  tempHashtags: string[];
  servingScale: number;
  useMetric: boolean;
  captionOpen: boolean;
  transcriptOpen: boolean;
  onNavigateBack: () => void;
  onShare: () => void;
  onModifyToggle: () => void;
  onCancelEdit: () => void;
  setTempTitle: (value: string) => void;
  setTempCategory: (value: string) => void;
  setTempTopic: (value: string) => void;
  setTempDescription: (value: string) => void;
  setTempBullets: (value: Array<{ headline: string; text: string; emoji?: string }>) => void;
  setTempHashtags: (value: string[]) => void;
  setServingScale: (value: number) => void;
  setUseMetric: (value: boolean) => void;
  setCaptionOpen: (value: boolean) => void;
  setTranscriptOpen: (value: boolean) => void;
  onReportClick: () => void;
  onDeleteClick: () => void;
  parseQuantity: (qty: string) => { val: string; unit: string };
  scaleQuantity: (qty: string, scale: number) => string;
  convertToMetric: (qty: string) => string;
  convertToImperial: (qty: string) => string;
}

const asString = (v: any) => (typeof v === 'string' ? v : '');
const asArray = (v: any) => (Array.isArray(v) ? v : []);

const coerceText = (v: any): string => {
  if (typeof v === 'string') return v;
  if (!v) return '';
  if (Array.isArray(v)) return v.map(coerceText).filter(Boolean).join(' ').trim();

  if (typeof v === 'object') {
    if ((v as any).english !== undefined || (v as any).original !== undefined) {
      return coerceText((v as any).english) || coerceText((v as any).original) || '';
    }
    const keys = ['summary', 'text', 'description', 'title', 'headline', 'value'];
    for (const k of keys) {
      const val = (v as any)[k];
      if (typeof val === 'string' && val.trim()) return val;
    }
  }
  return '';
};

export const VideoDetailDesktop: React.FC<VideoDetailDesktopProps> = ({
  viewModel,
  isEditMode,
  tempTitle,
  tempCategory,
  tempTopic,
  tempDescription,
  tempBullets,
  tempHashtags,
  servingScale,
  useMetric,
  captionOpen,
  transcriptOpen,
  onNavigateBack,
  onShare,
  onModifyToggle,
  onCancelEdit,
  setTempTitle,
  setTempCategory,
  setTempTopic,
  setTempDescription,
  setTempBullets,
  setTempHashtags,
  setServingScale,
  setUseMetric,
  setCaptionOpen,
  setTranscriptOpen,
  onReportClick,
  onDeleteClick,
  parseQuantity,
  scaleQuantity,
  convertToMetric,
  convertToImperial,
}) => {
  const { t, showOriginal, toggleLanguage } = useLanguage();

  // =========================
  // ✅ DEBUG LINES (TOP)
  // =========================
  // NOTE: These are safe; remove later.
  console.log('🎬 VideoDetailDesktop viewModel:', viewModel);
  console.log('🎬 VideoDetailDesktop viewModel keys:', Object.keys(viewModel || {}));
  console.log('🎬 VideoDetailDesktop viewModel.summary_text:', viewModel?.summary_text);
  console.log('🎬 VideoDetailDesktop viewModel.summary:', viewModel?.summary);
  console.log('🎬 VideoDetailDesktop viewModel.transcription:', viewModel?.transcription);

  const summary = viewModel?.summary || {};
  const recipeData = viewModel?.recipe || {};

  const hashtags = asArray(viewModel?.hashtags).length
    ? asArray(viewModel?.hashtags)
    : asArray(summary?.hashtags);

  const titleData = summary?.title;
  const isDualLanguageTitle = typeof titleData === 'object' && titleData?.english && titleData?.original;

  const hasRecipeTranslation = !!(viewModel.isRecipe && recipeData?.english && recipeData?.original);

  const hasTranslation =
    hasRecipeTranslation ||
    isDualLanguageTitle ||
    !!(summary?.english && summary?.original);

  const rawLangCode = recipeData?.language_code || 'en';
  const languageCode = (rawLangCode.toLowerCase() === 'en' && hasTranslation) ? 'OG' : rawLangCode.toUpperCase();

  let displayTitle = viewModel?.title || '';

  if (showOriginal) {
    if (hasRecipeTranslation && recipeData?.original?.title) {
      displayTitle = recipeData.original.title;
    } else if (summary?.original?.title) {
      displayTitle = summary.original.title;
    } else if (isDualLanguageTitle) {
      displayTitle = titleData.original;
    }
  } else {
    if (hasRecipeTranslation && recipeData?.english?.title) {
      displayTitle = recipeData.english.title;
    } else if (summary?.english?.title) {
      displayTitle = summary.english.title;
    }
  }

  const activeRecipe = (showOriginal && hasRecipeTranslation)
    ? recipeData.original
    : (recipeData.english || recipeData);

  const getProfileUrl = () => `https://www.instagram.com/${(viewModel.author || '').replace('@', '')}/`;

  const handleHashtagClick = (tag: string) =>
    window.open(`https://www.instagram.com/explore/tags/${tag.replace('#', '')}/`, '_blank');

  const renderCaptionWithHashtags = (text: string) => {
    if (!text) return null;
    return text.split(/(#\w+)/g).map((part, idx) =>
      part.startsWith('#') ? (
        <a
          key={idx}
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleHashtagClick(part);
          }}
          className="text-blue-600 hover:underline font-medium"
        >
          {part}
        </a>
      ) : (
        <span key={idx}>{part}</span>
      )
    );
  };

  const nestedSummaryText = showOriginal
    ? (coerceText(summary?.original?.summary) || coerceText(summary?.summary))
    : (coerceText(summary?.english?.summary) || coerceText(summary?.summary));

  const summaryText = asString(viewModel?.description) || nestedSummaryText;
  const summaryTextForCard = typeof summaryText === 'string' ? summaryText : coerceText(summaryText);

  const summaryTextObj = viewModel?.summary_text || null;

  const rawBullets = showOriginal
    ? (summaryTextObj?.original?.headlines ||
        summary?.original?.headlines ||
        summary?.headlines ||
        summary?.bullets ||
        viewModel?.bullets)
    : (summaryTextObj?.english?.headlines ||
        summary?.english?.headlines ||
        summary?.headlines ||
        summary?.bullets ||
        viewModel?.bullets);

  const bulletsForCard = asArray(rawBullets).map((b: any) => {
    if (typeof b === 'string') return b;
    if (b && typeof b === 'object') {
      const headline = asString(b.headline || b.text);
      const text = asString(b.text);
      return { ...b, headline, text };
    }
    return b;
  });

  // ✅ Checks the correct source for AISummaryCard (summary_text)
  const hasSummaryContent = !!(
    summaryTextObj?.english?.summary ||
    summaryTextObj?.english?.headlines?.length ||
    summaryTextObj?.original?.summary ||
    summaryTextObj?.original?.headlines?.length
  );

  // =========================
  // ✅ DEBUG LINES (DERIVED)
  // =========================
  console.log('🎬 VideoDetailDesktop derived:', {
    hasTranslation,
    languageCode,
    showOriginal,
    summaryTextObjExists: !!summaryTextObj,
    hasSummaryContent,
    summaryTextForCard,
    bulletsForCardCount: bulletsForCard.length,
    hasTranscript: !!viewModel?.transcription?.transcript,
  });

  return (
    <div className="hidden md:grid md:grid-cols-[1.5fr_1fr] gap-8 items-start">
      <div className="min-w-0">
        <div className="relative w-full aspect-[9/8] bg-black rounded-2xl overflow-hidden shadow-sm border border-gray-100 mb-6 group">
          <div className="absolute top-4 left-0 right-0 px-4 flex justify-between items-start z-10">
            <button
              onClick={onNavigateBack}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center shadow-lg hover:bg-white/40 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <button
              onClick={onShare}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center shadow-lg hover:bg-white/40 transition-colors"
            >
              <IOSShareIcon size={20} />
            </button>
          </div>

          <img src={viewModel.preview} alt={displayTitle} className="w-full h-full object-cover opacity-90" />

          {hasTranslation && !isEditMode && (
            <button
              onClick={toggleLanguage}
              className={`absolute bottom-3 left-3 px-2 py-1 rounded-lg flex items-center gap-1.5 transition-all z-30 shadow-lg ${showOriginal ? 'bg-primary-600 text-white' : 'bg-black/60 text-white backdrop-blur-sm'}`}
            >
              <Globe size={12} className={showOriginal ? 'text-white' : 'text-gray-200'} />
              <span className="text-[10px] font-bold uppercase tracking-wider">{showOriginal ? languageCode : 'EN'}</span>
            </button>
          )}

          {viewModel.duration && (
            <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-medium text-white z-20">
              {viewModel.duration}
            </div>
          )}
        </div>

        <div className="mb-3">
          <EditableTitle title={displayTitle} isEditMode={isEditMode} value={tempTitle} onChange={setTempTitle} />
        </div>

        <div className="mb-6 flex items-center justify-between">
          <a href={getProfileUrl()} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 group/author">
            <svg className="w-3 h-3 text-pink-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
            </svg>
            <span className="text-xs font-medium text-gray-500 truncate group-hover/author:text-gray-900 transition-colors">
              {viewModel.author}
            </span>
          </a>
          {viewModel.savedAt && <div className="text-xs text-gray-400">Saved {viewModel.savedAt}</div>}
        </div>

        {hasSummaryContent && (
          <div className="mb-8">
            {console.log('🎬 VideoDetailDesktop passing to AISummaryCard:', {
              summaryData: viewModel.summary_text,
              showOriginal,
              hasSummaryContent,
            })}
            <AISummaryCard
              isEditMode={isEditMode}
              value={tempDescription}
              onChange={setTempDescription}
              summaryData={viewModel.summary_text}
              showOriginal={showOriginal}
            />
          </div>
        )}

        {isEditMode && (
          <div className="mb-8">
            <EditableBullets
              bullets={viewModel.bullets}
              isEditMode={isEditMode}
              value={tempBullets}
              onChange={setTempBullets}
            />
          </div>
        )}

        {viewModel.isRecipe && activeRecipe && (
          <div className="space-y-6 mb-8" key={`recipe-${showOriginal}`}>
            <RecipeMeta
              recipe={activeRecipe}
              servingScale={servingScale}
              setServingScale={setServingScale}
              showOriginal={showOriginal}
            />
            <Ingredients
              recipe={activeRecipe}
              servingScale={servingScale}
              useMetric={useMetric}
              setUseMetric={setUseMetric}
              scaleQuantity={scaleQuantity}
              convertToMetric={convertToMetric}
              convertToImperial={convertToImperial}
              parseQuantity={parseQuantity}
              showOriginal={showOriginal}
            />
            <Steps recipe={activeRecipe} showOriginal={showOriginal} />
            {(activeRecipe.tips || []).length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                <h2 className="text-lg font-bold text-amber-900 mb-3">💡 Tips</h2>
                <ul className="space-y-2 list-none pl-0">
                  {activeRecipe.tips.map((tip: string, idx: number) => (
                    <li key={idx} className="text-amber-900 leading-relaxed">
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {viewModel.caption && (
          <div className="mb-8 bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <button
              onClick={() => setCaptionOpen(!captionOpen)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 font-medium text-gray-900"
            >
              <span>Original Caption</span>
              <ChevronDown className={`w-5 h-5 transition-transform ${captionOpen ? 'rotate-180' : ''}`} />
            </button>
            {captionOpen && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-sm text-gray-700 whitespace-pre-line">
                {renderCaptionWithHashtags(viewModel.caption)}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-6">
        {viewModel.sourceUrl && (
          <div className="bg-gradient-to-br from-violet-50 to-indigo-50 p-6 border border-violet-200 rounded-lg">
            <div className="text-xs uppercase tracking-wide text-violet-900 font-semibold mb-3">See original</div>
            <a href={viewModel.sourceUrl} target="_blank" rel="noopener noreferrer">
              <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium shadow-md bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] hover:opacity-90 transition-all active:scale-[0.98]">
                <ExternalLink className="w-4 h-4" />
                View on Instagram
              </button>
            </a>
          </div>
        )}

        <div className="bg-white border border-gray-200 p-6 rounded-lg">
          <div className="flex items-center gap-2 text-xs uppercase text-gray-500 font-semibold mb-3">
            <Layers className="w-4 h-4 text-primary-500" />
            <span>Category</span>
          </div>
          {isEditMode ? (
            <input
              type="text"
              value={tempCategory}
              onChange={(e) => setTempCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
          ) : (
            <span className="inline-block px-3 py-1 text-xs font-bold uppercase tracking-wide bg-primary-50 text-primary-600 rounded-lg">
              {viewModel.category}
            </span>
          )}
        </div>

        {(viewModel.topic || isEditMode) && (
          <div className="bg-white border border-gray-200 p-6 rounded-lg">
            <div className="flex items-center gap-2 text-xs uppercase text-gray-500 font-semibold mb-3">
              <Tags className="w-4 h-4 text-rose-500" />
              <span>Topic</span>
            </div>
            {isEditMode ? (
              <input
                type="text"
                value={tempTopic}
                onChange={(e) => setTempTopic(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            ) : (
              <span className="inline-block px-3 py-1 text-xs font-bold uppercase tracking-wide bg-rose-50 text-rose-600 rounded-lg">
                {viewModel.topic}
              </span>
            )}
          </div>
        )}

        {(hashtags.length > 0 || isEditMode) && (
          <div className="bg-white border border-gray-200 p-6 rounded-lg">
            <div className="flex items-center gap-2 text-xs uppercase text-gray-500 font-semibold mb-3">
              <Tags className="w-4 h-4 text-amber-600" />
              <span>Hashtags</span>
            </div>
            <EditableHashtags hashtags={hashtags} isEditMode={isEditMode} value={tempHashtags} onChange={setTempHashtags} />
          </div>
        )}

        {viewModel.transcription && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <button
              onClick={() => setTranscriptOpen(!transcriptOpen)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 font-medium text-gray-900"
            >
              <span>Transcript</span>
              <ChevronDown className={`w-5 h-5 transition-transform ${transcriptOpen ? 'rotate-180' : ''}`} />
            </button>
            {transcriptOpen && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                {viewModel.transcription.transcript}
              </div>
            )}
          </div>
        )}

        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-6 border border-blue-200 rounded-lg">
          <div className="text-xs uppercase tracking-wide text-blue-900 font-semibold mb-3">Settings</div>
          {!isEditMode ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={onReportClick}
                  className="w-10 h-10 flex items-center justify-center bg-gray-100 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-200"
                >
                  <CircleAlert className="w-4 h-4" />
                </button>
                <button
                  onClick={onModifyToggle}
                  className="flex-1 inline-flex items-center justify-center rounded-lg font-medium bg-primary-600 text-white hover:bg-primary-700 px-4 py-2.5 text-sm gap-2"
                >
                  <Pencil size={16} />
                  <span>Edit Reel</span>
                </button>
              </div>
              <button
                onClick={onDeleteClick}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-red-600 bg-red-50 border border-red-200 rounded-lg font-medium text-sm hover:bg-red-100 transition"
              >
                <Trash2 className="w-4 h-4" />
                Delete Reel
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={onCancelEdit}
                className="flex-1 bg-gray-200 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={onModifyToggle}
                className="flex-1 bg-primary-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-primary-700"
              >
                Save
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
