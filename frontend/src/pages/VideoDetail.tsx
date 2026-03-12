import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, ChevronDown, Heart, FolderInput, AlertCircle, X, EllipsisVertical, Archive, AlignLeft, Pencil, Save, Globe, Folder, Clock, Activity, Flame, Dumbbell, Lightbulb } from 'lucide-react';
import { useData } from '../context/DataContext';
import { getAuthHeaders } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ActionSheet, ActionItem } from '../components/ActionSheet';
import { MoveCollectionModal } from '../components/MoveCollectionModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { ReportModal } from '../components/ReportModal';
import { EditableTitle, EditableBullets, EditableHashtags } from '../components/VideoDetailComponents';
import { RecipeDetailsCard } from '../components/RecipeDetailsCard';
import { scaleQuantity } from '../utils/conversionUtils';
import { useTranslation } from 'react-i18next';
import { getCategory, getTopic } from '../utils/videoUtils';
import { API_BASE } from '../utils/api';
import { useScrollLock } from '../utils/useScrollLock';

/* ─── IMPORTED EXTERNAL ICONS ─── */
import { 
  CustomMessageSquareMoreIcon, 
  IOSShareIcon, 
  CategoryIcon, 
  TopicIcon, 
  HashtagsIcon, 
  PlatformIconAuthor, 
  PlatformIconBtn 
} from '../components/CustomIcons';

