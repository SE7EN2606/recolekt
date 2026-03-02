import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, ChevronDown, Heart, FolderInput, AlertCircle, X, EllipsisVertical, Archive, Hash, AlignLeft, Pencil, Plus, Save, Globe } from 'lucide-react';
import { Button } from '../components/Button';
import { useData } from '../context/DataContext';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ActionSheet, ActionItem } from '../components/ActionSheet';
import { MoveCollectionModal } from '../components/MoveCollectionModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { useTranslation } from 'react-i18next';
import { getCategory, getTopic } from '../utils/videoUtils';
import { scaleQuantity } from '../utils/conversionUtils';
import { RecipeDetailsCard } from '../components/RecipeDetailsCard';
import { VideoDetailMobile } from '../components/VideoDetailMobile';

/* ─── CONDENSED ICONS ─── */
const CustomMessageSquareMoreIcon = ({ size=16, className="" }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 11h.01"/><path d="M16 11h.01"/><path d="M8 11h.01"/></svg>;
const IOSShareIcon = ({ size=24, className="" }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/></svg>;
const InstagramExternalIcon = ({ size=16, className="" }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>;
const FacebookExternalIcon = ({ size=16, className="" }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>;
const LayersIcon = ({ size=24, className="" }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/></svg>;
const TagsIcon = ({ size=24, className="" }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1z"/><path d="M2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193"/><circle cx="10.5" cy="6.5" r=".5" fill="currentColor"/></svg>;
const PlatformIcon = ({ platform }: { platform: string }) => platform === 'fb' ? <FacebookExternalIcon size={12} className="text-blue-600 flex-shrink-0" /> : <InstagramExternalIcon size={12} className="text-pink-500 flex-shrink-0" />;

/* ─── API & HELPERS ─── */
const RAW_API_BASE = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || 'http://localhost:5001';
const API_BASE = String(RAW_API_BASE ?? '').trim().replace(/\/+$/, '');
function apiUrl(path: string) { return API_BASE ? `${API_BASE}/${path.replace(/^\/+/, '')}` : `/${path.replace(/^\/+/, '')}`; }

async function fetchGcsJson<T = any>(url: string): Promise<T> {
  const finalUrl = import.meta.env.DEV ? url.replace('https://storage.googleapis.com', '/gcs-proxy') : url;
  const res = await fetch(finalUrl, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error(`GCS HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const safeString = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return safeString(val[0]);
  if (typeof val === 'object') return String(val.text || val.title || val.summary || val.headline || val.name || '');
  return String(val);
};

/* ─── SKELETON LOADER ─── */
const VideoDetailSkeleton = () => (
  <div className="animate-pulse relative w-full pb-12">
    <div className="hidden md:grid md:grid-cols-[1.5fr_1fr] gap-12 items-start">
      <div className="min-w-0">
        <div className="w-full aspect-[9/8] bg-gray-200/80 rounded-2xl mb-6"></div>
        <div className="h-10 bg-gray-200/80 rounded-lg w-3/4 mb-4"></div>
        <div className="h-4 bg-gray-200/80 rounded-md w-1/3 mb-8"></div>
        <div className="bg-primary-50/60 rounded-2xl p-6 h-[250px]"></div>
      </div>
      <div className="space-y-6 pt-2">
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl h-[350px]"></div>
        <div className="h-12 bg-gray-200/80 rounded-xl w-full"></div>
      </div>
    </div>
    <div className="block md:hidden px-4 pt-4">
      <div className="w-full aspect-[9/16] bg-gray-200/80 rounded-[32px] mb-6"></div>
      <div className="h-8 bg-gray-200/80 rounded-lg w-4/5 mb-4"></div>
      <div className="h-4 bg-gray-200/80 rounded-md w-2/5 mb-8"></div>
      <div className="bg-gray-100/80 rounded-3xl h-[200px] mb-6"></div>
    </div>
  </div>
);

/* ─── MAIN COMPONENT ─── */
export const VideoDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const { videos, deleteVideos, moveVideos, toggleFavorite, updateVideo } = useData();
  const { user, loading: authLoading } = useAuth();
  const { showOriginal, toggleLanguage } = useLanguage(); 
  const { t } = useTranslation(['videoDetail', 'common']);

  const [video, setVideo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedVideo, setEditedVideo] = useState<any | null>(null);
  const [servingScale, setServingScale] = useState(1);

  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // 1. Parallel Fetch Data
  const fetchedId = useRef<string | null>(null);

  const enrichVideo = useCallback(async () => {
    if (!id) return;
    try {
      const dbFetch = fetch(apiUrl(`api/reel/${encodeURIComponent(id)}`), { headers: getAuthHeaders() })
        .then(res => res.ok ? res.json() : null).catch(() => null);

      const short = id.split('--')[0];
      const isFB = id.includes('FB') || short.length < 5;
      const folder = isFB ? 'FB_reels' : 'IG_reels';
      
      const newUrl = `https://storage.googleapis.com/recolekt-storage/media/${folder}/${id}/${short}_result.json`;
      const oldUrl = `https://storage.googleapis.com/recolekt-storage/media/${folder}/${short}/${short}_result.json`;

      const gcsFetch = fetchGcsJson(newUrl).catch(() => fetchGcsJson(oldUrl)).catch(() => ({}));

      const [dbData, gcsData] = await Promise.all([dbFetch, gcsFetch]);

      setVideo((prev: any) => {
        const contextVideo = videos.find((v: any) => v.id === id) || { id };
        return { ...contextVideo, ...prev, ...dbData, ...gcsData, __raw: dbData };
      });
    } catch (err) {
      console.warn("Network fetch skipped or failed.");
    } finally {
      setLoading(false);
    }
  }, [id, videos]);

  useEffect(() => {
    if (id && fetchedId.current !== id) {
      fetchedId.current = id;
      enrichVideo();
    }
  }, [id, enrichVideo]);

  // 2. Sync with Global Context (Fixes the Empty Hard Refresh)
  useEffect(() => {
    if (!id || videos.length === 0) return;
    setVideo((prev: any) => {
      if (prev?.id === id && prev?.summary) {
        setLoading(false);
        return prev;
      }
      const cached = videos.find((v: any) => v.id === id); 
      if (cached) {
        if (cached.summary || cached.status !== 'done') setLoading(false);
        return { ...cached, ...prev };
      }
      return prev;
    });
  }, [id, videos]);

  // Editor Logic sync
  useEffect(() => { if (isEditing && video) setEditedVideo(JSON.parse(JSON.stringify(video))); }, [isEditing, video]);

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

      if (field === 'title') { next.title = value; next.display_title = value; summaryObj[langKey].title = value; }
      else if (field === 'summary') { next.summary_text = value; summaryObj[langKey].summary = value; }
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
  const handleSaveEdit = () => { if (editedVideo) { updateVideo(video.id, editedVideo); setVideo(editedVideo); setIsEditing(false); } };

  const handleShare = async () => {
    if (navigator.share) { try { await navigator.share({ title: video.title, url: window.location.href }); } catch (err) {} } 
    else { await navigator.clipboard.writeText(window.location.href); alert('Link copied!'); }
  };

  const actionItems: ActionItem[] = [
    { icon: IOSShareIcon, label: t('videoDetail:share', "Share Video"), onClick: handleShare },
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
    
    // 🔥 3. Extremely safe Recipe parsing
    let recipeData = v.recipe;
    if (typeof recipeData === 'string') { 
        try { recipeData = JSON.parse(recipeData); } catch (e) { recipeData = null; } 
    }
    if (recipeData && recipeData.recipe) {
        recipeData = recipeData.recipe;
    }
    
    let activeRecipe = null;
    if (recipeData && Object.keys(recipeData).length > 0) {
        if (showOriginal && recipeData.original) activeRecipe = recipeData.original;
        else if (recipeData.english) activeRecipe = recipeData.english;
        else activeRecipe = recipeData;
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
      transcript: typeof (v.transcription || v.transcript) === 'string' ? v.transcript : v.transcription?.transcript || '',
      caption: typeof v.caption === 'string' ? v.caption : v.caption?.text || '',
      recipe: activeRecipe,
      thumbnailUrl: safeString(v.thumbnailUrl || v.gcs_urls?.preview_thumbnail || v.preview || ''),
      originalUrl: safeString(v.source_url || v.originalUrl || ''),
      platform: safeString(v.source_url || v.originalUrl || '').includes('facebook') ? 'fb' : 'instagram',
      savedAt: safeString(v.savedAt || (v.created_at ? new Date(v.created_at).toLocaleDateString() : '')),
      hasTranslation: !!(summaryObj.english && summaryObj.original),
      languageCode: (v.transcription?.detected_language || 'en').toUpperCase()
    };
  }, [video, editedVideo, isEditing, showOriginal]);

  if (loading || !viewModel || (!viewModel.title && !viewModel.thumbnailUrl)) {
    return <VideoDetailSkeleton />;
  }

  return (
    <div className="animate-fade-in relative">
      {/* DESKTOP LAYOUT */}
      <div className="hidden md:grid md:grid-cols-[1.5fr_1fr] gap-12 items-start pb-12">
        <div className="min-w-0">
          <div className="relative w-full aspect-[9/8] bg-black rounded-2xl overflow-hidden shadow-sm mb-6 group">
            {viewModel.thumbnailUrl && <img src={viewModel.thumbnailUrl} alt={viewModel.title} className="w-full h-full object-cover opacity-90" />}
             <div className="absolute top-4 left-4 z-20">
                <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center shadow-lg hover:bg-white/40"><ArrowLeft size={20} /></button>
             </div>
             {viewModel.hasTranslation && !isEditing && (
              <button onClick={toggleLanguage} className="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg flex items-center gap-1.5 z-30 shadow-lg bg-primary-600 hover:bg-primary-700 text-white">
                <Globe size={14} /><span className="text-[11px] font-bold uppercase">{showOriginal ? viewModel.languageCode : 'EN'}</span>
              </button>
            )}
             <div className="absolute top-4 right-4 z-20 flex gap-2">
                {isEditing ? (
                  <>
                    <button onClick={handleSaveEdit} className="h-10 px-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg font-bold text-sm gap-2"><Save size={18} /> Save</button>
                    <button onClick={() => setIsEditing(false)} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center"><X size={20} /></button>
                  </>
                ) : (
                  <button onClick={() => setIsActionSheetOpen(true)} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center"><EllipsisVertical size={20} /></button>
                )}
             </div>
          </div>

          {isEditing ? (
            <input className="w-full text-2xl lg:text-3xl font-bold text-gray-900 leading-tight mb-3 border-b-2 border-primary-300 focus:outline-none focus:border-primary-500 bg-transparent py-1" value={viewModel.title} onChange={e => handleEditField('title', e.target.value)} />
          ) : (
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 leading-tight mb-3">{viewModel.title}</h1>
          )}
          
          <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-6">
              {viewModel.originalUrl && (
                <a href={viewModel.originalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 group/author">
                  <PlatformIcon platform={viewModel.platform} />
                  <span className="text-xs font-medium text-gray-500 truncate group-hover/author:text-gray-900">{viewModel.author.replace('@', '')}</span>
                </a>
              )}
          </div>
          
          <div className="bg-primary-50 rounded-2xl p-6 mb-6">
             <h3 className="text-primary-700 font-bold mb-3 text-sm uppercase tracking-wide">AI Summary</h3>
             {isEditing ? (
               <textarea className="w-full text-gray-700 leading-relaxed mb-4 font-medium bg-white/50 border border-primary-200 rounded-xl p-3 focus:outline-none focus:border-primary-500 min-h-[100px]" value={viewModel.summary} onChange={e => handleEditField('summary', e.target.value)} />
             ) : (
               <div className="text-gray-700 leading-relaxed mb-4 font-medium whitespace-pre-line">{viewModel.summary}</div>
             )}
          </div>

          {viewModel.recipe && (
            <RecipeDetailsCard recipe={viewModel.recipe} servingScale={servingScale} scaleQuantity={scaleQuantity} onServingScaleChange={setServingScale} />
          )}
        </div>

        {/* DESKTOP RIGHT COLUMN */}
        <div className="space-y-6">
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 flex flex-col gap-2">
                <div className="flex items-center gap-2"><div className="p-1.5 bg-blue-50 text-blue-600 rounded-md"><LayersIcon size={16} /></div><span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Category</span></div>
                {isEditing ? <input className="text-lg font-bold text-gray-900 border-b border-primary-200 focus:outline-none focus:border-primary-500" value={viewModel.category} onChange={e => handleEditField('category', e.target.value)} /> : <div className="text-lg font-bold text-gray-900">{viewModel.category}</div>}
                </div>

                {/* HASHTAGS */}
                <div className="p-5 border-t border-gray-50 bg-gray-50/30">
                <div className="flex items-center gap-2 mb-3"><div className="p-1.5 bg-tertiary-50 text-tertiary-600 rounded-md"><TagsIcon size={16} /></div><span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Hashtags</span></div>
                <div className="flex flex-wrap gap-2">
                    {viewModel.tags.map((tag: string, idx: number) => (
                        <span key={idx} className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-[#e0f2fe] text-[#075985] text-xs font-bold shadow-sm">#{safeString(tag).replace('#', '')}</span>
                    ))}
                </div>
                </div>
            </div>

            {viewModel.originalUrl && (
            <a href={viewModel.originalUrl} target="_blank" rel="noreferrer" className="block">
                <button className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-white font-bold text-sm shadow-md transition ${viewModel.platform === 'fb' ? 'bg-[#1877F2]' : 'bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF]'}`}>
                    View on {viewModel.platform === 'fb' ? 'Facebook' : 'Instagram'}
                </button>
            </a>
            )}
        </div>
      </div>

      {/* MOBILE LAYOUT */}
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
          setTempBullets={() => {}} 
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

      <ActionSheet isOpen={isActionSheetOpen} onClose={() => setIsActionSheetOpen(false)} title="Settings" actions={actionItems} />  
      <MoveCollectionModal isOpen={isMoveModalOpen} onClose={() => setIsMoveModalOpen(false)} onMove={(id) => { moveVideos([video.id], id); setIsMoveModalOpen(false); }} />
      <ConfirmModal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} onConfirm={handleDelete} title="Delete this reel?" message="This action cannot be undone." confirmLabel="Delete" variant="danger" />
    </div>
  );
};