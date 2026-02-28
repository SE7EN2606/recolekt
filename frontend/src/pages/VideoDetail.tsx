import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Trash2, ChevronDown, Heart, FolderInput, AlertCircle, 
  X, EllipsisVertical, Archive, Hash, AlignLeft, 
  Pencil, Plus, Save, Globe 
} from 'lucide-react';
import { Button } from '../components/Button';
import { useData } from '../context/DataContext';
import { getAuthHeaders } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ActionSheet, ActionItem } from '../components/ActionSheet';
import { MoveCollectionModal } from '../components/MoveCollectionModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { useTranslation } from 'react-i18next';
import { getCategory, getTopic } from '../utils/videoUtils';
import { scaleQuantity } from '../utils/conversionUtils';
import { RecipeDetailsCard } from '../components/RecipeDetailsCard';
import { VideoDetailMobile } from '../components/VideoDetailMobile';

/* ─── CUSTOM ICONS ─── */
const CustomMessageSquareMoreIcon = ({ size = 16, className = "" }: { size?: number, className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-message-square-more ${className}`} aria-hidden="true">
    <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"></path>
    <path d="M12 11h.01"></path>
    <path d="M16 11h.01"></path>
    <path d="M8 11h.01"></path>
  </svg>
);

const IOSShareIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
  </svg>
);

const InstagramExternalIcon = ({ size = 16, className = "" }: { size?: number, className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
  </svg>
);

const FacebookExternalIcon = ({ size = 16, className = "" }: { size?: number, className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const LayersIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"></path>
    <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"></path>
    <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"></path>
  </svg>
);

const TagsIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1z"></path>
    <path d="M2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193"></path>
    <circle cx="10.5" cy="6.5" r=".5" fill="currentColor"></circle>
  </svg>
);

const PlatformIcon = ({ platform }: { platform: string }) => {
  if (platform === 'facebook' || platform === 'fb') {
    return (
      <svg className="w-3 h-3 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    );
  }
  return (
    <svg className="w-3 h-3 text-pink-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

/* ─── API & HELPERS ─── */
const RAW_API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || 'http://localhost:5001';
const API_BASE = String(RAW_API_BASE ?? '').trim().replace(/\/+$/, '');
function apiUrl(path: string) {
  const p = String(path || '').replace(/^\/+/, '');
  return API_BASE ? `${API_BASE}/${p}` : `/${p}`;
}

async function fetchGcsJson<T = any>(url: string): Promise<T> {
  const finalUrl = import.meta.env.DEV ? url.replace('https://storage.googleapis.com', '/gcs-proxy') : url;
  const res = await fetch(finalUrl, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error(`GCS HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const stripLeadingEmoji = (s: string) => (s || '').trim().replace(/^[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D]+\s*/u, '').trim();

const safeString = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return safeString(val[0]);
  if (typeof val === 'object') return String(val.text || val.title || val.summary || val.transcript || val.caption || val.headline || val.name || '');
  return String(val);
};

/* ─── MAIN COMPONENT ─── */
export const VideoDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { videos, deleteVideos, moveVideos, toggleFavorite, updateVideo } = useData();
  const { showOriginal, toggleLanguage } = useLanguage(); 
  
  // ✅ Added 'common' namespace to useTranslation to access general tags
  const { t } = useTranslation(['videoDetail', 'common']);

  const [video, setVideo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedVideo, setEditedVideo] = useState<any | null>(null);
  const [servingScale, setServingScale] = useState(1);

  // Modals
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportStep, setReportStep] = useState(1);
  const [reportData, setReportData] = useState({ contentType: '', errorType: [] as string[], details: '', url: window.location.href });

  const getShortcode = (fullId: string) => (fullId || '').split('--')[0];

  const fetchBackendJsonNoStore = useCallback(async (url: string) => {
    const res = await fetch(url, { method: 'GET', cache: 'no-store', credentials: 'include', headers: { ...getAuthHeaders() } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, []);

  const enrichVideo = useCallback(async () => {
    if (!id) return;
    try {
      const found = await fetchBackendJsonNoStore(apiUrl(`api/reel/${encodeURIComponent(id)}`)).catch(() => null);

      let secureFound = found;
      if (found?.id && found.id !== id && getShortcode(found.id) !== getShortcode(id)) {
          secureFound = videos.find((v: any) => v.id === id) || { id };
      }
      if (!secureFound) secureFound = videos.find((v: any) => v.id === id) || { id };

      const short = getShortcode(id); 
      const isFB = secureFound.source_url?.includes('facebook.com') || secureFound.source_url?.includes('fb.') || id.includes('FB') || short.length < 5;
      const folder = isFB ? 'FB_reels' : 'IG_reels';
      const resultUrl = `https://storage.googleapis.com/recolekt-storage/media/${folder}/${short}/${short}_result.json?v=${Date.now()}`;
      
      const gcsData = await fetchGcsJson<any>(resultUrl).catch(() => ({}));

      setVideo({ ...secureFound, ...gcsData, __raw: secureFound });
    } catch (err) {
      console.warn("Network fetch skipped or failed.");
    } finally {
      setLoading(false);
    }
  }, [id, fetchBackendJsonNoStore, videos]);

  useEffect(() => {
    if (!id || videos.length === 0) return;
    setVideo((prev: any) => {
      if (prev?.id === id) return prev; 
      const cached = videos.find((v: any) => v.id === id); 
      if (cached) {
        if (cached.summary) {
          setLoading(false);
        }
        return cached;
      }
      return prev;
    });
  }, [id, videos]);

  const fetchedId = useRef<string | null>(null);
  useEffect(() => { 
    if (id && fetchedId.current !== id) {
      fetchedId.current = id;
      enrichVideo(); 
    }
  }, [id, enrichVideo]);

  useEffect(() => { 
    if (isEditing && video) {
      setEditedVideo(JSON.parse(JSON.stringify(video)));
    }
  }, [isEditing, video]);

  const handleEditField = (field: string, value: any, index?: number) => {
    setEditedVideo((prev: any) => {
      if (!prev) return prev;
      const next = { ...prev };
      
      let summaryObj = next.summary;
      if (typeof summaryObj === 'string') {
        try { summaryObj = JSON.parse(summaryObj); } catch(e) { summaryObj = { english: { summary: summaryObj }}; }
      }
      if (!summaryObj) summaryObj = {};
      
      const hasTranslation = !!(summaryObj.english && summaryObj.original);
      const langKey = showOriginal && hasTranslation ? 'original' : 'english';
      if (!summaryObj[langKey]) summaryObj[langKey] = {};

      if (field === 'title') {
        next.title = value;
        next.display_title = value;
        summaryObj[langKey].title = value;
      } else if (field === 'summary') {
        next.summary_text = value;
        summaryObj[langKey].summary = value;
      } else if (field === 'bullet' && index !== undefined) {
        const currentBullets = [...(summaryObj[langKey].headlines || next.bullets || [])];
        if (typeof currentBullets[index] === 'string') {
          currentBullets[index] = value;
        } else {
          currentBullets[index] = { ...currentBullets[index], headline: value };
        }
        summaryObj[langKey].headlines = currentBullets;
        next.bullets = currentBullets;
      } else if (field === 'add_bullet') {
        const currentBullets = [...(summaryObj[langKey].headlines || next.bullets || []), { headline: '', text: '' }];
        summaryObj[langKey].headlines = currentBullets;
        next.bullets = currentBullets;
      } else if (field === 'remove_bullet' && index !== undefined) {
        const currentBullets = (summaryObj[langKey].headlines || next.bullets || []).filter((_: any, i: number) => i !== index);
        summaryObj[langKey].headlines = currentBullets;
        next.bullets = currentBullets;
      } else if (field === 'category') {
        next.category = value;
        next.summary_category = value;
      } else if (field === 'topic') {
        next.topic = value;
        next.subCategory = value;
        next.summary_topic = value;
      } else if (field === 'tags') {
        next.tags = value;
        summaryObj[langKey].hashtags = value;
      }

      next.summary = summaryObj;
      return next;
    });
  };

  const handleToggleFavorite = () => toggleFavorite(video.id);
  const handleMove = (targetId: string) => { moveVideos([video.id], targetId); setIsMoveModalOpen(false); };
  const handleArchive = () => { moveVideos([video.id], 'archive'); setIsActionSheetOpen(false); };
  const handleDelete = () => { deleteVideos([video.id]); setIsDeleteConfirmOpen(false); navigate('/gallery'); };

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: video.title, text: video.summary, url: window.location.href }); } catch (err) {}
    } else {
      await navigator.clipboard.writeText(window.location.href);
      alert(t('videoDetail:linkCopied', 'Link copied!'));
    }
  };

  const handleSaveEdit = () => {
    if (editedVideo && video) {
      if (typeof updateVideo === 'function') updateVideo(video.id, editedVideo);
      setVideo(editedVideo);
      setIsEditing(false);
    }
  };

  const toggleErrorType = (type: string) => {
    setReportData(prev => ({ ...prev, errorType: prev.errorType.includes(type) ? prev.errorType.filter(t => t !== type) : [...prev.errorType, type] }));
  };

  // ✅ Added Translation `t()` calls to the Desktop action items menu
  const actionItems: ActionItem[] = [
    { icon: IOSShareIcon, label: t('videoDetail:share', "Share Video"), onClick: handleShare, description: t('videoDetail:shareDesc', 'Share link with friends') },
    { icon: Pencil, label: t('videoDetail:editDetails', "Edit Details"), onClick: () => setIsEditing(true), description: t('videoDetail:editDesc', 'Modify title, summary, or categories') },
    { icon: Heart, label: video?.isFavorite ? t('videoDetail:removeFromFavorites', "Remove from Favorites") : t('videoDetail:addToFavorites', "Add to Favorites"), onClick: handleToggleFavorite, variant: video?.isFavorite ? 'default' : 'primary' },
    { icon: FolderInput, label: t('videoDetail:moveToCollection', "Move to Collection"), onClick: () => setIsMoveModalOpen(true) },
    { icon: Archive, label: t('videoDetail:archive', "Archive Video"), onClick: handleArchive },
    { icon: AlertCircle, label: t('videoDetail:reportIssue', "Report Issue"), onClick: () => setIsReportModalOpen(true) },
    { icon: Trash2, label: t('common:delete', "Delete Video"), onClick: () => setIsDeleteConfirmOpen(true), variant: 'danger' }
  ];

  const viewModel = useMemo(() => {
    if (!video) return null;
    const v = isEditing && editedVideo ? editedVideo : video;
    
    let summaryObj = v.summary;
    if (typeof summaryObj === 'string') {
      try { summaryObj = JSON.parse(summaryObj); } catch(e) { summaryObj = { english: { summary: summaryObj }}; }
    }
    if (!summaryObj) summaryObj = {};

    const originalBlock = summaryObj.original || summaryObj.og || summaryObj.OG;
    const englishBlock = summaryObj.english || summaryObj.en || summaryObj.EN || summaryObj;
    
    const hasTranslation = !!(originalBlock && englishBlock && originalBlock !== englishBlock);
    const langBlock = (showOriginal && hasTranslation) ? originalBlock : englishBlock;

    let recipeData = v.recipe;
    if (typeof recipeData === 'string') {
      try { recipeData = JSON.parse(recipeData); } catch (e) {}
    }
    let activeRecipe = null;
    if (recipeData) {
      const hasRecipeTranslation = !!(recipeData.english && recipeData.original);
      activeRecipe = showOriginal && hasRecipeTranslation ? recipeData.original : (recipeData.english || recipeData);
    }

    const transcriptionLang = v.transcription?.detected_language || 'en';
    const languageCode = transcriptionLang.toUpperCase();

    const displayTitle = safeString(langBlock?.title || v.display_title || v.title || 'Saved Reel');
    const displaySummary = safeString(langBlock?.summary || v.summary_text || v.summary || '');
    const displayCategory = safeString(v.category || v.summary_category || getCategory(v) || 'General');
    const displaySubCategory = safeString(v.subCategory || v.topic || v.summary_topic || getTopic(v) || '');

    const bulletsRaw = langBlock?.headlines || v.bullets || [];
    const bulletsArr = Array.isArray(bulletsRaw) ? bulletsRaw : [bulletsRaw];

    const tagsRaw = langBlock?.hashtags || v.tags || [];
    const tagsArr = Array.isArray(tagsRaw) ? tagsRaw : [];

    const transcriptionRaw = v.transcription || v.transcript;
    const transcriptionText = typeof transcriptionRaw === 'string'
      ? transcriptionRaw.trim()
      : (transcriptionRaw?.transcript || '').trim();

    const captionRaw = v.caption;
    const captionText = typeof captionRaw === 'string'
      ? captionRaw.trim()
      : (captionRaw?.text || captionRaw?.caption || '').trim();

    return {
      id: v.id,
      title: displayTitle,
      author: safeString(v.author_name || v.author || 'Unknown'),
      category: displayCategory,
      subCategory: displaySubCategory,
      summary: displaySummary,
      bullets: bulletsArr, 
      tags: tagsArr,
      transcript: transcriptionText,
      caption: captionText,
      recipe: activeRecipe,
      thumbnailUrl: safeString(v.thumbnailUrl || v.gcs_urls?.preview_thumbnail || v.preview || ''),
      originalUrl: safeString(v.source_url || v.originalUrl || ''),
      platform: safeString(v.source_url || v.originalUrl || '').includes('facebook.com') ? 'fb' : 'instagram',
      savedAt: safeString(v.savedAt || (v.created_at ? new Date(v.created_at).toLocaleDateString() : '')),
      hasTranslation,
      languageCode,
      isRecipe: !!activeRecipe,
      sourceUrl: safeString(v.source_url || v.originalUrl || ''),
      preview: safeString(v.preview || v.gcs_urls?.preview_thumbnail || '')
    };
  }, [video, editedVideo, isEditing, showOriginal]);

  if (loading || !viewModel) return (
    <div className="p-10 text-center flex justify-center">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="animate-fade-in relative">
      
      {/* ======================= DESKTOP LAYOUT (HIDDEN ON MOBILE) ======================= */}
      <div className="hidden md:grid md:grid-cols-[1.5fr_1fr] gap-12 items-start pb-12">
        
        {/* DESKTOP: LEFT COLUMN */}
        <div className="min-w-0">
          <div className="relative w-full aspect-[9/8] bg-black rounded-2xl overflow-hidden shadow-sm mb-6 group">
            {viewModel.thumbnailUrl && (
              <img src={viewModel.thumbnailUrl} alt={viewModel.title} className="w-full h-full object-cover opacity-90" />
            )}
            
             <div className="absolute top-4 left-4 z-20">
                <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center shadow-lg hover:bg-white/40 transition-colors">
                   <ArrowLeft size={20} strokeWidth={2} />
                </button>
             </div>

             {viewModel.hasTranslation && !isEditing && (
              <button
                onClick={toggleLanguage}
                className="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all z-30 shadow-lg bg-primary-600 hover:bg-primary-700 text-white"
              >
                <Globe size={14} className="text-white" />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  {showOriginal ? viewModel.languageCode : 'EN'}
                </span>
              </button>
            )}

             <div className="absolute top-4 right-4 z-20 flex gap-2">
                {isEditing ? (
                  <>
                    <button onClick={handleSaveEdit} className="h-10 px-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg hover:bg-emerald-600 transition-colors font-bold text-sm gap-2">
                      <Save size={18} /> {t('common:save', 'Save')}
                    </button>
                    <button onClick={() => setIsEditing(false)} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center shadow-lg hover:bg-white/40 transition-colors">
                      <X size={20} />
                    </button>
                  </>
                ) : (
                  <button onClick={() => setIsActionSheetOpen(true)} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center shadow-lg hover:bg-white/40 transition-colors">
                     <EllipsisVertical size={20} strokeWidth={2.5} />
                  </button>
                )}
             </div>
          </div>

          {isEditing ? (
            <input 
              className="w-full text-2xl lg:text-3xl font-bold text-gray-900 leading-tight mb-3 border-b-2 border-primary-300 focus:outline-none focus:border-primary-500 bg-transparent py-1"
              value={viewModel.title}
              onChange={e => handleEditField('title', e.target.value)}
              placeholder="Video Title"
            />
          ) : (
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 leading-tight mb-3">{viewModel.title}</h1>
          )}
          
          <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-6">
              {viewModel.originalUrl && (
                <a href={viewModel.originalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 group/author">
                  <PlatformIcon platform={viewModel.platform} />
                  <span className="text-xs font-medium text-gray-500 truncate group-hover/author:text-gray-900 transition-colors">
                    {viewModel.author.replace('@', '')}
                  </span>
                </a>
              )}
              {viewModel.savedAt && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Save size={14} className="text-gray-400" />
                  <span>{viewModel.savedAt}</span>
                </div>
              )}
          </div>
          
          <div className="bg-primary-50 rounded-2xl p-6 mb-6">
             <h3 className="text-primary-700 font-bold mb-3 text-sm uppercase tracking-wide">AI Summary</h3>
             {isEditing ? (
               <textarea 
                 className="w-full text-gray-700 leading-relaxed mb-4 font-medium bg-white/50 border border-primary-200 rounded-xl p-3 focus:outline-none focus:border-primary-500 min-h-[100px]"
                 value={viewModel.summary}
                 onChange={e => handleEditField('summary', e.target.value)}
                 placeholder="Summary"
               />
             ) : (
               <div className="text-gray-700 leading-relaxed mb-4 font-medium whitespace-pre-line">
                 {viewModel.summary}
               </div>
             )}
             
             <div className="space-y-3">
               {viewModel.bullets.map((bullet: any, idx: number) => (
                 <div key={idx} className="flex items-start gap-3 text-gray-600 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-400 mt-2 flex-shrink-0"></div>
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input 
                          className="flex-1 bg-transparent border-b border-primary-100 focus:outline-none focus:border-primary-400 py-0.5"
                          value={typeof bullet === 'string' ? bullet : bullet.headline}
                          onChange={e => handleEditField('bullet', e.target.value, idx)}
                        />
                        <button onClick={() => handleEditField('remove_bullet', null, idx)} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
                      </div>
                    ) : (
                      <span className="leading-relaxed">
                        {bullet.headline ? `${bullet.headline}: ${bullet.text}` : safeString(bullet)}
                      </span>
                    )}
                 </div>
               ))}
               {isEditing && (
                 <button 
                   onClick={() => handleEditField('add_bullet', null)}
                   className="text-xs font-bold text-primary-600 hover:text-primary-700 mt-2 flex items-center gap-1"
                 >
                   <Plus size={14} /> Add Bullet Point
                 </button>
               )}
             </div>
          </div>

          {viewModel.recipe && (
            <RecipeDetailsCard 
              recipe={viewModel.recipe}
              servingScale={servingScale}
              scaleQuantity={scaleQuantity}
              onServingScaleChange={setServingScale}
            />
          )}

          {/* Caption Block (Bottom Left) */}
          {(viewModel.caption || viewModel.transcript) && (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden p-5 mt-8 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-gray-100 text-gray-600 rounded-md">
                  <AlignLeft size={16} />
                </div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Caption</h4>
              </div>
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-medium">
                {viewModel.caption || viewModel.transcript}
              </div>
            </div>
          )}

        </div>

        {/* DESKTOP: RIGHT COLUMN */}
        <div className="space-y-8">
           <div className="space-y-6">
               
               {/* Metadata / Hashtags Block */}
               <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                 {/* Category Row */}
                 <div className="p-5 flex flex-col gap-2 hover:bg-gray-50/50 transition-colors">
                   <div className="flex items-center gap-2">
                     <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md">
                       <LayersIcon size={16} />
                     </div>
                     <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Category</span>
                   </div>
                   {isEditing ? (
                     <input 
                       className="text-lg font-bold text-gray-900 pl-1 leading-snug border-b border-primary-200 focus:outline-none focus:border-primary-500 bg-transparent"
                       value={viewModel.category}
                       onChange={e => handleEditField('category', e.target.value)}
                     />
                   ) : (
                     <div className="text-lg font-bold text-gray-900 pl-1 leading-snug">
                       {viewModel.category}
                     </div>
                   )}
                 </div>

                 {/* Topic Row */}
                 {(isEditing || viewModel.subCategory) && (
                   <div className="p-5 border-t border-gray-50 flex flex-col gap-2 hover:bg-gray-50/50 transition-colors">
                     <div className="flex items-center gap-2">
                       <div className="p-1.5 bg-purple-50 text-purple-600 rounded-md">
                         <Hash size={16} />
                       </div>
                       <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Topic</span>
                     </div>
                     {isEditing ? (
                       <input 
                         className="text-lg font-bold text-gray-900 pl-1 leading-snug border-b border-primary-200 focus:outline-none focus:border-primary-500 bg-transparent"
                         value={viewModel.subCategory}
                         onChange={e => handleEditField('topic', e.target.value)}
                         placeholder="Add Topic"
                       />
                     ) : (
                       <div className="text-lg font-bold text-gray-900 pl-1 leading-snug">
                         {viewModel.subCategory}
                       </div>
                     )}
                   </div>
                 )}

                 {/* Hashtags Row */}
                 <div className="p-5 border-t border-gray-50 bg-gray-50/30">
                   <div className="flex items-center gap-2 mb-3">
                     <div className="p-1.5 bg-tertiary-50 text-tertiary-600 rounded-md">
                       <TagsIcon size={16} />
                     </div>
                     <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Hashtags</span>
                   </div>
                   
                   <div className="flex flex-wrap gap-2">
                     {isEditing ? (
                       <div className="w-full space-y-2">
                         <div className="flex flex-wrap gap-2">
                           {viewModel.tags.map((tag: string, idx: number) => (
                             <div key={idx} className="inline-flex items-center justify-center px-[0.9rem] py-[0.375rem] rounded-full bg-[#e0f2fe] text-[#075985] border border-[#7dd3fc] text-xs font-bold shadow-sm">
                               <span className="text-xs font-bold text-[#075985]">#{safeString(tag).replace('#', '')}</span>
                               <button 
                                 onClick={() => handleEditField('tags', viewModel.tags.filter((_: any, i: number) => i !== idx))}
                                 className="text-[#075985] hover:text-red-500 opacity-70 hover:opacity-100 ml-1.5"
                               >
                                 <X size={12} />
                               </button>
                             </div>
                           ))}
                         </div>
                         <input 
                           className="w-full text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tertiary-400"
                           placeholder="Add hashtag (press enter)"
                           onKeyDown={e => {
                             if (e.key === 'Enter') {
                               const val = (e.target as HTMLInputElement).value.trim();
                               if (val) {
                                 const tag = val.startsWith('#') ? val : `#${val}`;
                                 handleEditField('tags', [...viewModel.tags, tag]);
                                 (e.target as HTMLInputElement).value = '';
                               }
                             }
                           }}
                         />
                       </div>
                     ) : (
                       viewModel.tags.map((tag: string, idx: number) => (
                         <span 
                           key={idx} 
                           className="inline-flex items-center justify-center px-[0.9rem] py-[0.375rem] rounded-full bg-[#e0f2fe] text-[#075985] border border-[#7dd3fc] text-xs font-bold shadow-sm transition-all hover:bg-[#bae6fd] hover:border-[#38bdf8] hover:-translate-y-[1px] cursor-default"
                         >
                           #{safeString(tag).replace('#', '')}
                         </span>
                       ))
                     )}
                   </div>
                 </div>
               </div>

               {/* Transcription Block */}
               {viewModel.transcript && (
                 <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                    <button 
                      onClick={() => setTranscriptOpen(!transcriptOpen)}
                      className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                         <div className="p-1.5 bg-gray-100 text-gray-600 rounded-md">
                            <CustomMessageSquareMoreIcon size={16} />
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

              {/* View on IG/FB Button */}
              {viewModel.originalUrl && (
                <div className="space-y-3">
                   <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Original Link</h4>
                   <a href={viewModel.originalUrl} target="_blank" rel="noreferrer" className="block">
                      <button className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-white font-bold text-sm shadow-md transition ${viewModel.platform === 'fb' ? 'bg-[#1877F2] hover:bg-[#166FE5]' : 'bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] hover:opacity-90'}`}>
                         {viewModel.platform === 'fb' ? <FacebookExternalIcon size={16} className="text-white" /> : <InstagramExternalIcon size={16} className="text-white" />} 
                         View on {viewModel.platform === 'fb' ? 'Facebook' : 'Instagram'}
                      </button>
                   </a>
                </div>
              )}
           </div>
        </div>
      </div>

      {/* ======================= MOBILE LAYOUT (VISIBLE ON MOBILE) ======================= */}
      <div className="block md:hidden">
        <VideoDetailMobile
          viewModel={viewModel}
          isEditMode={isEditing}
          tempTitle={viewModel.title}
          tempCategory={viewModel.category}
          tempTopic={viewModel.subCategory}
          tempDescription={viewModel.summary}
          tempBullets={viewModel.bullets}
          tempHashtags={viewModel.tags}
          servingScale={servingScale}
          useMetric={true}
          captionOpen={captionOpen}
          transcriptOpen={transcriptOpen}
          onNavigateBack={() => navigate(-1)}
          onShare={handleShare}
          onModifyToggle={() => setIsEditing(!isEditing)}
          onCancelEdit={() => setIsEditing(false)}
          setTempTitle={(val) => handleEditField('title', val)}
          setTempCategory={(val) => handleEditField('category', val)}
          setTempTopic={(val) => handleEditField('topic', val)}
          setTempDescription={(val) => handleEditField('summary', val)}
          setTempBullets={(val) => handleEditField('tags', val)} 
          setTempHashtags={(val) => handleEditField('tags', val)}
          setServingScale={setServingScale}
          setUseMetric={() => {}}
          setCaptionOpen={setCaptionOpen}
          setTranscriptOpen={setTranscriptOpen}
          onReportClick={() => setIsReportModalOpen(true)}
          onDeleteClick={() => setIsDeleteConfirmOpen(true)}
          onToggleFavorite={handleToggleFavorite}
          onArchiveToggle={handleArchive}
          onMoveToCollection={() => setIsMoveModalOpen(true)}
        />
      </div>

      {/* ─── MODALS & SHEETS ─── */}
      {/* ✅ Included translation inside the title block here */}
      <ActionSheet isOpen={isActionSheetOpen} onClose={() => setIsActionSheetOpen(false)} title={t('videoDetail:settings', 'Settings')} actions={actionItems} />  
      <MoveCollectionModal isOpen={isMoveModalOpen} onClose={() => setIsMoveModalOpen(false)} onMove={handleMove} />
      <ConfirmModal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} onConfirm={handleDelete} title="Delete Video" message="Are you sure you want to delete this video? This action cannot be undone." confirmLabel="Delete" variant="danger" />

      {isReportModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setIsReportModalOpen(false)} />
          <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl relative z-10 overflow-hidden flex flex-col animate-scale-in">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-white sticky top-0 z-20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-50 text-red-600 rounded-xl"><AlertCircle size={20} /></div>
                <h3 className="text-lg font-black text-gray-900 tracking-tight">Report Issue</h3>
              </div>
              <button onClick={() => setIsReportModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="p-8 flex-1 overflow-y-auto min-h-[400px]">
              {reportStep === 1 && (
                <div className="animate-fade-in">
                  <h4 className="text-xl font-bold text-gray-900 mb-8">What type of content is this?</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {['Recipe', 'Workout', 'Beauty', 'Other'].map(type => (
                      <button key={type} onClick={() => { setReportData({...reportData, contentType: type.toLowerCase()}); setReportStep(2); }} className={`p-6 rounded-3xl border-2 text-left transition-all ${reportData.contentType === type.toLowerCase() ? 'border-primary-600 bg-primary-50' : 'border-gray-100 hover:border-gray-200'}`}>
                        <span className="font-black uppercase tracking-widest text-[11px] text-gray-900">{type}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {reportStep === 2 && (
                <div className="animate-fade-in">
                  <h4 className="text-xl font-bold text-gray-900 mb-8">What exactly is wrong?</h4>
                  <div className="space-y-3">
                    {['Wrong poster', 'Wrong summary content', 'Language error'].map(error => (
                      <label key={error} className={`flex items-center gap-4 p-5 rounded-2xl border-2 transition-all cursor-pointer ${reportData.errorType.includes(error) ? 'border-primary-600 bg-primary-50' : 'border-gray-100 hover:border-gray-200'}`}>
                        <input type="checkbox" checked={reportData.errorType.includes(error)} onChange={() => toggleErrorType(error)} className="w-5 h-5 accent-primary-600" />
                        <span className="font-bold text-gray-900">{error}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {reportStep === 3 && (
                <textarea maxLength={300} rows={6} placeholder="Describe the issue..." className="w-full p-5 bg-gray-50 border border-gray-100 rounded-3xl outline-none focus:bg-white focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all text-gray-900 font-medium" value={reportData.details} onChange={(e) => setReportData({...reportData, details: e.target.value})} />
              )}
              {reportStep === 4 && (
                <input type="url" placeholder="Reel URL..." className="w-full p-5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all text-gray-900 font-medium" value={reportData.url} onChange={(e) => setReportData({...reportData, url: e.target.value})} />
              )}
            </div>
            <div className="p-6 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between">
              <Button variant="ghost" onClick={() => reportStep > 1 ? setReportStep(reportStep - 1) : setIsReportModalOpen(false)}>{reportStep > 1 ? 'Previous' : 'Cancel'}</Button>
              <Button variant="primary" onClick={() => reportStep < 4 ? setReportStep(reportStep + 1) : setReportStep(1)} className="px-10 font-black uppercase text-[10px] tracking-widest">{reportStep < 4 ? 'Next' : 'Submit'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};