import React, { useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  Pencil,
  CircleAlert,
  Trash2,
  Layers,
  Tags,
  Globe,
} from 'lucide-react';
import { RecipeMeta, Ingredients, Steps } from './RecipeComponents';
import { MobileBottomNav } from './MobileBottomNav';
import {
  EditableTitle,
  EditableBullets,
  EditableHashtags,
} from './VideoDetailComponents';
import {
  parseQuantity,
  convertToMetric,
  scaleQuantity,
} from '../utils/videoUtils';
import { LinkifiedText } from './LinkifiedText';
import { IOSShareIcon } from './VideoIcons';
import { AISummaryCard } from './AISummaryCard';
import { useLanguage } from '../context/LanguageContext';

interface VideoDetailMobileProps {
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
    value: Array<{ headline: string; text: string; emoji?: string }>
  ) => void;
  setTempHashtags: (value: string[]) => void;
  setServingScale: (value: number) => void;
  setUseMetric: (value: boolean) => void;
  setCaptionOpen: (value: boolean) => void;
  setTranscriptOpen: (value: boolean) => void;
  onReportClick: () => void;
  onDeleteClick: () => void;
}

export const VideoDetailMobile: React.FC<VideoDetailMobileProps> = ({
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
}) => {
  const { showOriginal, toggleLanguage } = useLanguage();

  // Close caption by default when opening the page
  useEffect(() => {
    setCaptionOpen(false);
  }, [setCaptionOpen]);

  // Mirror desktop logic for title, activeRecipe, languageCode, hasTranslation
  const {
    displayTitle,
    activeRecipe,
    hasTranslation,
    languageCode,
  } = useMemo(() => {
    const summary = viewModel?.summary || {};
    const recipeData = viewModel?.recipe || {};

    const titleData = summary?.title;
    const isDualLanguageTitle =
      typeof titleData === 'object' && titleData?.english && titleData?.original;

    const hasRecipeTranslation =
      !!(viewModel.isRecipe && recipeData?.english && recipeData?.original);

    const hasSummaryTranslation = !!(summary?.english && summary?.original);

    const hasTranslationComputed =
      hasRecipeTranslation || isDualLanguageTitle || hasSummaryTranslation;

    const rawLangCode = recipeData?.language_code || 'en';
    const languageCodeComputed =
      rawLangCode.toLowerCase() === 'en' && hasTranslationComputed
        ? 'OG'
        : rawLangCode.toUpperCase();

    let displayTitleComputed = viewModel?.title || '';

    if (showOriginal) {
      if (hasRecipeTranslation && recipeData?.original?.title) {
        displayTitleComputed = recipeData.original.title;
      } else if (summary?.original?.title) {
        displayTitleComputed = summary.original.title;
      } else if (
        isDualLanguageTitle &&
        typeof titleData === 'object' &&
        titleData.original
      ) {
        displayTitleComputed = titleData.original;
      }
    } else {
      if (hasRecipeTranslation && recipeData?.english?.title) {
        displayTitleComputed = recipeData.english.title;
      } else if (summary?.english?.title) {
        displayTitleComputed = summary.english.title;
      }
    }

    const activeRecipeComputed =
      showOriginal && hasRecipeTranslation
        ? recipeData.original
        : recipeData.english || recipeData;

    return {
      displayTitle: displayTitleComputed,
      activeRecipe: activeRecipeComputed,
      hasTranslation: hasTranslationComputed,
      languageCode: languageCodeComputed,
    };
  }, [viewModel, showOriginal]);

  // Use same source as desktop for AI summary + highlights
  const summaryTextObj =
    viewModel?.summary_text || viewModel?.summary || null;

  const authorName = viewModel.author_name || viewModel.author || '';

  return (
    <div className="md:hidden -mx-4 sm:mx-0">
      {/* Poster: adjust marginTop to tune the gap under the header */}
      <div
        className="relative w-full aspect-[9/8] bg-black"
        style={{ marginTop: '0.5rem' }}
      >
        <img
          src={
            viewModel.preview ||
            viewModel.gcs_urls?.preview_thumbnail ||
            ''
          }
          alt={displayTitle}
          className="w-full h-full object-cover opacity-90"
          style={{
            willChange: 'transform',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
          }}
        />

        {/* Top overlay buttons */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start bg-gradient-to-b from-black/60 to-transparent">
          <button
            onClick={onNavigateBack}
            className="group w-9 h-9 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center shadow-2xl hover:bg-white/40 transition-colors"
          >
            <span className="inline-flex transform transition-transform duration-200 ease-out">
              <ArrowLeft size={18} />
            </span>
          </button>

          <button
            onClick={onShare}
            className="group w-9 h-9 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center shadow-2xl hover:bg-white/40 transition-colors"
          >
            <span className="inline-flex transform transition-transform duration-200 ease-out">
              <IOSShareIcon size={18} />
            </span>
          </button>
        </div>

        {/* Language toggle pill – purple background */}
        {hasTranslation && !isEditMode && (
          <button
            onClick={toggleLanguage}
            className="absolute bottom-3 left-3 px-2 py-1 rounded-lg flex items-center gap-1.5 transition-all z-30 shadow-lg bg-[#7c3aed] text-white"
          >
            <Globe size={12} className="text-white" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {showOriginal ? languageCode : 'EN'}
            </span>
          </button>
        )}

        {viewModel.duration && viewModel.duration !== '0:00' && (
          <div className="absolute bottom-3 right-3 bg-black/80 text-white text-xs px-2 py-1 rounded">
            {viewModel.duration}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 pt-5 pb-16">
        <div className="mb-3">
          <EditableTitle
            title={displayTitle}
            isEditMode={isEditMode}
            value={tempTitle}
            onChange={setTempTitle}
            mobile
          />
        </div>

        <div className="flex items-center justify-between mb-4">
          {authorName ? (
            <a
              href={`https://www.instagram.com/${String(authorName).replace(
                '@',
                '',
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 group/author"
            >
              <svg
                className="w-3 h-3 text-pink-500 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
              <span className="text-sm font-medium text-gray-500 truncate group-hover/author:text-gray-900 transition-colors">
                {String(authorName).replace('@', '')}
              </span>
            </a>
          ) : (
            <span />
          )}
          {viewModel.savedAt && (
            <span className="text-xs text-gray-500">{viewModel.savedAt}</span>
          )}
        </div>

        {/* Edit mode: Cancel/Save buttons at top */}
        {isEditMode && (
          <div className="mb-4 flex gap-2">
            <button
              onClick={onCancelEdit}
              className="flex-1 flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
            >
              Cancel
            </button>
            <button
              onClick={onModifyToggle}
              className="flex-1 flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-600/20 transition"
            >
              Save Changes
            </button>
          </div>
        )}

        {/* Purple block with Category, Topic, Hashtags & Edit button */}
        <div className="mb-5 bg-violet-50 border border-violet-200 rounded-xl overflow-hidden p-4">
          {isEditMode ? (
            <div className="pb-3 mb-3 border-b border-violet-200/70">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Layers size={16} className="text-primary-600 flex-shrink-0" />
                  <input
                    type="text"
                    value={tempCategory}
                    onChange={(e) => setTempCategory(e.target.value)}
                    className="min-w-0 flex-1 px-2.5 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Category"
                  />
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  <Tags size={16} className="text-gray-600 flex-shrink-0" />
                  <input
                    type="text"
                    value={tempTopic}
                    onChange={(e) => setTempTopic(e.target.value)}
                    className="min-w-0 flex-1 px-2.5 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Topic"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="pb-3 mb-3 border-b border-violet-200/70 relative flex items-center">
              <div className="flex flex-col gap-2 pr-10 flex-1">
                <div className="flex items-center gap-2">
                  <Layers
                    size={14}
                    className="flex-shrink-0"
                    style={{ color: '#8b5cf6' }}
                  />
                  <span
                    className="text-xs font-bold uppercase tracking-wide truncate"
                    style={{ color: '#8b5cf6' }}
                  >
                    {viewModel.category}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Tags
                    size={14}
                    className="flex-shrink-0"
                    style={{ color: '#f43f5e' }}
                  />
                  <span
                    className="text-xs font-bold uppercase tracking-wide truncate"
                    style={{ color: '#f43f5e' }}
                  >
                    {viewModel.topic}
                  </span>
                </div>
              </div>

              <button
                onClick={onModifyToggle}
                className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition"
                title="Edit Details"
              >
                <Pencil size={14} />
              </button>
            </div>
          )}

          {/* Hashtags */}
          {((viewModel.hashtags || []) as string[]).length > 0 && (
            <div className="flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 512 512"
                fill="#DC5204"
                className="flex-shrink-0"
              >
                <path
                  fillRule="nonzero"
                  d="M300.02 161.657l.047-.187c3.542-14.981 23.176-18.148 31.458-5.532a17.27 17.27 0 012.463 13.038c-2.328 10.088-4.271 20.55-6.386 30.72h12.177c22.801 0 22.804 34.849 0 34.849h-19.383l-8.664 43.645h30.453c22.935 0 22.926 34.846 0 34.846h-37.597l-7.847 37.682c-5.447 21.855-38.479 14.339-33.876-7.694 2.271-9.85 4.177-20.06 6.245-29.988h-45.112c-2.556 12.304-4.897 25.01-7.741 37.203-5.282 22.331-38.129 14.224-33.971-7.243l6.239-29.991-16.242.003c-22.9.135-22.956-34.818 0-34.818h23.404l8.614-43.645h-34.49c-22.521 0-23.232-34.849 0-34.849h41.693l7.731-37.144c.051-.403.138-.797.26-1.176 5.329-21.289 38.485-14.721 33.877 7.672l-6.39 30.648h45.113c2.635-12.65 5.447-25.37 7.925-38.039zM256 0c70.688 0 134.689 28.658 181.016 74.984C483.342 121.311 512 185.312 512 256c0 70.688-28.658 134.689-74.984 181.016C390.689 483.342 326.688 512 256 512c-70.688 0-134.689-28.658-181.016-74.984C28.658 390.689 0 326.688 0 256c0-70.688 28.658-134.689 74.984-181.016C121.311 28.658 185.312 0 256 0zm159.946 96.054C375.017 55.125 318.465 29.806 256 29.806S136.983 55.125 96.054 96.054 29.806 193.535 29.806 256s25.319 119.017 66.248 159.946S193.535 482.194 256 482.194s119.017-25.319 159.946-66.248S482.194 318.465 482.194 256s-25.319-119.017-66.248-159.946zM276.256 278.19l8.661-43.645h-45.115l-8.664 43.645h45.118z"
                />
              </svg>

              <div className="flex-1 min-w-0">
                <style>{`
                  .hashtag-links a {
                    background-color: #FFFFFF !important;
                    color: #FB6A18 !important;
                    border-radius: 9999px !important;
                    padding: 0.15rem 0.6rem !important;
                    border: 1px solid #FB6A18 !important;
                  }
                  .hashtag-links a:hover {
                    background-color: #FB6A18 !important;
                    color: #FFFFFF !important;
                  }
                `}</style>
                <div className="hashtag-links">
                  <EditableHashtags
                    hashtags={viewModel.hashtags || []}
                    isEditMode={isEditMode}
                    value={tempHashtags}
                    onChange={setTempHashtags}
                    mobile
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* AI Summary Card – summary text + highlights track language like desktop */}
        {summaryTextObj && (
          <AISummaryCard
            isEditMode={isEditMode}
            value={tempDescription}
            onChange={setTempDescription}
            summaryData={summaryTextObj?.summary || summaryTextObj}
            showOriginal={showOriginal}
          />
        )}

        {/* Bullets (edit mode only; these are your manual bullets, not AI highlights) */}
        {isEditMode && (
          <div className="mb-5">
            <EditableBullets
              bullets={viewModel.bullets || []}
              isEditMode={isEditMode}
              value={tempBullets}
              onChange={setTempBullets}
              mobile
            />
          </div>
        )}

        {/* Recipe Section – uses activeRecipe so it follows the language toggle */}
        {viewModel.isRecipe && activeRecipe && (
          <div className="space-y-3 mb-5" key={`recipe-${showOriginal}`}>
            <RecipeMeta
              recipe={activeRecipe}
              servingScale={servingScale}
              setServingScale={setServingScale}
              mobile
            />
            <Ingredients
              recipe={activeRecipe}
              servingScale={servingScale}
              useMetric={useMetric}
              setUseMetric={setUseMetric}
              scaleQuantity={scaleQuantity}
              convertToMetric={convertToMetric}
              parseQuantity={parseQuantity}
              mobile
            />
            <Steps recipe={activeRecipe} mobile />

            {activeRecipe.tips?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <h3 className="text-xs font-bold text-amber-900 mb-1.5">
                  💡 Tips
                </h3>
                <ul className="space-y-1">
                  {activeRecipe.tips.map((tip: string, idx: number) => (
                    <li
                      key={idx}
                      className="text-xs text-amber-900 leading-relaxed"
                    >
                      • {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Original Caption */}
        {viewModel.caption && (
          <div className="mb-4 bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <button
              onClick={() => setCaptionOpen(!captionOpen)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 text-sm font-bold text-gray-900"
            >
              Original Caption
              <ChevronDown
                size={16}
                className={`transition-transform ${
                  captionOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {captionOpen && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                <LinkifiedText text={viewModel.caption} />
              </div>
            )}
          </div>
        )}

        {/* Transcript */}
        {viewModel.transcription && (
          <div className="mb-6 bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <button
              onClick={() => setTranscriptOpen(!transcriptOpen)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 text-sm font-bold text-gray-900"
            >
              Transcript
              <ChevronDown
                size={16}
                className={`transition-transform ${
                  transcriptOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {transcriptOpen && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {viewModel.transcription}
              </div>
            )}
          </div>
        )}

        {/* Report & Delete buttons */}
        {!isEditMode && (
          <div className="mb-3 grid grid-cols-2 gap-3">
            <button
              onClick={onReportClick}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gray-100 text-gray-700 border border-gray-200 rounded-xl font-medium text-xs"
            >
              <CircleAlert size={16} />
              Report Issue
            </button>

            <button
              onClick={onDeleteClick}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-red-600 bg-red-50 border border-red-200 rounded-xl font-medium text-xs"
            >
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        )}

        {/* Instagram button */}
        {!isEditMode && viewModel.sourceUrl && (
          <a
            href={viewModel.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white rounded-xl text-sm font-bold shadow-md"
          >
            <ExternalLink size={16} className="text-white" />
            Open on Instagram
          </a>
        )}
      </div>

      <MobileBottomNav onAddClick={() => {}} />
    </div>
  );
};