/* ─── LOCAL HELPERS ─── */
const formatDuration = (val: number | string | undefined): string => {
  if (!val) return '0:00';
  if (typeof val === 'string') {
    if (val.includes(':')) return val;
    const parsed = parseInt(val, 10);
    if (isNaN(parsed)) return '0:00';
    val = parsed;
  }
  const mins = Math.floor(val / 60);
  const secs = Math.floor(val % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

function apiUrl(path: string) {
  const p = String(path || '').replace(/^\/+/, '');
  return API_BASE ? `${API_BASE}/${p}` : `/${p}`;
}

async function fetchGcsJson(url: string) {
  if (!url) return null;
  try {
    const res = await fetch(url + `?v=${Date.now()}`, {
      method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store'
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

const safeString = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return safeString(val[0]);
  if (typeof val === 'object') return String(val.text || val.title || val.summary || val.transcript || val.caption || val.headline || val.name || '');
  return String(val);
};

/* ─── SKELETON LOADER ─── */
const VideoDetailSkeleton = () => (
  <div className="animate-pulse relative w-full px-0 pb-12">
    <div className="flex flex-col md:grid md:grid-cols-[1.5fr_1fr] md:gap-12 items-start">
      <div className="min-w-0 w-full">
        <div className="w-full aspect-[9/8] bg-gray-200/80 rounded-2xl mb-6 mt-[calc(env(safe-area-inset-top,0px)+0.75rem)] md:mt-0"></div>
        <div className="h-10 bg-gray-200/80 rounded-lg w-3/4 mb-4"></div>
      </div>
    </div>
  </div>
);

/* ─── WORKOUT BLOCK COMPONENT ─── */
const WorkoutBlock = ({ workoutData, showOriginal }: { workoutData: any, showOriginal: boolean }) => {
  const { t } = useTranslation(['videoDetail']);

  const activeWorkout = showOriginal && workoutData?.original 
    ? workoutData.original 
    : (workoutData?.french || workoutData?.translated || workoutData);

  if (!activeWorkout || Object.keys(activeWorkout).length === 0) return null;

  return (
    <div className="bg-white border border-gray-100 rounded-[24px] shadow-sm overflow-hidden mt-4 mb-6">
      <div className="bg-orange-100/60 p-4 md:p-5 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Dumbbell className="text-orange-600" size={20} />
          <h3 className="font-bold text-gray-900 text-lg">
            {t('videoDetail:workoutDetails', 'Plan d\'entraînement')}
          </h3>
        </div>
      </div>
      
      <div className="grid grid-cols-3 divide-x divide-gray-50 border-b border-gray-50">
        <div className="p-4 flex flex-col items-center justify-center text-center gap-1">
          <Clock size={16} className="text-orange-500 mb-1" />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('videoDetail:time', 'Durée')}</span>
          <span className="text-sm font-bold text-gray-900">{activeWorkout.duration || '—'}</span>
        </div>
        <div className="p-4 flex flex-col items-center justify-center text-center gap-1">
          <Activity size={16} className="text-orange-500 mb-1" />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('videoDetail:format', 'Format')}</span>
          <span className="text-sm font-bold text-gray-900">{activeWorkout.format || '—'}</span>
        </div>
        <div className="p-4 flex flex-col items-center justify-center text-center gap-1">
          <Flame size={16} className="text-orange-500 mb-1" />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('videoDetail:level', 'Niveau')}</span>
          <span className="text-sm font-bold text-gray-900">{activeWorkout.level || '—'}</span>
        </div>
      </div>

      {activeWorkout.equipment && activeWorkout.equipment.length > 0 && (
        <div className="p-6 border-b border-gray-50">
          <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">{t('videoDetail:equipment', 'Équipement')}</h4>
          <div className="flex flex-wrap gap-2">
            {activeWorkout.equipment.map((eq: string, i: number) => (
              <div key={i} className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-bold">
                {eq}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeWorkout.groups && activeWorkout.groups.length > 0 && (
        <div className="p-6 bg-gray-50/30">
          <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">{t('videoDetail:exercises', 'Circuit / Exercices')}</h4>
          <div className="space-y-6">
            {activeWorkout.groups.map((group: any, idx: number) => (
              <div key={idx} className="relative">
                {idx > 0 && <div className="absolute -top-3 left-0 right-0 border-t border-dashed border-gray-200" />}
                
                {group.title && (
                  <h5 className="font-bold text-gray-900 text-sm bg-white border border-gray-200 shadow-sm inline-block px-3 py-1.5 rounded-lg mb-4">
                    {group.title}
                  </h5>
                )}

                <ul className="space-y-4">
                  {group.items && group.items.map((item: any, i: number) => {
                    let infoText = item.info || '';
                    infoText = infoText.replace(/min(?:ute)?\s*\d+/i, '').trim();
                    infoText = infoText.replace(/^[-/]\s*/, '').replace(/\s*[-/]$/, '').trim();

                    return (
                      <li key={i} className="flex items-start gap-3">
                        <div className="w-6 flex justify-center flex-shrink-0 pt-[0.1rem]">
                          <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-black">
                            {i + 1}
                          </div>
                        </div>
                        <div className="text-sm font-medium text-gray-600 leading-relaxed pt-[2px] flex flex-wrap items-baseline flex-1">
                          {infoText && <span className="text-orange-600 font-bold mr-2">{infoText}</span>}
                          <span className="text-gray-900 font-bold">{item.name}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {(activeWorkout.tips?.length > 0) && (
        <div className="bg-yellow-50/50 border-t border-yellow-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="text-yellow-600" size={18} />
            <h4 className="text-xs font-black text-yellow-700 uppercase tracking-widest">
              {t('videoDetail:trainerTips', 'Conseils du coach')}
            </h4>
          </div>
          <ul className="space-y-2">
            {activeWorkout.tips.map((tip: string, i: number) => (
              <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                <div className="w-6 flex justify-center flex-shrink-0 mt-0.5">
                  <span className="text-yellow-500 font-bold text-lg leading-none">•</span>
                </div>
                <span className="italic flex-1 pt-[1px]">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export const VideoDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { videos, folders, deleteVideos, moveVideos, toggleFavorite, updateVideo, getVideoById } = useData();
  const { showOriginal, toggleLanguage } = useLanguage();
  const { t } = useTranslation(['videoDetail', 'common']);

  const [video, setVideo] = useState<any>(null);
  const [galleryThumbnail, setGalleryThumbnail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  // Collapse States
  const [isCaptionOpen, setIsCaptionOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [isMobileTranscriptOpen, setIsMobileTranscriptOpen] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editedVideo, setEditedVideo] = useState<any | null>(null);
  const [servingScale, setServingScale] = useState(1);
  const [useMetric, setUseMetric] = useState(true);

  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  useScrollLock(isActionSheetOpen || isMoveModalOpen || isReportModalOpen || isDeleteConfirmOpen);

  const fetchBackendJsonNoStore = useCallback(async (url: string) => {
    const res = await fetch(url, { method: 'GET', cache: 'no-store', credentials: 'include', headers: { ...getAuthHeaders() } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, []);

  const enrichVideo = useCallback(async () => {
    if (!id) return;
    if (!navigator.onLine) {
        setLoading(false);
        return;
    }

    try {
      const dbResult = await fetchBackendJsonNoStore(apiUrl(`api/reel/${encodeURIComponent(id)}`));
      if (!dbResult) { setLoading(false); return; }

      let gcsResult = null;
      if (dbResult.gcs_urls?.result_json) {
        gcsResult = await fetchGcsJson(dbResult.gcs_urls.result_json);
      }

      setVideo((prev: any) => ({
        ...(prev || {}),
        ...dbResult,
        ...(gcsResult || {}),
        __raw: dbResult,
        thumbnailUrl:
          dbResult.thumbnailUrl ||
          dbResult.gcs_urls?.preview_thumbnail ||
          (prev?.thumbnailUrl || ''),
      }));
    } catch (err) {
      console.error("Enrichment error", err);
    } finally {
      setLoading(false);
    }
  }, [id, fetchBackendJsonNoStore]);

  useEffect(() => {
    if (!id) return;
    const cached = getVideoById(id) || videos.find((v: any) => v.id === id);
    if (cached) {
      setVideo(cached);
      const thumb =
        (cached as any).thumbnailUrl ||
        (cached as any).thumbnail_url ||
        (cached as any).gcs_urls?.preview_thumbnail || '';
      if (thumb) setGalleryThumbnail(thumb);
    }
  }, [id, videos, getVideoById]);

  const fetchedId = useRef<string | null>(null);
  useEffect(() => { if (id && fetchedId.current !== id) { fetchedId.current = id; enrichVideo(); } }, [id, enrichVideo]);
  useEffect(() => { if (isEditing && video) setEditedVideo(JSON.parse(JSON.stringify(video))); }, [isEditing, video]);

  const handleEditField = (field: string, value: any) => {
    setEditedVideo((prev: any) => {
      if (!prev) return prev;
      const next = { ...prev };
      let summaryObj = next.summary;
      if (typeof summaryObj === 'string') { try { summaryObj = JSON.parse(summaryObj); } catch(e) { summaryObj = { english: { summary: summaryObj }}; } }
      if (!summaryObj) summaryObj = {};
      const langKey = showOriginal && !!(summaryObj.english && summaryObj.original) ? 'original' : 'english';
      if (!summaryObj[langKey]) summaryObj[langKey] = {};

      if (field === 'title') { next.title = value; summaryObj[langKey].title = value; }
      else if (field === 'summary') { next.summary_text = value; summaryObj[langKey].summary = value; }
      else if (field === 'bullets') { next.bullets = value; summaryObj[langKey].headlines = value; }
      else if (field === 'category') { next.category = value; next.summary_category = value; }
      else if (field === 'topic') { next.topic = value; next.summary_topic = value; next.subCategory = value; }
      else if (field === 'tags') { next.tags = value; summaryObj[langKey].hashtags = value; }
      next.summary = summaryObj;
      return next;
    });
  };

  const handleToggleFavorite = () => toggleFavorite(video.id);
  const handleArchive = () => { moveVideos([video.id], 'archive'); setIsActionSheetOpen(false); };
  const handleDelete = () => { deleteVideos([video.id]); setIsDeleteConfirmOpen(false); navigate('/gallery'); };
  const handleSaveEdit = () => { if (editedVideo && video) { if (typeof updateVideo === 'function') updateVideo(video.id, editedVideo); setVideo(editedVideo); setIsEditing(false); } };
  const handleShare = async () => { if (navigator.share) { try { await navigator.share({ title: video.title, url: window.location.href }); } catch (err) {} } else { await navigator.clipboard.writeText(window.location.href); alert(t('videoDetail:linkCopied', 'Link copied!')); } };

  // ✅ REORDERED MENU ACTIONS: Delete is up, Report is down
  const actionItems: ActionItem[] = [
    { icon: IOSShareIcon, label: t('videoDetail:share', "Partager la vidéo"), onClick: handleShare },
    { icon: Pencil, label: t('videoDetail:editReel', "Modifier les détails"), onClick: () => setIsEditing(true) },
    { icon: Heart, label: video?.isFavorite ? t('videoDetail:removeFromFavorites', "Retirer des favoris") : t('videoDetail:addToFavorites', "Add to Favorites"), onClick: handleToggleFavorite, variant: video?.isFavorite ? 'default' : 'primary' },
    { icon: FolderInput, label: t('videoDetail:moveToCollection', "Déplacer vers une collection"), onClick: () => setIsMoveModalOpen(true) },
    { icon: Archive, label: t('videoDetail:archive', "Archiver la vidéo"), onClick: handleArchive },
    { icon: Trash2, label: t('videoDetail:deleteReel', "Supprimer le clip"), onClick: () => setIsDeleteConfirmOpen(true), variant: 'danger' },
    { icon: AlertCircle, label: t('videoDetail:reportIssue', "Signaler un problème"), onClick: () => setIsReportModalOpen(true) }
  ];

  const findFolderById = (targetId: string, folderList: any[]): any | null => {
    for (const folder of folderList) {
      if (folder.id === targetId) return folder;
      if (folder.subFolders?.length) {
        const found = findFolderById(targetId, folder.subFolders);
        if (found) return found;
      }
    }
    return null;
  };

  const folderName = useMemo(() => {
    const fid = video?.folderId || video?.folder_id || video?.folderid;
    if (!fid || fid === 'all' || fid === 'unsorted' || fid === 'default') return null;
    return findFolderById(fid, folders || [])?.name ?? null;
  }, [video, folders]);

  const viewModel = useMemo(() => {
    if (!video) return null;
    const v = isEditing && editedVideo ? editedVideo : video;

    let summaryObj = v.summary;
    if (typeof summaryObj === 'string') { try { summaryObj = JSON.parse(summaryObj); } catch(e) { summaryObj = {}; } }
    if (!summaryObj) summaryObj = {};

    const englishData = summaryObj.english || {};
    const originalData = summaryObj.original || {};
    const langBlock = (showOriginal && Object.keys(originalData).length > 0) ? originalData : (Object.keys(englishData).length > 0 ? englishData : summaryObj);

    let recipeData = v.recipe;
    if (typeof recipeData === 'string') { try { recipeData = JSON.parse(recipeData); } catch (e) { recipeData = null; } }
    if (recipeData && recipeData.recipe) recipeData = recipeData.recipe;
    let activeRecipe = null;
    if (recipeData && Object.keys(recipeData).length > 0) activeRecipe = showOriginal && recipeData.original ? recipeData.original : (recipeData.english || recipeData);

    let workoutData = v.workout;
    if (typeof workoutData === 'string') {
      try { workoutData = JSON.parse(workoutData); } catch (e) { workoutData = null; }
    }
    if (workoutData && Object.keys(workoutData).length === 0) {
      workoutData = null;
    }

    let extractedTranscript = '';
    if (v.transcription) {
      let rawTrans = v.transcription.transcript || v.transcription.text || (typeof v.transcription === 'string' ? v.transcription : '');
      if (typeof rawTrans === 'string' && rawTrans.trim().startsWith('{')) {
        try { const parsed = JSON.parse(rawTrans); extractedTranscript = parsed.transcript || rawTrans; } catch (e) { extractedTranscript = rawTrans; }
      } else { extractedTranscript = rawTrans; }
    } else if (v.transcript) {
      extractedTranscript = typeof v.transcript === 'string' ? v.transcript : (v.transcript.text || '');
    }

    let langCode = 'EN';
    if (v.transcription?.detected_language) langCode = String(v.transcription.detected_language).toUpperCase();
    else if (v.language) langCode = String(v.language).toUpperCase();
    if (langCode === 'OG') langCode = 'EN';

    const displayTitle = langBlock.title || summaryObj.title || v.summary_title || v.title || (v.caption ? v.caption.split('\n')[0].substring(0, 56) : 'Saved Reel');
    const displaySummary = langBlock.summary || summaryObj.summary || v.summary_text || '';

    let tags = Array.isArray(langBlock.hashtags) ? langBlock.hashtags : (Array.isArray(v.summary_hashtags) ? v.summary_hashtags : (Array.isArray(v.tags) ? v.tags : []));
    let bullets = Array.isArray(langBlock.headlines) ? langBlock.headlines : (Array.isArray(v.summary_bullets) ? v.summary_bullets : (Array.isArray(v.bullets) ? v.bullets : []));

    let formattedDate = '';
    const rawDate = v.savedAt || v.created_at;
    if (rawDate) {
        try {
            formattedDate = new Date(rawDate).toLocaleDateString(undefined, { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
        } catch (e) {
            formattedDate = safeString(rawDate);
        }
    }

    return {
      id: v.id || v.process_id,
      title: safeString(displayTitle),
      author: safeString(v.author_name || v.author || 'Unknown'),
      category: safeString(v.summary_category || v.category || getCategory(v) || ''),
      subCategory: safeString(v.summary_topic || v.subCategory || v.topic || getTopic(v) || ''),
      summary: safeString(displaySummary),
      bullets,
      tags,
      transcript: extractedTranscript.trim(),
      caption: typeof v.caption === 'string' ? v.caption.trim() : (v.caption?.text || v.caption?.caption || '').trim(),
      recipe: activeRecipe,
      workout: workoutData,
      thumbnailUrl: safeString(v.thumbnailUrl || v.gcs_urls?.preview_thumbnail || v.preview || '') || galleryThumbnail,
      originalUrl: safeString(v.source_url || v.originalUrl || ''),
      platform: safeString(v.source_url || v.originalUrl || '').includes('facebook') ? 'facebook' : 'instagram',
      savedAt: formattedDate,
      hasTranslation: !!(summaryObj.english && summaryObj.original),
      languageCode: langCode,
      duration: formatDuration(v.duration || v.duration_seconds)
    };
  }, [video, editedVideo, isEditing, showOriginal, galleryThumbnail]);

  if (loading || !viewModel) return <VideoDetailSkeleton />;

  return (
    <div className="animate-fade-in relative px-0 pb-20 md:pb-6">
      <div className="flex flex-col md:grid md:grid-cols-[1.5fr_1fr] md:gap-6 items-start">

        {/* ======================= LEFT COLUMN ======================= */}
        <div className="min-w-0 w-full flex flex-col">

          <div className="relative w-full aspect-[9/8] bg-black rounded-2xl overflow-hidden shadow-sm mb-5 group mt-[calc(env(safe-area-inset-top,0px)+0.75rem)] md:mt-0">
            {viewModel.thumbnailUrl && (
              <img
                src={viewModel.thumbnailUrl}
                alt={viewModel.title}
                className="w-full h-full object-cover opacity-90"
                loading="eager"
                decoding="async"
              />
            )}

            <div className="absolute top-4 left-4 right-4 flex justify-between z-20">
              <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center shadow-lg hover:bg-white/40 transition-colors">
                <ArrowLeft size={20} />
              </button>
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <button onClick={handleSaveEdit} className="hidden md:flex h-10 px-4 rounded-full bg-emerald-500 text-white items-center justify-center shadow-lg font-bold text-sm gap-2"><Save size={18} /> {t('common:save', 'Save')}</button>
                    <button onClick={() => setIsEditing(false)} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center"><X size={20} /></button>
                  </>
                ) : (
                  <button onClick={() => setIsActionSheetOpen(true)} className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center hover:bg-white/40 transition-colors">
                    <EllipsisVertical size={18} />
                  </button>
                )}
              </div>
            </div>

            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between z-30 pointer-events-none">
              <div className="flex items-center gap-2 pointer-events-auto">
                {folderName && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-full shadow-lg">
                    <Folder size={12} className="text-primary-400" strokeWidth={2.5} />
                    <span className="text-[11px] font-bold text-white uppercase tracking-wide">{folderName}</span>
                  </div>
                )}
              </div>
              {viewModel.duration && viewModel.duration !== '0:00' && (
                <div className="bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-medium text-white">
                  {viewModel.duration}
                </div>
              )}
            </div>
          </div>

          <div className="mb-3">
            <EditableTitle title={viewModel.title} isEditMode={isEditing} value={viewModel.title} onChange={val => handleEditField('title', val)} />
          </div>

          <div className="mb-6 flex items-center justify-between">
            <a href={viewModel.originalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 group/author">
              <PlatformIconAuthor platform={viewModel.platform} />
              <span className="text-xs font-medium text-gray-500 truncate group-hover/author:text-gray-900 transition-colors">
                {viewModel.author.replace('@', '')}
              </span>
            </a>
            {viewModel.savedAt && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"></path><path d="M7 3v4a1 1 0 0 0 1 1h7"></path></svg>
                <span>{viewModel.savedAt}</span>
              </div>
            )}
          </div>

          <div className="md:hidden mb-6 bg-violet-50 border border-violet-200 rounded-xl overflow-hidden p-4">
            <div className="pb-3 mb-3 border-b border-violet-200/70 relative flex items-center">
              <div className="flex flex-col gap-2 pr-10 flex-1">
                <div className="flex items-center gap-2">
                  <CategoryIcon size={14} />
                  <span className="text-xs font-bold uppercase tracking-wide truncate text-violet-600">{viewModel.category}</span>
                </div>
                {(isEditing || viewModel.subCategory) && (
                    <div className="flex items-center gap-2">
                    <TopicIcon size={14} />
                    <span className="text-xs font-bold uppercase tracking-wide truncate text-pink-600">{viewModel.subCategory}</span>
                    </div>
                )}
              </div>
              <button onClick={() => setIsEditing(true)} className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition"><Pencil size={14} /></button>
            </div>
            <div className="mt-3 flex items-start gap-3">
              <div className="text-cyan-600 mt-[3px] flex-shrink-0"><HashtagsIcon size={16} /></div>
              <style>{`
                .hashtag-links a { display: inline-flex !important; align-items: center !important; justify-content: center !important; padding: 0.375rem 0.9rem !important; border-radius: 9999px !important; background-color: #e0f2fe !important; color: #075985 !important; border: 1px solid #7dd3fc !important; font-size: 0.75rem !important; font-weight: 700 !important; box-shadow: 0 1px 2px rgba(8, 145, 178, 0.15) !important; text-decoration: none !important; margin-right: 0.5rem; margin-bottom: 0.5rem; }
              `}</style>
              <div className="hashtag-links flex flex-wrap flex-1 gap-1.5">
                {viewModel.tags.map((tag: string, idx: number) => {
                  const cleanTag = safeString(tag).replace('#', '');
                  return <a key={idx} href={`https://www.instagram.com/explore/tags/${cleanTag}/`} target="_blank" rel="noopener noreferrer">#{cleanTag}</a>;
                })}
              </div>
            </div>
          </div>

          <div className="bg-primary-50 rounded-2xl p-5 md:p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-primary-700 font-bold text-sm uppercase tracking-wide">AI Summary</h3>
              {viewModel.hasTranslation && !isEditing && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleLanguage(); }}
                  className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm bg-primary-600 hover:bg-primary-700 text-white transition-colors"
                >
                  <Globe size={14} />
                  <span className="text-[11px] font-bold uppercase">{showOriginal ? viewModel.languageCode : 'EN'}</span>
                </button>
              )}
            </div>
            {isEditing ? (
              <textarea className="w-full text-gray-700 leading-relaxed mb-4 font-medium bg-white/50 border border-primary-200 rounded-xl p-3 min-h-[100px]" value={viewModel.summary} onChange={e => handleEditField('summary', e.target.value)} />
            ) : (
              <div className="text-gray-700 text-sm md:text-base leading-relaxed mb-4 font-medium whitespace-pre-line">{viewModel.summary}</div>
            )}
            {(viewModel.bullets.length > 0 || isEditing) && (
              <div className="space-y-3 mt-4 pt-4 border-t border-primary-100/50">
                {isEditing ? (
                  <EditableBullets bullets={viewModel.bullets} isEditMode={isEditing} value={viewModel.bullets} onChange={val => handleEditField('bullets', val)} />
                ) : (
                  viewModel.bullets.map((bullet: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 text-gray-600 text-sm">
                      {bullet.emoji && <span className="text-base leading-none mt-0.5 flex-shrink-0">{bullet.emoji}</span>}
                      <span className="leading-relaxed">
                        {bullet.headline ? (
                          <><span className="font-bold text-gray-900">{bullet.headline}:</span> {bullet.text}</>
                        ) : safeString(bullet)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {viewModel.recipe && (
            <div className="mb-5">
              <RecipeDetailsCard
                recipe={viewModel.recipe}
                servingScale={servingScale}
                scaleQuantity={scaleQuantity}
                onServingScaleChange={setServingScale}
                useMetric={useMetric}
                onToggleMetric={setUseMetric}
              />
            </div>
          )}

          {viewModel.workout && (
            <WorkoutBlock workoutData={viewModel.workout} showOriginal={showOriginal} />
          )}

          {/* ✅ COLLAPSIBLE CAPTION BLOCK */}
          {viewModel.caption && (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-5">
              <div 
                className="flex items-center justify-between cursor-pointer group"
                onClick={() => setIsCaptionOpen(!isCaptionOpen)}
              >
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-gray-100 text-gray-600 rounded-md"><AlignLeft size={16} /></div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('videoDetail:caption', 'Légende')}</h4>
                </div>
                <div className="p-1 rounded-full group-hover:bg-gray-50 transition-colors">
                  <ChevronDown size={20} className={`text-gray-400 transition-transform duration-300 ${isCaptionOpen ? 'rotate-180' : ''}`} />
                </div>
              </div>
              
              <div 
                className={`grid transition-all duration-300 ease-in-out ${isCaptionOpen ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'}`}
              >
                <div className="overflow-hidden">
                  <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {viewModel.caption}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ✅ MOBILE TRANSCRIPT BLOCK (Hidden on Desktop) */}
          {viewModel.transcript && (
            <div className="md:hidden bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-5">
              <div 
                className="flex items-center justify-between cursor-pointer group"
                onClick={() => setIsMobileTranscriptOpen(!isMobileTranscriptOpen)}
              >
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-gray-100 text-gray-600 rounded-md"><CustomMessageSquareMoreIcon size={16} /></div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('videoDetail:transcript', 'Transcription')}</h4>
                </div>
                <div className="p-1 rounded-full group-hover:bg-gray-50 transition-colors">
                  <ChevronDown size={20} className={`text-gray-400 transition-transform duration-300 ${isMobileTranscriptOpen ? 'rotate-180' : ''}`} />
                </div>
              </div>
              
              <div className={`grid transition-all duration-300 ease-in-out ${isMobileTranscriptOpen ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                  <div className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap font-medium italic border-l-2 border-gray-100 pl-4">
                    "{viewModel.transcript}"
                  </div>
                </div>
              </div>
            </div>
          )}

          {isEditing && (
            <div className="md:hidden mt-4 flex gap-2">
              <button onClick={() => setIsEditing(false)} className="flex-1 py-3 bg-gray-200 rounded-xl text-sm font-bold text-gray-700">Cancel</button>
              <button onClick={handleSaveEdit} className="flex-1 py-3 bg-primary-600 rounded-xl text-sm font-bold text-white shadow-lg">Save Changes</button>
            </div>
          )}
        </div>

        {/* ======================= RIGHT COLUMN (DESKTOP) ======================= */}
        <div className="hidden md:flex flex-col w-full gap-5 mt-0">

          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col shrink-0 divide-y divide-gray-100">
            <div className="p-5 flex flex-col gap-3 hover:bg-gray-50/50 transition-colors">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-violet-50 text-violet-600 rounded-md"><CategoryIcon size={16} /></div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Category</span>
              </div>
              {isEditing ? (
                <input className="text-lg font-bold border-b border-primary-200 w-full" value={viewModel.category} onChange={e => handleEditField('category', e.target.value)} />
              ) : (
                <div className="text-lg font-bold text-gray-900 pl-1 leading-snug">{viewModel.category}</div>
              )}
            </div>

            {(isEditing || viewModel.subCategory) && (
              <div className="p-5 flex flex-col gap-3 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-pink-50 text-pink-600 rounded-md"><TopicIcon size={16} /></div>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Topic</span>
                </div>
                {isEditing ? (
                  <input className="text-lg font-bold border-b border-primary-200 w-full" value={viewModel.subCategory} onChange={e => handleEditField('topic', e.target.value)} />
                ) : (
                  <div className="text-lg font-bold text-gray-900 pl-1 leading-snug">{viewModel.subCategory}</div>
                )}
              </div>
            )}

            <div className="p-5 flex flex-col gap-3 bg-gray-50/30">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-cyan-50 text-cyan-600 rounded-md"><HashtagsIcon size={16} /></div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Hashtags</span>
              </div>
              <style>{`
                .hashtag-links a { display: inline-flex !important; align-items: center !important; justify-content: center !important; padding: 0.375rem 0.9rem !important; border-radius: 9999px !important; background-color: #e0f2fe !important; color: #075985 !important; border: 1px solid #7dd3fc !important; font-size: 0.75rem !important; font-weight: 700 !important; box-shadow: 0 1px 2px rgba(8, 145, 178, 0.15) !important; text-decoration: none !important; }
                .hashtag-links a:hover { background-color: #bae6fd !important; border-color: #38bdf8 !important; box-shadow: 0 2px 6px rgba(8, 145, 178, 0.25) !important; transform: translateY(-1px); }
              `}</style>
              <div className="hashtag-links flex flex-wrap gap-2 pl-1">
                {viewModel.tags && viewModel.tags.length > 0 ? (
                  viewModel.tags.map((tag: string, idx: number) => {
                    const cleanTag = safeString(tag).replace('#', '');
                    return <a key={idx} href={`https://www.instagram.com/explore/tags/${cleanTag}/`} target="_blank" rel="noopener noreferrer">#{cleanTag}</a>;
                  })
                ) : (
                  <span className="text-gray-400 text-xs italic">No tags</span>
                )}
              </div>
            </div>
          </div>

          {/* ✅ DESKTOP TRANSCRIPT BLOCK (Closed by default) */}
          {viewModel.transcript && (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 flex flex-col shrink-0">
              <div 
                className="flex items-center justify-between cursor-pointer group"
                onClick={() => setTranscriptOpen(!transcriptOpen)}
              >
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-gray-100 text-gray-600 rounded-md"><CustomMessageSquareMoreIcon size={16} /></div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('videoDetail:transcript', 'Transcription')}</h4>
                </div>
                <div className="p-1 rounded-full group-hover:bg-gray-50 transition-colors">
                  <ChevronDown size={20} className={`text-gray-400 transition-transform duration-300 ${transcriptOpen ? 'rotate-180' : ''}`} />
                </div>
              </div>
              <div className={`grid transition-all duration-300 ease-in-out ${transcriptOpen ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                  <div className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap font-medium italic border-l-2 border-gray-100 pl-4">
                    "{viewModel.transcript}"
                  </div>
                </div>
              </div>
            </div>
          )}

          {viewModel.originalUrl && (
            <div className="flex flex-col gap-2 shrink-0">
              <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-widest pl-1">Original Link</h4>
              <a href={viewModel.originalUrl} target="_blank" rel="noreferrer" className="block w-full">
                {viewModel.platform === 'facebook' ? (
                  <button className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-white font-bold text-sm shadow-sm transition bg-[#1877F2] hover:bg-[#166FE5]">
                    <PlatformIconBtn platform="facebook" />
                    View on Facebook
                  </button>
                ) : (
                  <button className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-white font-bold text-sm shadow-sm transition bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] hover:opacity-90">
                    <PlatformIconBtn platform="instagram" />
                    View on Instagram
                  </button>
                )}
              </a>
            </div>
          )}

        </div>
      </div>

      <ActionSheet isOpen={isActionSheetOpen} onClose={() => setIsActionSheetOpen(false)} title="Settings" actions={actionItems} />
      <MoveCollectionModal isOpen={isMoveModalOpen} onClose={() => setIsMoveModalOpen(false)} onMove={(id) => { moveVideos([video.id], id); setIsMoveModalOpen(false); }} count={1} />
      <ConfirmModal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} onConfirm={handleDelete} title="Delete this reel?" message="This action cannot be undone." confirmLabel="Delete" variant="danger" />
      <ReportModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} url={window.location.href} />
    </div>
  );
};