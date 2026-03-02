import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, ChevronDown, Heart, FolderInput, AlertCircle, X, EllipsisVertical, Archive, AlignLeft, Pencil, Save, Globe } from 'lucide-react';
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

/* ─── LOCAL HELPERS ─── */
const formatDuration = (seconds: number | string | undefined): string => {
  if (!seconds) return '0:00';
  const totalSeconds = typeof seconds === 'string' ? parseInt(seconds, 10) : seconds;
  if (isNaN(totalSeconds)) return '0:00';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const RAW_API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || 'http://localhost:5001';
const API_BASE = String(RAW_API_BASE ?? '').trim().replace(/\/+$/, '');
function apiUrl(path: string) {
  const p = String(path || '').replace(/^\/+/, '');
  return API_BASE ? `${API_BASE}/${p}` : `/${p}`;
}

async function fetchGcsJson<T = any>(url: string): Promise<T | null> {
  try {
    const finalUrl = import.meta.env.DEV ? url.replace('https://storage.googleapis.com', '/gcs-proxy') : url;
    const res = await fetch(finalUrl, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store' });
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
  <div className="animate-pulse relative w-full px-2 md:px-0 pb-12">
    <div className="flex flex-col md:grid md:grid-cols-[1.5fr_1fr] md:gap-12 items-start">
      <div className="min-w-0 w-full">
        <div className="w-full aspect-[9/8] bg-gray-200/80 rounded-2xl mb-6 mt-[calc(env(safe-area-inset-top,0px)+0.75rem)] md:mt-0"></div>
        <div className="h-10 bg-gray-200/80 rounded-lg w-3/4 mb-4"></div>
      </div>
    </div>
  </div>
);

export const VideoDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { videos, deleteVideos, moveVideos, toggleFavorite, updateVideo } = useData();
  const { showOriginal, toggleLanguage } = useLanguage(); 
  const { t } = useTranslation(['videoDetail', 'common']);

  const [video, setVideo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedVideo, setEditedVideo] = useState<any | null>(null);
  const [servingScale, setServingScale] = useState(1);
  const [useMetric, setUseMetric] = useState(true);

  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // 🔥 THE BULLETPROOF SCROLL-LOCK & JITTER FIX FOR ELLIPSIS MENU
  useEffect(() => {
    const isAnyModalOpen = isActionSheetOpen || isMoveModalOpen || isReportModalOpen || isDeleteConfirmOpen;
    if (isAnyModalOpen) { 
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden'; 
      if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else { 
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      if (scrollY) window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
  }, [isActionSheetOpen, isMoveModalOpen, isReportModalOpen, isDeleteConfirmOpen]);

  const getShortcode = (fullId: string) => (fullId || '').split('--')[0];

  const fetchBackendJsonNoStore = useCallback(async (url: string) => {
    const res = await fetch(url, { method: 'GET', cache: 'no-store', credentials: 'include', headers: { ...getAuthHeaders() } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, []);

  const enrichVideo = useCallback(async () => {
    if (!id) return;
    try {
      const dbResult = await fetchBackendJsonNoStore(apiUrl(`api/reel/${encodeURIComponent(id)}`)).catch(() => null);
      
      const short = getShortcode(id); 
      const isFBGuess = id.includes('FB') || short.length < 5;
      const folderGuess = isFBGuess ? 'FB_reels' : 'IG_reels';
      
      const pathsToTry = [
        `https://storage.googleapis.com/recolekt-storage/media/${folderGuess}/${id}/${short}_result.json`,
        `https://storage.googleapis.com/recolekt-storage/media/${folderGuess}/${short}/${short}_result.json`
      ];

      let gcsResult = null;
      for (const path of pathsToTry) {
        gcsResult = await fetchGcsJson(`${path}?v=${Date.now()}`);
        if (gcsResult) break;
      }

      let secureFound = dbResult || videos.find((v: any) => v.id === id) || { id };
      setVideo({ ...secureFound, ...(gcsResult || {}), __raw: secureFound });
    } catch (err) { 
        console.warn("Enrichment failed", err); 
    } finally { 
        setLoading(false); 
    }
  }, [id, fetchBackendJsonNoStore, videos]);

  useEffect(() => {
    if (!id || videos.length === 0) return;
    const cached = videos.find((v: any) => v.id === id); 
    if (cached) setVideo(cached);
  }, [id, videos]);

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
      else if (field === 'category') { next.category = value; }
      else if (field === 'topic') { next.topic = value; next.subCategory = value; }
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

  // Custom Inline SVG to replace missing IOSShareIcon
  const CustomShareIcon = ({ size = 24 }: any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/></svg>
  );

  const actionItems: ActionItem[] = [
    { icon: CustomShareIcon, label: t('videoDetail:share', "Share Video"), onClick: handleShare },
    { icon: Pencil, label: t('videoDetail:editReel', "Edit details"), onClick: () => setIsEditing(true) },
    { icon: Heart, label: video?.isFavorite ? t('videoDetail:removeFromFavorites', "Remove from Favorites") : t('videoDetail:addToFavorites', "Add to Favorites"), onClick: handleToggleFavorite, variant: video?.isFavorite ? 'default' : 'primary' },
    { icon: FolderInput, label: t('videoDetail:moveToCollection', "Move to Collection"), onClick: () => setIsMoveModalOpen(true) },
    { icon: Archive, label: t('videoDetail:archive', "Archive"), onClick: handleArchive },
    { icon: AlertCircle, label: t('videoDetail:reportIssue', "Report Issue"), onClick: () => setIsReportModalOpen(true) },
    { icon: Trash2, label: t('videoDetail:deleteReel', "Delete clip"), onClick: () => setIsDeleteConfirmOpen(true), variant: 'danger' }
  ];

  const viewModel = useMemo(() => {
    if (!video) return null;
    const v = isEditing && editedVideo ? editedVideo : video;
    
    let summaryObj = v.summary;
    if (typeof summaryObj === 'string') { try { summaryObj = JSON.parse(summaryObj); } catch(e) { summaryObj = {}; } }
    if (!summaryObj) summaryObj = {};

    const langBlock = (showOriginal && summaryObj.original) ? summaryObj.original : (summaryObj.english || summaryObj);
    
    let recipeData = v.recipe;
    if (typeof recipeData === 'string') { try { recipeData = JSON.parse(recipeData); } catch (e) { recipeData = null; } }
    if (recipeData && recipeData.recipe) recipeData = recipeData.recipe;
    let activeRecipe = null;
    if (recipeData && Object.keys(recipeData).length > 0) activeRecipe = showOriginal && recipeData.original ? recipeData.original : (recipeData.english || recipeData);

    let extractedTranscript = '';
    if (v.transcription) {
        if (typeof v.transcription === 'string') extractedTranscript = v.transcription;
        else if (v.transcription.transcript) extractedTranscript = v.transcription.transcript;
        else if (v.transcription.text) extractedTranscript = v.transcription.text;
    } 
    if (!extractedTranscript && v.transcript) {
        if (typeof v.transcript === 'string') extractedTranscript = v.transcript;
        else if (v.transcript.text) extractedTranscript = v.transcript.text;
    }

    return {
      id: v.id,
      title: safeString(langBlock?.title || v.title || 'Saved Reel'),
      author: safeString(v.author_name || v.author || 'Unknown'),
      category: safeString(v.category || getCategory(v) || 'General'),
      subCategory: safeString(v.subCategory || v.topic || getTopic(v) || ''),
      summary: safeString(langBlock?.summary || v.summary_text || ''),
      bullets: Array.isArray(langBlock?.headlines || v.bullets) ? (langBlock?.headlines || v.bullets) : [],
      tags: Array.isArray(langBlock?.hashtags || v.tags) ? (langBlock?.hashtags || v.tags) : [],
      transcript: extractedTranscript.trim(),
      caption: typeof v.caption === 'string' ? v.caption.trim() : (v.caption?.text || v.caption?.caption || '').trim(),
      recipe: activeRecipe,
      thumbnailUrl: safeString(v.thumbnailUrl || v.gcs_urls?.preview_thumbnail || v.preview || ''),
      originalUrl: safeString(v.source_url || v.originalUrl || ''),
      platform: safeString(v.source_url || v.originalUrl || '').includes('facebook') ? 'facebook' : 'instagram',
      savedAt: safeString(v.savedAt || (v.created_at ? new Date(v.created_at).toLocaleDateString() : '')),
      hasTranslation: !!(summaryObj.english && summaryObj.original),
      languageCode: (v.transcription?.detected_language || 'en').toUpperCase(),
      duration: formatDuration(v.duration)
    };
  }, [video, editedVideo, isEditing, showOriginal]);

  if (loading || !viewModel) return <VideoDetailSkeleton />;

  return (
    <div className="animate-fade-in relative px-2 md:px-0 pb-20 md:pb-12">
      <div className="flex flex-col md:grid md:grid-cols-[1.5fr_1fr] md:gap-12 items-start">
        
        {/* ======================= LEFT COLUMN ======================= */}
        <div className="min-w-0 w-full flex flex-col">
          
          <div className="relative w-full aspect-[9/8] bg-black rounded-2xl overflow-hidden shadow-sm mb-6 group mt-[calc(env(safe-area-inset-top,0px)+0.75rem)] md:mt-0">
             {viewModel.thumbnailUrl && <img src={viewModel.thumbnailUrl} alt={viewModel.title} className="w-full h-full object-cover opacity-90" />}
             
             {viewModel.duration && viewModel.duration !== '0:00' && (
                <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-medium text-white z-20">
                  {viewModel.duration}
                </div>
             )}

             <div className="absolute top-4 left-4 right-4 flex justify-between z-20">
                <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center shadow-lg hover:bg-white/40 transition-colors"><ArrowLeft size={20} /></button>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <button onClick={handleSaveEdit} className="hidden md:flex h-10 px-4 rounded-full bg-emerald-500 text-white items-center justify-center shadow-lg font-bold text-sm gap-2"><Save size={18} /> {t('common:save', 'Save')}</button>
                      <button onClick={() => setIsEditing(false)} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center"><X size={20} /></button>
                    </>
                  ) : (
                    <button onClick={() => setIsActionSheetOpen(true)} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center transition-colors"><EllipsisVertical size={20} /></button>
                  )}
                </div>
             </div>

             {viewModel.hasTranslation && !isEditing && (
              <button 
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleLanguage(); }} 
                className="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg flex items-center gap-1.5 z-30 shadow-lg bg-primary-600 hover:bg-primary-700 text-white"
              >
                <Globe size={14} /><span className="text-[11px] font-bold uppercase">{showOriginal ? viewModel.languageCode : 'EN'}</span>
              </button>
            )}
          </div>

          <div className="mb-4">
             <EditableTitle title={viewModel.title} isEditMode={isEditing} value={viewModel.title} onChange={val => handleEditField('title', val)} />
          </div>
          
          {/* EXACT ACCOUNT HTML */}
          <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-6">
            <a href={viewModel.originalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 group/author">
              {viewModel.platform === 'facebook' ? (
                <svg className="w-3 h-3 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              ) : (
                <svg className="w-3 h-3 text-pink-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              )}
              <span className="text-xs font-medium text-gray-500 truncate group-hover/author:text-gray-900 transition-colors">
                {viewModel.author.replace('@', '')}
              </span>
            </a>
            {viewModel.savedAt && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-save text-gray-400" aria-hidden="true"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"></path><path d="M7 3v4a1 1 0 0 0 1 1h7"></path></svg>
                <span>{viewModel.savedAt}</span>
              </div>
            )}
          </div>

          {/* EXACT MOBILE METADATA HTML */}
          <div className="md:hidden mb-5 bg-violet-50 border border-violet-200 rounded-xl overflow-hidden p-4">
            <div className="pb-3 mb-3 border-b border-violet-200/70 relative flex items-center">
              <div className="flex flex-col gap-2 pr-10 flex-1">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-layers flex-shrink-0" aria-hidden="true" style={{ color: 'rgb(139, 92, 246)' }}>
                    <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"></path><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"></path><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"></path>
                  </svg>
                  <span className="text-xs font-bold uppercase tracking-wide truncate" style={{ color: 'rgb(139, 92, 246)' }}>{viewModel.category}</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-tags flex-shrink-0" aria-hidden="true" style={{ color: 'rgb(225, 29, 72)' }}>
                    <path d="M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1z"></path><path d="M2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193"></path><circle cx="10.5" cy="6.5" r=".5" fill="currentColor"></circle>
                  </svg>
                  <span className="text-xs font-bold uppercase tracking-wide truncate" style={{ color: 'rgb(225, 29, 72)' }}>{viewModel.subCategory}</span>
                </div>
              </div>
              <button onClick={() => setIsEditing(true)} className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition" title="editReel">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path><path d="m15 5 4 4"></path></svg>
              </button>
            </div>
            <div className="mt-1">
              <div className="flex items-center gap-2 text-xs uppercase font-semibold mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 512 512" className="flex-shrink-0" aria-hidden="true" style={{ color: 'rgb(8, 145, 178)' }}>
                  <path fillRule="nonzero" fill="currentColor" d="M300.02 161.657l.047-.187c3.542-14.981 23.176-18.148 31.458-5.532a17.27 17.27 0 012.463 13.038c-2.328 10.088-4.271 20.55-6.386 30.72h12.177c22.801 0 22.804 34.849 0 34.849h-19.383l-8.664 43.645h30.453c22.935 0 22.926 34.846 0 34.846h-37.597l-7.847 37.682c-5.447 21.855-38.479 14.339-33.876-7.694 2.271-9.85 4.177-20.06 6.245-29.988h-45.112c-2.556 12.304-4.897 25.01-7.741 37.203-5.282 22.331-38.129 14.224-33.971-7.243l6.239-29.991-16.242.003c-22.9.135-22.956-34.818 0-34.818h23.404l8.614-43.645h-34.49c-22.521 0-23.232-34.849 0-34.849h41.693l7.731-37.144c.051-.403.138-.797.26-1.176 5.329-21.289 38.485-14.721 33.877 7.672l-6.39 30.648h45.113c2.635-12.65 5.447-25.37 7.925-38.039zM256 0c70.688 0 134.689 28.658 181.016 74.984C483.342 121.311 512 185.312 512 256c0 70.688-28.658 134.689-74.984 181.016C390.689 483.342 326.688 512 256 512c-70.688 0-134.689-28.658-181.016-74.984C28.658 390.689 0 326.688 0 256c0-70.688 28.658-134.689 74.984-181.016C121.311 28.658 185.312 0 256 0zm159.946 96.054C375.017 55.125 318.465 29.806 256 29.806S136.983 55.125 96.054 96.054 29.806 193.535 29.806 256s25.319 119.017 66.248 159.946S193.535 482.194 256 482.194s119.017-25.319 159.946-66.248S482.194 318.465 482.194 256s-25.319-119.017-66.248-159.946zM276.256 278.19l8.661-43.645h-45.115l-8.664 43.645h45.118z"></path>
                </svg>
                <span style={{ color: 'rgb(8, 145, 178)' }}>hashtags</span>
              </div>
              <style>{`
                .hashtag-links a { display: inline-flex !important; align-items: center !important; justify-content: center !important; padding: 0.375rem 0.9rem !important; border-radius: 9999px !important; background-color: #e0f2fe !important; color: #075985 !important; border: 1px solid #7dd3fc !important; font-size: 0.75rem !important; font-weight: 700 !important; box-shadow: 0 1px 2px rgba(8, 145, 178, 0.15) !important; text-decoration: none !important; margin-right: 0.5rem; margin-bottom: 0.5rem; }
                .hashtag-links a:hover { background-color: #bae6fd !important; border-color: #38bdf8 !important; box-shadow: 0 2px 6px rgba(8, 145, 178, 0.25) !important; transform: translateY(-1px); }
              `}</style>
              <div className="hashtag-links flex flex-wrap">
                 {viewModel.tags.map((tag: string, idx: number) => {
                    const cleanTag = safeString(tag).replace('#', '');
                    return <a key={idx} href={`https://www.instagram.com/explore/tags/${cleanTag}/`} target="_blank" rel="noopener noreferrer">#{cleanTag}</a>
                 })}
              </div>
            </div>
          </div>
          
          <div className="bg-primary-50 rounded-2xl p-5 md:p-6 mb-6">
             <h3 className="text-primary-700 font-bold mb-3 text-sm uppercase tracking-wide">AI Summary</h3>
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
                        {bullet.emoji && (
                          <span className="text-base leading-none mt-0.5 flex-shrink-0">{bullet.emoji}</span>
                        )}
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
            <div className="mb-6 relative">
              <div className="absolute top-0 right-0 z-10 p-4">
                 <button onClick={() => setUseMetric(!useMetric)} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold shadow-sm hover:bg-gray-200 transition-colors">
                   {useMetric ? 'Switch to US' : 'Switch to Metric'}
                 </button>
              </div>
              <RecipeDetailsCard recipe={viewModel.recipe} servingScale={servingScale} scaleQuantity={scaleQuantity} onServingScaleChange={setServingScale} useMetric={useMetric} />
            </div>
          )}

          {viewModel.caption && (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden p-5 mt-2 mb-6">
               <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-gray-100 text-gray-600 rounded-md"><AlignLeft size={16} /></div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Légende</h4>
               </div>
               <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                 {viewModel.caption}
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
        <div className="hidden md:block w-full space-y-6 md:space-y-8 mt-6 md:mt-0">
          <div className="space-y-6">
            
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 flex flex-col gap-2 hover:bg-gray-50/50 transition-colors border-b border-gray-50">
                   <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-violet-50 text-violet-600 rounded-md">
                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgb(139, 92, 246)' }}>
                            <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"></path>
                            <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"></path>
                            <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"></path>
                         </svg>
                      </div>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Category</span>
                   </div>
                   {isEditing ? <input className="text-lg font-bold border-b border-primary-200 w-full" value={viewModel.category} onChange={e => handleEditField('category', e.target.value)} /> : <div className="text-lg font-bold text-gray-900 pl-1 leading-snug">{viewModel.category}</div>}
                </div>

                {(isEditing || viewModel.subCategory) && (
                  <div className="p-5 border-t border-gray-50 flex flex-col gap-2 hover:bg-gray-50/50 transition-colors">
                     <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-pink-50 text-pink-600 rounded-md">
                           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'rgb(225, 29, 72)' }}>
                              <line x1="4" x2="20" y1="9" y2="9"></line>
                              <line x1="4" x2="20" y1="15" y2="15"></line>
                              <line x1="10" x2="8" y1="3" y2="21"></line>
                              <line x1="16" x2="14" y1="3" y2="21"></line>
                           </svg>
                        </div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Topic</span>
                     </div>
                     {isEditing ? <input className="text-lg font-bold border-b border-primary-200 w-full" value={viewModel.subCategory} onChange={e => handleEditField('topic', e.target.value)} /> : <div className="text-lg font-bold text-gray-900 pl-1 leading-snug">{viewModel.subCategory}</div>}
                  </div>
                )}

                <div className="p-5 border-t border-gray-50 bg-gray-50/30">
                   <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-cyan-50 text-cyan-600 rounded-md">
                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgb(8, 145, 178)' }}>
                            <path d="M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1z"></path>
                            <path d="M2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193"></path>
                            <circle cx="10.5" cy="6.5" r=".5" fill="currentColor"></circle>
                         </svg>
                      </div>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Hashtags</span>
                   </div>
                   
                   <div className="hashtag-links flex flex-wrap gap-2">
                     <div className="flex flex-wrap gap-2">
                       {isEditing ? (
                          <EditableHashtags hashtags={viewModel.tags} isEditMode={true} value={viewModel.tags} onChange={val => handleEditField('tags', val)} />
                       ) : (
                          viewModel.tags.map((tag: string, idx: number) => {
                             const cleanTag = safeString(tag).replace('#', '');
                             return <a key={idx} href={`https://www.instagram.com/explore/tags/${cleanTag}/`} target="_blank" rel="noopener noreferrer">#{cleanTag}</a>
                          })
                       )}
                     </div>
                   </div>
                </div>
            </div>

            {viewModel.transcript && (
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                 <button onClick={() => setTranscriptOpen(!transcriptOpen)} className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-2">
                       <div className="p-1.5 bg-gray-100 text-gray-600 rounded-md">
                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-square-more" aria-hidden="true"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"></path><path d="M12 11h.01"></path><path d="M16 11h.01"></path><path d="M8 11h.01"></path></svg>
                       </div>
                       <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Transcription</h4>
                    </div>
                    <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ${transcriptOpen ? 'rotate-180' : ''}`} />
                 </button>
                 {transcriptOpen && (
                   <div className="px-5 pb-5">
                      <div className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap font-medium italic border-l-2 border-gray-100 pl-4">
                        "{viewModel.transcript}"
                      </div>
                   </div>
                 )}
              </div>
            )}

            {viewModel.originalUrl && (
              <div className="space-y-3">
                 <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Original Link</h4>
                 <a href={viewModel.originalUrl} target="_blank" rel="noreferrer" className="block">
                    {viewModel.platform === 'facebook' ? (
                      <button className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-white font-bold text-sm shadow-md transition bg-[#1877F2] hover:bg-[#166FE5]">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        View on Facebook
                      </button>
                    ) : (
                      <button className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-white font-bold text-sm shadow-md transition bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] hover:opacity-90">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                        View on Instagram
                      </button>
                    )}
                 </a>
              </div>
            )}
            
          </div>
        </div>
      </div>

      <ActionSheet isOpen={isActionSheetOpen} onClose={() => setIsActionSheetOpen(false)} title="Settings" actions={actionItems} />  
      <MoveCollectionModal isOpen={isMoveModalOpen} onClose={() => setIsMoveModalOpen(false)} onMove={(id) => { moveVideos([video.id], id); setIsMoveModalOpen(false); }} />
      <ConfirmModal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} onConfirm={handleDelete} title="Delete this reel?" message="This action cannot be undone." confirmLabel="Delete" variant="danger" />
      <ReportModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} url={window.location.href} />
    </div>
  );
};