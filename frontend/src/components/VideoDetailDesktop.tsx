// components/VideoDetailDesktop.tsx

import React from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  Pencil,
  Trash2,
  Layers,
  CircleAlert,
  Globe,
} from 'lucide-react';
import {
  EditableTitle,
  EditableBullets,
  EditableHashtags,
} from './VideoDetailComponents';
import { IOSShareIcon } from './VideoIcons';
import { AISummaryCard } from './AISummaryCard';
import { useLanguage } from '../context/LanguageContext';
import { RecipeDetailsCard } from './RecipeDetailsCard';

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
  setTempBullets: (
    value: Array<{ headline: string; text: string; emoji?: string }>,
  ) => void;
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
      return (
        coerceText((v as any).english) ||
        coerceText((v as any).original) ||
        ''
      );
    }
    const keys = ['summary', 'text', 'description', 'title', 'headline', 'value'];
    for (const k of keys) {
      const val = (v as any)[k];
      if (typeof val === 'string' && val.trim()) return val;
    }
  }
  return '';
};

const isBilingualSummaryObject = (v: any) => {
  if (!v || typeof v !== 'object') return false;
  return Boolean((v as any).english || (v as any).original || (v as any).EN || (v as any).OG);
};

const normalizeBullets = (raw: any): Array<{ headline: string; text: string; emoji?: string }> => {
  const arr = asArray(raw);

  return arr
    .map((b: any) => {
      if (typeof b === 'string') {
        const idx = b.indexOf(':');
        if (idx > -1) {
          const headline = b.slice(0, idx).trim();
          const text = b.slice(idx + 1).trim();
          return { headline: headline || b.trim(), text };
        }
        return { headline: b.trim(), text: '' };
      }

      if (b && typeof b === 'object') {
        const headline = asString(b.headline || '');
        const text = asString(b.text || b.description || '');
        const emoji = asString(b.emoji || '');
        return { ...b, headline, text, emoji: emoji || b.emoji };
      }

      return null;
    })
    .filter(Boolean) as Array<{ headline: string; text: string; emoji?: string }>;
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
  useMetric, // kept for props compatibility
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
  setUseMetric, // kept for props compatibility
  setCaptionOpen,
  setTranscriptOpen,
  onReportClick,
  onDeleteClick,
  parseQuantity, // kept for props compatibility
  scaleQuantity,
  convertToMetric, // kept for props compatibility
  convertToImperial, // kept for props compatibility
}) => {
  const { showOriginal, toggleLanguage } = useLanguage();

  const summary = viewModel?.summary || {};
  const recipeData = viewModel?.recipe || {};

  const summaryDataForCard =
    (isBilingualSummaryObject(viewModel?.summary_text) ? viewModel.summary_text : null) ||
    (isBilingualSummaryObject(summary) ? summary : null) ||
    null;

  const activeSummaryObj = summaryDataForCard || summary || {};
  const activeSummaryText = showOriginal
    ? coerceText(activeSummaryObj?.original?.summary) || coerceText(activeSummaryObj?.summary)
    : coerceText(activeSummaryObj?.english?.summary) || coerceText(activeSummaryObj?.summary);

  const rawHashtags = (() => {
    const vmTags = asArray(viewModel?.hashtags);
    if (vmTags.length) return vmTags;

    if (showOriginal) {
      const og = asArray(activeSummaryObj?.original?.hashtags);
      if (og.length) return og;
    } else {
      const en = asArray(activeSummaryObj?.english?.hashtags);
      if (en.length) return en;
    }

    return asArray(activeSummaryObj?.hashtags) || asArray(summary?.hashtags);
  })();

  const hashtags = rawHashtags;

  const titleData = summary?.title;
  const isDualLanguageTitle =
    typeof titleData === 'object' && titleData?.english && titleData?.original;

  const hasRecipeTranslation = !!(viewModel.isRecipe && recipeData?.english && recipeData?.original);

  const hasTranslation =
    hasRecipeTranslation ||
    isDualLanguageTitle ||
    !!(summary?.english && summary?.original);

  const rawLangCode = recipeData?.language_code || 'en';
  const languageCode =
    rawLangCode.toLowerCase() === 'en' && hasTranslation ? 'OG' : rawLangCode.toUpperCase();

  let displayTitle = viewModel?.title || '';

  if (showOriginal) {
    if (hasRecipeTranslation && recipeData?.original?.title) {
      displayTitle = recipeData.original.title;
    } else if (summary?.original?.title) {
      displayTitle = summary.original.title;
    } else if (isDualLanguageTitle) {
      displayTitle = (titleData as any).original;
    }
  } else {
    if (hasRecipeTranslation && recipeData?.english?.title) {
      displayTitle = recipeData.english.title;
    } else if (summary?.english?.title) {
      displayTitle = summary.english.title;
    }
  }

  const activeRecipe =
    showOriginal && hasRecipeTranslation ? recipeData.original : recipeData.english || recipeData;

  const getProfileUrl = () =>
    `https://www.instagram.com/${(viewModel.author || '').replace('@', '')}/`;

  const handleHashtagClick = (tag: string) =>
    window.open(
      `https://www.instagram.com/explore/tags/${tag.replace('#', '')}/`,
      '_blank',
    );

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
      ),
    );
  };

  const rawBullets = (() => {
    if (showOriginal) {
      return (
        activeSummaryObj?.original?.headlines ||
        activeSummaryObj?.original?.highlights ||
        activeSummaryObj?.original?.bullets ||
        summary?.original?.headlines ||
        summary?.original?.highlights ||
        summary?.original?.bullets ||
        activeSummaryObj?.headlines ||
        activeSummaryObj?.highlights ||
        activeSummaryObj?.bullets ||
        summary?.headlines ||
        summary?.highlights ||
        summary?.bullets ||
        viewModel?.bullets ||
        []
      );
    }

    return (
      activeSummaryObj?.english?.headlines ||
      activeSummaryObj?.english?.highlights ||
      activeSummaryObj?.english?.bullets ||
      summary?.english?.headlines ||
      summary?.english?.highlights ||
      summary?.english?.bullets ||
      activeSummaryObj?.headlines ||
      activeSummaryObj?.highlights ||
      activeSummaryObj?.bullets ||
      summary?.headlines ||
      summary?.highlights ||
      summary?.bullets ||
      viewModel?.bullets ||
      []
    );
  })();

  const bulletsForCard = normalizeBullets(rawBullets);

  const hasSummaryContent = Boolean((activeSummaryText && activeSummaryText.trim()) || bulletsForCard.length);

  const transcriptionRaw = viewModel?.transcription;
  const transcriptionText =
    typeof transcriptionRaw === 'string'
      ? transcriptionRaw.trim()
      : (transcriptionRaw?.transcript || '').trim();

  const hasTranscriptField =
    viewModel.transcription !== undefined && viewModel.transcription !== null;

  const thumbnailSrc: string | undefined =
    viewModel.preview ||
    viewModel.gcs_urls?.preview_thumbnail ||
    viewModel.thumbnailUrl ||
    undefined;

  const displayCategory = viewModel.category || '';
  const displayTopic = viewModel.topic || '';

  return (
    <div className="hidden md:grid md:grid-cols-[1.5fr_1fr] gap-8 items-start">
      {/* LEFT COLUMN */}
      <div className="min-w-0">
        {/* Video preview + top buttons */}
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

          {thumbnailSrc ? (
            <img
              src={thumbnailSrc}
              alt={displayTitle || 'Video preview'}
              className="w-full h-full object-cover opacity-90"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-gray-400 bg-gray-900">
              No preview available
            </div>
          )}

          {hasTranslation && !isEditMode && (
            <button
              onClick={toggleLanguage}
              className={`absolute bottom-3 left-3 px-2 py-1 rounded-lg flex items-center gap-1.5 transition-all z-30 shadow-lg ${
                showOriginal
                  ? 'bg-primary-600 text-white'
                  : 'bg-black/60 text-white backdrop-blur-sm'
              }`}
            >
              <Globe size={12} className={showOriginal ? 'text-white' : 'text-gray-200'} />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {showOriginal ? languageCode : 'EN'}
              </span>
            </button>
          )}

          {viewModel.duration && (
            <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-medium text-white z-20">
              {viewModel.duration}
            </div>
          )}
        </div>

        {/* Editable title */}
        <div className="mb-3">
          <EditableTitle
            title={displayTitle}
            isEditMode={isEditMode}
            value={tempTitle}
            onChange={setTempTitle}
          />
        </div>

        {/* Author + saved date */}
        <div className="mb-6 flex items-center justify-between">
          <a
            href={getProfileUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 group/author"
          >
            <svg className="w-3 h-3 text-pink-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
            </svg>
            <span className="text-xs font-medium text-gray-500 truncate group-hover/author:text-gray-900 transition-colors">
              {viewModel.author}
            </span>
          </a>
          {viewModel.savedAt && <div className="text-xs text-gray-400">Saved {viewModel.savedAt}</div>}
        </div>

        {/* AI summary card (single render, no duplicate highlights below) */}
        {hasSummaryContent && (
          <div className="mb-8">
            <AISummaryCard
              isEditMode={isEditMode}
              value={tempDescription}
              onChange={setTempDescription}
              summaryData={summaryDataForCard || summary}
              showOriginal={showOriginal}
            />
          </div>
        )}

        {/* Editable bullets when in edit mode */}
        {isEditMode && (
          <div className="mb-8">
            <EditableBullets
              bullets={bulletsForCard}
              isEditMode={isEditMode}
              value={tempBullets}
              onChange={setTempBullets}
            />
          </div>
        )}

        {/* Recipe details card */}
        {viewModel.isRecipe && activeRecipe && (
          <div className="mb-8" key={`recipe-${showOriginal}`}>
            <RecipeDetailsCard
              recipe={activeRecipe}
              servingScale={servingScale}
              scaleQuantity={scaleQuantity}
              onServingScaleChange={setServingScale}
            />
          </div>
        )}

        {/* Caption */}
        {viewModel.caption && (
          <div className="mb-8 bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <button
              onClick={() => setCaptionOpen(!captionOpen)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 font-medium text-gray-900"
            >
              <span>Original Caption</span>
              <ChevronDown
                className={`w-5 h-5 transition-transform ${captionOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {captionOpen && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-sm text-gray-700 whitespace-pre-line">
                {renderCaptionWithHashtags(viewModel.caption)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* RIGHT COLUMN */}
      <div className="space-y-6">
        {/* View on Instagram */}
        {viewModel.sourceUrl && (
          <div className="bg-gradient-to-br from-violet-50 to-indigo-50 p-6 border border-violet-200 rounded-lg">
            <div className="text-xs uppercase tracking-wide text-violet-900 font-semibold mb-3">
              See original
            </div>
            <a href={viewModel.sourceUrl} target="_blank" rel="noopener noreferrer">
              <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium shadow-md bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] hover:opacity-90 transition-all active:scale-[0.98]">
                <ExternalLink className="w-4 h-4" />
                View on Instagram
              </button>
            </a>
          </div>
        )}

        {/* Category */}
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
              {displayCategory}
            </span>
          )}
        </div>

        {/* Topic */}
        {(displayTopic || isEditMode) && (
          <div className="bg-white border border-gray-200 p-6 rounded-lg">
            <div className="flex items-center gap-2 text-xs uppercase text-gray-500 font-semibold mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="lucide lucide-tags w-4 h-4 text-rose-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1z" />
                <path d="M2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193" />
                <circle cx="10.5" cy="6.5" r=".5" fill="currentColor" />
              </svg>
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
                {displayTopic}
              </span>
            )}
          </div>
        )}

        {/* Hashtags */}
        {(hashtags.length > 0 || isEditMode) && (
          <div className="bg-white border border-gray-200 p-6 rounded-lg hashtags-card">
            <div className="flex items-center gap-2 text-xs uppercase text-gray-500 font-semibold mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 512 512"
                className="flex-shrink-0"
                aria-hidden="true"
              >
                <path
                  fillRule="nonzero"
                  d="M300.02 161.657l.047-.187c3.542-14.981 23.176-18.148 31.458-5.532a17.27 17.27 0 012.463 13.038c-2.328 10.088-4.271 20.55-6.386 30.72h12.177c22.801 0 22.804 34.849 0 34.849h-19.383l-8.664 43.645h30.453c22.935 0 22.926 34.846 0 34.846h-37.597l-7.847 37.682c-5.447 21.855-38.479 14.339-33.876-7.694 2.271-9.85 4.177-20.06 6.245-29.988h-45.112c-2.556 12.304-4.897 25.01-7.741 37.203-5.282 22.331-38.129 14.224-33.971-7.243l6.239-29.991-16.242.003c-22.9.135-22.956-34.818 0-34.818h23.404l8.614-43.645h-34.49c-22.521 0-23.232-34.849 0-34.849h41.693l7.731-37.144c.051-.403.138-.797.26-1.176 5.329-21.289 38.485-14.721 33.877 7.672l-6.39 30.648h45.113c2.635-12.65 5.447-25.37 7.925-38.039zM256 0c70.688 0 134.689 28.658 181.016 74.984C483.342 121.311 512 185.312 512 256c0 70.688-28.658 134.689-74.984 181.016C390.689 483.342 326.688 512 256 512c-70.688 0-134.689-28.658-181.016-74.984C28.658 390.689 0 326.688 0 256c0-70.688 28.658-134.689 74.984-181.016C121.311 28.658 185.312 0 256 0zm159.946 96.054C375.017 55.125 318.465 29.806 256 29.806S136.983 55.125 96.054 96.054 29.806 193.535 29.806 256s25.319 119.017 66.248 159.946S193.535 482.194 256 482.194s119.017-25.319 159.946-66.248S482.194 318.465 482.194 256s-25.319-119.017-66.248-159.946zM276.256 278.19l8.661-43.645h-45.115l-8.664 43.645h45.118z"
                />
              </svg>
              <span>Hashtags</span>
            </div>
            <EditableHashtags
              hashtags={hashtags}
              isEditMode={isEditMode}
              value={tempHashtags}
              onChange={setTempHashtags}
            />
          </div>
        )}

        {/* Transcript */}
        {hasTranscriptField && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <button
              onClick={() => setTranscriptOpen(!transcriptOpen)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 font-medium text-gray-900"
            >
              <span>Transcript</span>
              <ChevronDown
                className={`w-5 h-5 transition-transform ${transcriptOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {transcriptOpen && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                {transcriptionText || 'This video does not contain any transcript'}
              </div>
            )}
          </div>
        )}

        {/* Settings */}
        <div className="bg-white p-6 border border-gray-200 rounded-lg">
          <div className="text-xs uppercase tracking-wide text-gray-700 font-semibold mb-3">
            Settings
          </div>
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
