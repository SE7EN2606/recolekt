import React from 'react';
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

const asString = (v: any) => (typeof v === 'string' ? v : '');
const asArray = (v: any) => (Array.isArray(v) ? v : []);

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
  setTempTitle: (v: string) => void;
  setTempCategory: (v: string) => void;
  setTempTopic: (v: string) => void;
  setTempDescription: (v: string) => void;
  setTempBullets: (
    v: Array<{ headline: string; text: string; emoji?: string }>,
  ) => void;
  setTempHashtags: (v: string[]) => void;
  setServingScale: (v: number) => void;
  setUseMetric: (v: boolean) => void;
  setCaptionOpen: (v: boolean) => void;
  setTranscriptOpen: (v: boolean) => void;
  onReportClick: () => void;
  onDeleteClick: () => void;
  parseQuantity: (qty: string) => { val: string; unit: string };
  scaleQuantity: (qty: string, scale: number) => string;
  convertToMetric: (qty: string) => string;
  convertToImperial: (qty: string) => string;
}

export const VideoDetailDesktop: React.FC<VideoDetailDesktopProps> = (
  props,
) => {
  const {
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
  } = props;

  const { t, showOriginal, toggleLanguage } = useLanguage();

  const summary = viewModel?.summary || {};
  const recipeData = viewModel?.recipe || {};

  const hashtags = asArray(viewModel?.hashtags).length
    ? asArray(viewModel?.hashtags)
    : asArray(summary?.hashtags);

  const titleData = summary?.title;
  const isDualLanguageTitle =
    typeof titleData === 'object' &&
    titleData?.english &&
    titleData?.original;

  const hasRecipeTranslation = !!(
    viewModel.isRecipe &&
    recipeData?.english &&
    recipeData?.original
  );

  const hasTranslation =
    hasRecipeTranslation ||
    isDualLanguageTitle ||
    !!(summary?.english && summary?.original);

  const rawLangCode = recipeData?.language_code || 'en';
  const languageCode =
    rawLangCode.toLowerCase() === 'en' && hasTranslation
      ? 'OG'
      : rawLangCode.toUpperCase();

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

  const activeRecipe =
    showOriginal && hasRecipeTranslation
      ? recipeData.original
      : recipeData.english || recipeData;

  const authorName = viewModel.author_name || viewModel.author || '';
  const getProfileUrl = () => {
    if (!authorName) return '#';
    return `https://www.instagram.com/${authorName.replace('@', '')}/`;
  };

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

  const summaryTextObj =
    viewModel?.summary_text || viewModel?.summary || null;

  const rawBullets = showOriginal
    ? summaryTextObj?.original?.headlines ||
      summaryTextObj?.original?.highlights ||
      summary?.original?.headlines ||
      summary?.headlines ||
      viewModel?.bullets
    : summaryTextObj?.english?.headlines ||
      summaryTextObj?.english?.highlights ||
      summary?.english?.headlines ||
      summary?.headlines ||
      viewModel?.bullets;

  const bulletsForCard = asArray(rawBullets).map((b: any) => {
    if (typeof b === 'string') {
      const emojiMatch = b.match(
        /^([\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D]+)\s*/u,
      );
      const emoji = emojiMatch ? emojiMatch[1] : '•';
      const remaining = b
        .replace(
          /^[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D]+\s*/u,
          '',
        )
        .trim();

      const parts = remaining.split(/\s*[-:]\s*/);
      if (parts.length >= 2) {
        return {
          emoji,
          headline: parts[0].trim(),
          text: parts.slice(1).join(' - ').trim(),
        };
      }
      return { emoji, headline: remaining, text: '' };
    }

    if (b && typeof b === 'object') {
      const headline = asString(b.headline || b.title || b.text || '');
      const text = asString(b.text || b.description || '');
      const emoji = asString(b.emoji || '•');
      return { emoji, headline, text };
    }

    return b;
  });

  const hasSummaryContent = !!(
    summaryTextObj?.english?.summary ||
    summaryTextObj?.original?.summary ||
    summaryTextObj?.english?.headlines?.length ||
    summaryTextObj?.original?.headlines?.length ||
    summaryTextObj?.summary?.english?.summary ||
    summaryTextObj?.summary?.original?.summary ||
    summaryTextObj?.summary?.english?.headlines?.length ||
    summaryTextObj?.summary?.original?.headlines?.length
  );

  return (
    <div className="hidden md:grid md:grid-cols-[1.5fr_1fr] gap-8 items-start">
      {/* LEFT COLUMN: video + title + author + AI summary + recipe */}
      <div className="min-w-0">
        {/* Video preview */}
        <div className="relative w-full aspect-[9/8] bg-black rounded-2xl overflow-hidden shadow-sm border border-gray-100 mb-6 group">
          {/* Top controls */}
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

          {/* Thumbnail */}
          <img
            src={
              viewModel.preview ||
              viewModel.gcs_urls?.preview_thumbnail ||
              ''
            }
            alt={displayTitle}
            className="w-full h-full object-cover opacity-90"
          />

          {/* Language toggle */}
          {hasTranslation && !isEditMode && (
            <button
              onClick={toggleLanguage}
              className={`absolute bottom-3 left-3 px-2 py-1 rounded-lg flex items-center gap-1.5 transition-all z-30 shadow-lg ${
                showOriginal
                  ? 'bg-primary-600 text-white'
                  : 'bg-black/60 text-white backdrop-blur-sm'
              }`}
            >
              <Globe
                size={12}
                className={
                  showOriginal ? 'text-white' : 'text-gray-200'
                }
              />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {showOriginal ? languageCode : 'EN'}
              </span>
            </button>
          )}

          {/* Duration */}
          {viewModel.duration && (
            <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-medium text-white z-20">
              {viewModel.duration}
            </div>
          )}
        </div>

        {/* Title */}
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
          {authorName && (
            <a
              href={getProfileUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 group/author"
            >
              <svg
                className="w-3 h-3 text-pink-500"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
              <span className="text-xs font-medium text-gray-500 truncate group-hover/author:text-gray-900 transition-colors">
                {authorName}
              </span>
            </a>
          )}
          {viewModel.savedAt && (
            <div className="text-xs text-gray-400">
              Saved {viewModel.savedAt}
            </div>
          )}
        </div>

        {/* AI Summary card */}
        {hasSummaryContent && (
          <div className="mb-8">
            <AISummaryCard
              isEditMode={isEditMode}
              value={tempDescription}
              onChange={setTempDescription}
              summaryData={summaryTextObj?.summary || summaryTextObj}
              showOriginal={showOriginal}
            />
          </div>
        )}

        {/* Editable bullets when in edit mode */}
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

        {/* Recipe meta + ingredients + steps */}
        {viewModel.isRecipe && activeRecipe && (
          <div
            className="space-y-6 mb-8"
            key={`recipe-${showOriginal ? 'og' : 'en'}`}
          >
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
              caption={viewModel.caption}  // <-- caption passed here
            />
            <Steps recipe={activeRecipe} showOriginal={showOriginal} />

            {(activeRecipe.tips || []).length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                <h2 className="text-lg font-bold text-amber-900 mb-3">
                  💡 Tips
                </h2>
                <ul className="space-y-2 list-none pl-0">
                  {activeRecipe.tips.map(
                    (tip: string, idx: number) => (
                      <li
                        key={idx}
                        className="text-amber-900 leading-relaxed"
                      >
                        {tip}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Original caption accordion */}
        {viewModel.caption && (
          <div className="mb-8 bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <button
              onClick={() => setCaptionOpen(!captionOpen)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 font-medium text-gray-900"
            >
              <span>Original Caption</span>
              <ChevronDown
                className={`w-5 h-5 transition-transform ${
                  captionOpen ? 'rotate-180' : ''
                }`}
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

      {/* RIGHT COLUMN: category, topic, hashtags, transcript, actions */}
      <div className="space-y-6">
        {/* Category & Topic */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-semibold text-gray-500 uppercase">
                Category
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              {isEditMode ? (
                <input
                  type="text"
                  value={tempCategory}
                  onChange={(e) =>
                    setTempCategory(e.target.value)
                  }
                  placeholder="Category"
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <span className="text-sm font-medium text-gray-900">
                  {viewModel.category || 'Uncategorized'}
                </span>
              )}
            </div>
          </div>

          <div className="h-px bg-gray-100" />

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tags className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-semibold text-gray-500 uppercase">
                Topic
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              {isEditMode ? (
                <input
                  type="text"
                  value={tempTopic}
                  onChange={(e) => setTempTopic(e.target.value)}
                  placeholder="Topic"
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <span className="text-sm font-medium text-gray-900">
                  {viewModel.topic || 'No topic'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Hashtags */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Tags className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-semibold text-gray-500 uppercase">
                Hashtags
              </span>
            </div>
          </div>

          {isEditMode ? (
            <EditableHashtags
              hashtags={hashtags}
              isEditMode={isEditMode}
              value={tempHashtags}
              onChange={setTempHashtags}
            />
          ) : hashtags.length ? (
            <div className="flex flex-wrap gap-2">
              {hashtags.map((tag: string, index: number) => (
                <a
                  key={index}
                  href={`https://www.instagram.com/explore/tags/${tag}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 text-xs bg-violet-100 text-violet-700 font-medium rounded-full hover:bg-violet-200 transition"
                >
                  #{tag}
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              No hashtags detected.
            </p>
          )}
        </div>

        {/* Transcript */}
        {viewModel.transcription && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setTranscriptOpen(!transcriptOpen)}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50"
            >
              <span className="text-xs font-semibold text-gray-500 uppercase">
                Transcript
              </span>
              <ChevronDown
                className={`w-4 h-4 text-gray-500 transition-transform ${
                  transcriptOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {transcriptOpen && (
              <div className="px-5 py-4 border-t border-gray-200 text-xs text-gray-700 max-h-64 overflow-y-auto whitespace-pre-line">
                {viewModel.transcription}
              </div>
            )}
          </div>
        )}

        {/* Actions: modify, delete, source, report */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <button
            onClick={onModifyToggle}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
              isEditMode
                ? 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            <Pencil className="w-4 h-4" />
            <span>{isEditMode ? 'Done Editing' : 'Modify Summary'}</span>
          </button>

          {isEditMode && (
            <button
              onClick={onCancelEdit}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition"
            >
              Cancel
            </button>
          )}

          <div className="h-px bg-gray-100" />

          <button
            onClick={onDeleteClick}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Reel</span>
          </button>

          {viewModel.sourceUrl && (
            <a
              href={viewModel.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 transition"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open on Instagram</span>
            </a>
          )}

          <button
            onClick={onReportClick}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-50 transition"
          >
            <CircleAlert className="w-3 h-3" />
            <span>Report an issue</span>
          </button>
        </div>
      </div>
    </div>
  );
};
