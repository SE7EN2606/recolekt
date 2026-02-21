import React, { useEffect, useMemo, useState } from 'react';
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
  EllipsisVertical,
  FolderClosed,
  FolderOpen,
} from 'lucide-react';
import { MobileBottomNav } from './MobileBottomNav';
import {
  EditableTitle,
  EditableBullets,
  EditableHashtags,
} from './VideoDetailComponents';
import { scaleQuantity } from '../utils/videoUtils';
import { LinkifiedText } from './LinkifiedText';
import { AISummaryCard } from './AISummaryCard';
import { useLanguage } from '../context/LanguageContext';
import { RecipeDetailsCard } from './RecipeDetailsCard';
import { ManageCollectionsModal } from './ManageCollectionsModal';
import { InputModal } from './InputModal';
import { useData } from '../context/DataContext';
import { MobileReelActions } from './MobileReelAction';
import { useTranslation } from 'react-i18next'; // 🔥 IMPORT

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

  onToggleFavorite?: () => void;
  onArchiveToggle?: () => void;
  onMoveToCollection?: () => void;
}

const SYSTEM_FOLDER_IDS = new Set([
  'all',
  'favorites',
  'shared',
  'archive',
  'default',
]);

const isSystemOrAllVideos = (folder: any) => {
  if (!folder) return true;
  const id = String(folder.id ?? '');
  const name = String(folder.name ?? '')
    .trim()
    .toLowerCase();
  const isSystemFlag = Boolean(folder.isSystem);
  return (
    SYSTEM_FOLDER_IDS.has(id) ||
    isSystemFlag ||
    name === 'all videos' ||
    name === 'all'
  );
};

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
  onToggleFavorite,
  onArchiveToggle,
  onMoveToCollection,
}) => {
  const { showOriginal, toggleLanguage } = useLanguage();
  const { folders, addFolder, moveVideos } = useData();
  const { t } = useTranslation(['videoDetail', 'common']); // 🔥 HOOK

  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isReelMenuOpen, setIsReelMenuOpen] = useState(false);
  const [isNewCollectionOpen, setIsNewCollectionOpen] = useState(false);
  const [isMoveCollectionOpen, setIsMoveCollectionOpen] = useState(false);

  const parentOptions =
    (folders || [])
      .filter((f: any) => f && !isSystemOrAllVideos(f))
      .map((f: any) => ({ id: f.id, name: f.name })) || [];

  const handleNewCollection = (name: string, parentId?: string) => {
    if (!name.trim()) return;
    addFolder(name.trim(), parentId);
    setIsNewCollectionOpen(false);
  };

  const handleArchive = () => {
    if (onArchiveToggle) {
      onArchiveToggle();
      return;
    }
    const videoId = viewModel?.id;
    if (!videoId) return;
    moveVideos([videoId], 'archive');
  };

  useEffect(() => {
    setCaptionOpen(false);
  }, [setCaptionOpen]);

  const { displayTitle, activeRecipe, hasTranslation, languageCode } =
    useMemo(() => {
      const summary = viewModel?.summary || {};
      const recipeData = viewModel?.recipe || {};

      const titleData = summary?.title;
      const isDualLanguageTitle =
        typeof titleData === 'object' &&
        titleData?.english &&
        titleData?.original;

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

  const summaryTextObj = viewModel?.summary_text || null;
  const authorName = viewModel.author_name || viewModel.author || '';

  const transcriptionRaw = viewModel?.transcription;
  const transcriptionText =
    typeof transcriptionRaw === 'string'
      ? transcriptionRaw.trim()
      : (transcriptionRaw?.transcript || '').trim();
  const hasTranscriptField =
    transcriptionRaw !== undefined && transcriptionRaw !== null;

  const moveTargets = useMemo(() => {
    const acc: { id: string; name: string; depth: number }[] = [];

    const walk = (list: any[], depth: number) => {
      (Array.isArray(list) ? list : []).forEach((f) => {
        if (!f || isSystemOrAllVideos(f)) return;

        acc.push({ id: String(f.id), name: String(f.name ?? ''), depth });

        if (Array.isArray(f.subFolders) && f.subFolders.length > 0) {
          walk(f.subFolders, depth + 1);
        }
      });
    };

    walk(folders as any[], 0);
    return acc;
  }, [folders]);

  return (
    <div className="md:hidden -mx-4 sm:mx-0">
      {/* Poster */}
      <div
        className="relative w-full aspect-[9/8] bg-black"
        style={{
          marginTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
        }}
      >
        <img
          src={viewModel.preview || viewModel.gcs_urls?.preview_thumbnail || ''}
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

          <div className="flex gap-2">
            <button
              onClick={() => setIsReelMenuOpen(true)}
              className="group w-9 h-9 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center shadow-2xl hover:bg-white/40 transition-colors active:scale-95"
            >
              <span className="inline-flex transform transition-transform duration-200 ease-out">
                <EllipsisVertical
                  size={20}
                  className="lucide lucide-ellipsis-vertical text-white"
                  aria-hidden="true"
                />
              </span>
            </button>
          </div>
        </div>

        {/* Language toggle pill */}
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
            <div className="flex items-center gap-1 text-xs text-gray-500">
              {/* ✅ FIXED: Replaced 'Saved' with the SVG icon */}
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-save">
                <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
                <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/>
                <path d="M7 3v4a1 1 0 0 0 1 1h7"/>
              </svg>
              <span>{viewModel.savedAt}</span>
            </div>
          )}
        </div>

        {/* Edit mode: Cancel/Save buttons */}
        {isEditMode && (
          <div className="mb-4 flex gap-2">
            <button
              onClick={onCancelEdit}
              className="flex-1 flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
            >
              {t('common:cancel')}
            </button>
            <button
              onClick={onModifyToggle}
              className="flex-1 flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-600/20 transition"
            >
              {t('common:save')}
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
                    placeholder={t('videoDetail:category')}
                  />
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  <Tags size={16} className="text-gray-600 flex-shrink-0" />
                  <input
                    type="text"
                    value={tempTopic}
                    onChange={(e) => setTempTopic(e.target.value)}
                    className="min-w-0 flex-1 px-2.5 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder={t('videoDetail:topic')}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="pb-3 mb-3 border-b border-violet-200/70 relative flex items-center">
              <div className="flex flex-col gap-2 pr-10 flex-1">
                <div className="flex items-center gap-2">
                  <Layers size={14} className="flex-shrink-0" style={{ color: '#8b5cf6' }} />
                  <span
                    className="text-xs font-bold uppercase tracking-wide truncate"
                    style={{ color: '#8b5cf6' }}
                  >
                    {viewModel.category}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Tags size={14} className="flex-shrink-0" style={{ color: '#e11d48' }} />
                  <span
                    className="text-xs font-bold uppercase tracking-wide truncate"
                    style={{ color: '#e11d48' }}
                  >
                    {viewModel.topic}
                  </span>
                </div>
              </div>

              <button
                onClick={onModifyToggle}
                className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition"
                title={t('videoDetail:editReel')}
              >
                <Pencil size={14} />
              </button>
            </div>
          )}

          {/* Hashtags Block – header cyan #0891b2 */}
          {((viewModel.hashtags || []) as string[]).length > 0 && (
            <div className="mt-1">
              <div className="flex items-center gap-2 text-xs uppercase font-semibold mb-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 512 512"
                  className="flex-shrink-0"
                  aria-hidden="true"
                  style={{ color: '#0891b2' }}
                >
                  <path
                    fillRule="nonzero"
                    fill="currentColor"
                    d="M300.02 161.657l.047-.187c3.542-14.981 23.176-18.148 31.458-5.532a17.27 17.27 0 012.463 13.038c-2.328 10.088-4.271 20.55-6.386 30.72h12.177c22.801 0 22.804 34.849 0 34.849h-19.383l-8.664 43.645h30.453c22.935 0 22.926 34.846 0 34.846h-37.597l-7.847 37.682c-5.447 21.855-38.479 14.339-33.876-7.694 2.271-9.85 4.177-20.06 6.245-29.988h-45.112c-2.556 12.304-4.897 25.01-7.741 37.203-5.282 22.331-38.129 14.224-33.971-7.243l6.239-29.991-16.242.003c-22.9.135-22.956-34.818 0-34.818h23.404l8.614-43.645h-34.49c-22.521 0-23.232-34.849 0-34.849h41.693l7.731-37.144c.051-.403.138-.797.26-1.176 5.329-21.289 38.485-14.721 33.877 7.672l-6.39 30.648h45.113c2.635-12.65 5.447-25.37 7.925-38.039zM256 0c70.688 0 134.689 28.658 181.016 74.984C483.342 121.311 512 185.312 512 256c0 70.688-28.658 134.689-74.984 181.016C390.689 483.342 326.688 512 256 512c-70.688 0-134.689-28.658-181.016-74.984C28.658 390.689 0 326.688 0 256c0-70.688 28.658-134.689 74.984-181.016C121.311 28.658 185.312 0 256 0zm159.946 96.054C375.017 55.125 318.465 29.806 256 29.806S136.983 55.125 96.054 96.054 29.806 193.535 29.806 256s25.319 119.017 66.248 159.946S193.535 482.194 256 482.194s119.017-25.319 159.946-66.248S482.194 318.465 482.194 256s-25.319-119.017-66.248-159.946zM276.256 278.19l8.661-43.645h-45.115l-8.664 43.645h45.118z"
                  />
                </svg>
                <span style={{ color: '#0891b2' }}>{t('videoDetail:hashtags')}</span>
              </div>

              <style>{`
                .hashtag-links a {
                  display: inline-flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                  padding: 0.375rem 0.9rem !important;
                  border-radius: 9999px !important;
                  background-color: #e0f2fe !important;
                  color: #075985 !important;
                  border: 1px solid #7dd3fc !important;
                  font-size: 0.75rem !important;
                  font-weight: 700 !important;
                  box-shadow: 0 1px 2px rgba(8, 145, 178, 0.15) !important;
                  text-decoration: none !important;
                }
                .hashtag-links a:hover {
                  background-color: #bae6fd !important;
                  border-color: #38bdf8 !important;
                  box-shadow: 0 2px 6px rgba(8, 145, 178, 0.25) !important;
                  transform: translateY(-1px);
                }
              `}</style>

              <div className="hashtag-links flex flex-wrap gap-2">
                <EditableHashtags
                  hashtags={viewModel.hashtags || []}
                  isEditMode={isEditMode}
                  value={tempHashtags}
                  onChange={setTempHashtags}
                  mobile
                />
              </div>
            </div>
          )}
        </div>

        {/* AI Summary Card */}
        {summaryTextObj && (
          <AISummaryCard
            isEditMode={isEditMode}
            value={tempDescription}
            onChange={setTempDescription}
            summaryData={summaryTextObj}
            showOriginal={showOriginal}
          />
        )}

        {/* Bullets (edit mode only) */}
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

        {/* Recipe Section */}
        {viewModel.isRecipe && activeRecipe && (
          <div className="mb-5" key={`recipe-${showOriginal}`}>
            <RecipeDetailsCard
              recipe={activeRecipe}
              servingScale={servingScale}
              scaleQuantity={scaleQuantity}
              onServingScaleChange={setServingScale}
            />
          </div>
        )}

        {/* Original Caption */}
        {viewModel.caption && (
          <div className="mb-4 bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <button
              onClick={() => setCaptionOpen(!captionOpen)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 text-sm font-bold text-gray-900"
            >
              {t('videoDetail:originalCaption')}
              <ChevronDown
                size={16}
                className={`transition-transform ${captionOpen ? 'rotate-180' : ''}`}
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
        {hasTranscriptField && (
          <div className="mb-6 bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <button
              onClick={() => setTranscriptOpen(!transcriptOpen)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 text-sm font-bold text-gray-900"
            >
              {t('videoDetail:transcript')}
              <ChevronDown
                size={16}
                className={`transition-transform ${transcriptOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {transcriptOpen && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {transcriptionText || t('videoDetail:noTranscript')}
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
              {t('videoDetail:reportIssue')}
            </button>

            <button
              onClick={onDeleteClick}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-red-600 bg-red-50 border border-red-200 rounded-xl font-medium text-xs"
            >
              <Trash2 size={16} />
              {t('common:delete')}
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
            {t('videoDetail:viewOnInstagram')}
          </a>
        )}
      </div>

      {/* Reel actions bottom sheet */}
      <MobileReelActions
        isOpen={isReelMenuOpen}
        onClose={() => setIsReelMenuOpen(false)}
        onShare={onShare}
        onAddToFavorites={onToggleFavorite ?? (() => {})}
        onMoveToCollection={() => {
          if (onMoveToCollection) onMoveToCollection();
          else setIsMoveCollectionOpen(true);
        }}
        onArchive={handleArchive}
        onManageCollections={() => {
          setIsManageOpen(true);
        }}
        onReport={onReportClick}
        onDelete={onDeleteClick}
      />

      {/* Move to Collection – centered modal */}
      {isMoveCollectionOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => setIsMoveCollectionOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-md px-4">
            <div className="bg-white w-full rounded-3xl shadow-2xl overflow-hidden">
              <div className="px-6 pt-5 pb-3 border-b border-gray-100">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.25em]">
                  {t('videoDetail:moveToCollection')}
                </h3>
              </div>

              <div className="max-h-[60vh] overflow-y-auto p-4 space-y-1">
                {moveTargets.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 px-2">
                    {t('videoDetail:noCollections')}
                  </p>
                ) : (
                  moveTargets.map((folder) => {
                    const Icon = folder.depth === 0 ? FolderClosed : FolderOpen;

                    return (
                      <button
                        key={folder.id}
                        onClick={() => {
                          const videoId = viewModel?.id;
                          if (videoId) {
                            moveVideos([videoId], folder.id);
                          }
                          setIsMoveCollectionOpen(false);
                        }}
                        className={`w-full flex items-center group py-2 px-2 rounded-lg hover:bg-gray-50 text-left ${
                          folder.depth > 0 ? 'ml-6 border-l border-gray-100' : ''
                        }`}
                      >
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                          <Icon size={16} className="text-primary-600 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-700 truncate">
                            {folder.name}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <button
                onClick={() => setIsMoveCollectionOpen(false)}
                className="w-full p-4 border-t border-gray-100 text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
              >
                {t('common:cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Collection input */}
      <InputModal
        isOpen={isNewCollectionOpen}
        onClose={() => setIsNewCollectionOpen(false)}
        onSubmit={handleNewCollection}
        title={t('videoDetail:newCollection')}
        placeholder={t('videoDetail:nameCollection')}
        parentOptions={parentOptions}
      />

      {/* Manage Collections modal – overlay above sheet */}
      {isManageOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => setIsManageOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-md px-4">
            <ManageCollectionsModal
              isOpen={isManageOpen}
              onClose={() => setIsManageOpen(false)}
            />
          </div>
        </div>
      )}

      <MobileBottomNav onAddClick={() => {}} />
    </div>
  );
};