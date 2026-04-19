// src/pages/VideoDetail.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Trash2, Heart, FolderInput, AlertCircle, X,
  EllipsisVertical, AlignLeft, Pencil, Save, Globe, Folder, Archive,
  MapPin,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import { ActionSheet, ActionItem } from '../components/ActionSheet';
import { MoveCollectionModal } from '../components/MoveCollectionModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { ReportModal } from '../components/ReportModal';
import { EditableTitle, EditableBullets } from '../components/VideoDetailComponents';
import { RecipeDetailsCard } from '../components/RecipeDetailsCard';
import { WorkoutCard } from '../components/WorkoutCard';
import { ToolsListCard } from '../components/ToolsListCard';
import { LocationCard, LocationPlace } from '../components/LocationCard';
import { MetadataPanel } from '../components/MetadataPanel';
import { Skeleton, Accordion, OriginalLink } from '../components/VideoDetailWidgets';
import { ContentTypeBadge, deriveToolsSubtype } from '../components/ContentTypeBadge';
import { useTranslation } from 'react-i18next';
import { useScrollLock } from '../utils/useScrollLock';
import { apiUrl, fetchGcsJson, fetchBackend, HASHTAG_STYLE } from '../utils/videoDetailUtils';
import { CustomMessageSquareMoreIcon, IOSShareIcon, PlatformIconAuthor } from '../components/CustomIcons';
import {
  getPinnedMap, setPinnedMap, mergeVideoPayload, buildViewModel,
  getToolsCategoriesForLanguage, isBadgeToolsSubtype, isToolsContentType,
  parseSummaryObject,
} from './VideoDetailViewModel';


const MoveCollectionModalExt = MoveCollectionModal as React.ComponentType<{
  isOpen: boolean; onClose: () => void; videoIds: string[]; onMove: (folderId: string) => void;
}>;

const ReportModalExt = ReportModal as React.ComponentType<{
  isOpen: boolean; onClose: () => void; videoId?: string;
}>;


export const VideoDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { videos, folders, deleteVideos, moveVideos, toggleFavorite, updateVideo, getVideoById } = useData();
  const { showOriginal, toggleLanguage } = useLanguage();
  const { t } = useTranslation(['videoDetail', 'common', 'modals']);

  const [video, setVideo] = useState<any>(null);
  const [galleryThumbnail, setGalleryThumbnail] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedVideo, setEditedVideo] = useState<any>(null);
  const [servingScale, setServingScale] = useState(1);
  const [useMetric, setUseMetric] = useState(true);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  useScrollLock(isActionSheetOpen || isMoveModalOpen || isReportModalOpen || isDeleteConfirmOpen);

  const enrichVideo = useCallback(async () => {
    if (!id || !navigator.onLine) { setLoading(false); return; }
    try {
      const db = await fetchBackend(apiUrl(`api/reel/${encodeURIComponent(id)}`));
      if (!db) { setLoading(false); return; }
      const gcs = db.gcs_urls?.result_json ? await fetchGcsJson(db.gcs_urls.result_json) : null;
      const pins = getPinnedMap();
      const merged = mergeVideoPayload(db, gcs, galleryThumbnail);
      setVideo((prev: any) => ({
        ...(prev || {}),
        ...merged,
        location_saved: pins[id] ?? merged.location_saved ?? prev?.location_saved ?? false,
      }));
    } catch (err) {
      console.error('Enrichment error', err);
    } finally {
      setLoading(false);
    }
  }, [id, galleryThumbnail]);

  useEffect(() => {
    if (!id) return;
    const cached = (getVideoById(id) as any) || videos.find((v: any) => v.id === id || v.process_id === id);
    if (cached) {
      const pins = getPinnedMap();
      const thumb = cached.thumbnailUrl || cached.gcs_urls?.preview_thumbnail;
      if (thumb) setGalleryThumbnail(thumb);
      setVideo({
        ...cached,
        id: cached.id || cached.process_id,
        process_id: cached.process_id || cached.id,
        location_saved: pins[id] ?? cached.location_saved ?? false,
      });
      setLoading(false);
    }
  }, [id, videos, getVideoById]);

  const fetchedId = useRef<string | null>(null);
  useEffect(() => {
    if (id && fetchedId.current !== id) {
      fetchedId.current = id;
      enrichVideo();
    }
  }, [id, enrichVideo]);

  useEffect(() => {
    if (isEditing && video) setEditedVideo(JSON.parse(JSON.stringify(video)));
  }, [isEditing, video]);

  const handleEditField = (field: string, value: any) => {
    setEditedVideo((prev: any) => {
      if (!prev) return prev;
      const next = { ...prev };
      let s = parseSummaryObject(next.summary);
      const lk = showOriginal && s.english && s.original ? 'original' : 'english';
      s[lk] = { ...(s[lk] || {}) };
      if (field === 'title') { next.title = value; next.summary_title = value; s[lk].title = value; }
      if (field === 'summary') { next.summary_text = value; s[lk].summary = value; }
      if (field === 'bullets') { next.bullets = value; s[lk].headlines = value; }
      if (field === 'category') { next.category = value; next.summary_category = value; }
      if (field === 'topic') { next.topic = value; next.summary_topic = value; next.subCategory = value; }
      if (field === 'tags') { next.tags = value; s[lk].hashtags = value; }
      next.summary = s;
      return next;
    });
  };

  const handleToggleFavorite = () => toggleFavorite(video.id);

  const handleArchive = () => { moveVideos(video.id, 'archive'); setIsActionSheetOpen(false); };

  const handleDelete = async () => {
    if (!video?.id) return;
    try { await deleteVideos([video.id]); } catch (err) { console.error('Delete failed', err); } finally {
      setIsDeleteConfirmOpen(false);
      navigate('/gallery', { replace: true });
    }
  };

  const handleSaveEdit = () => {
    if (editedVideo && video && typeof updateVideo === 'function') {
      updateVideo(video.id, editedVideo);
      setVideo(editedVideo);
    }
    setIsEditing(false);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: video.title, url: window.location.href }); } catch {}
    } else {
      await navigator.clipboard.writeText(window.location.href);
      alert(t('videoDetail:linkCopied', 'Link copied!'));
    }
  };

  const handleSavePlace = useCallback(
    (_place: any, index: number, saved: boolean) => {
      if (!id) return;
      const pins = getPinnedMap();
      const key = `${id}:${index}`;
      if (saved) { pins[key] = true; } else { delete pins[key]; }
      setPinnedMap(pins);
    },
    [id],
  );

  const findFolderById = (targetId: string, list: any[]): any | null => {
    for (const f of list) {
      if (f.id === targetId) return f;
      if (f.subFolders?.length) { const found = findFolderById(targetId, f.subFolders); if (found) return found; }
    }
    return null;
  };

  const folderName = useMemo(() => {
    const fid = video?.folderId || video?.folderid || video?.folder_id;
    if (!fid || ['all', 'unsorted', 'default'].includes(fid)) return null;
    return findFolderById(fid, folders)?.name ?? null;
  }, [video, folders]);

  const viewModel = useMemo(() => {
    if (!video) return null;
    const v = isEditing && editedVideo ? editedVideo : video;
    return buildViewModel(v, showOriginal, galleryThumbnail);
  }, [video, editedVideo, isEditing, showOriginal, galleryThumbnail]);

  if (loading || !viewModel) return <Skeleton />;

  const toolsCategories = getToolsCategoriesForLanguage(viewModel.toolsList, showOriginal);
  const hasToolsList = Array.isArray(toolsCategories)
    && toolsCategories.some((cat: any) => Array.isArray(cat?.items) && cat.items.length > 0);

  const hasBullets = Array.isArray(viewModel.bullets) && viewModel.bullets.length > 0;

  const structuredBadgeSubtype = isBadgeToolsSubtype(viewModel.structuredType)
    ? viewModel.structuredType
    : undefined;
  const derivedSubtype = deriveToolsSubtype(viewModel.toolsList);
  const safeDerivedSubtype = isBadgeToolsSubtype(derivedSubtype) ? derivedSubtype : 'picks';
  const toolsSubtype = isToolsContentType(viewModel.contentType)
    ? structuredBadgeSubtype ?? safeDerivedSubtype
    : undefined;

  const showTypeBadge = viewModel.contentType !== 'general';

  const normalizedLocations: LocationPlace[] = viewModel.location
    ? (viewModel.location.places ?? viewModel.location.items ?? [])
    : [];
  const hasLocations = normalizedLocations.length > 0;

  // Show ToolsListCard whenever there are categories with items — no content type gate needed.
  const showToolsListCard =
    hasToolsList &&
    (viewModel.isStructuredTools || !!viewModel.structuredType || !hasBullets);

  const actionItems = (video ? [
    { icon: <IOSShareIcon />, label: t('videoDetail:share', 'Share'), onClick: handleShare },
    { icon: <Pencil />, label: t('videoDetail:editReel', 'Edit details'), onClick: () => setIsEditing(true) },
    {
      icon: <Heart />,
      label: video.isFavorite ? t('videoDetail:removeFromFavorites') : t('videoDetail:addToFavorites'),
      onClick: handleToggleFavorite,
      variant: video.isFavorite ? 'default' : 'primary',
    },
    { icon: <FolderInput />, label: t('videoDetail:moveToCollection', 'Move to Collection'), onClick: () => setIsMoveModalOpen(true) },
    { icon: <Archive />, label: t('videoDetail:archive', 'Archive'), onClick: handleArchive },
    { icon: <Trash2 />, label: t('videoDetail:deleteReel', 'Delete'), onClick: () => setIsDeleteConfirmOpen(true), variant: 'danger' },
    { icon: <AlertCircle />, label: t('videoDetail:reportIssue', 'Report issue'), onClick: () => setIsReportModalOpen(true) },
  ] : []) as unknown as ActionItem[];

  return (
    <div className="animate-fade-in relative px-0 pb-20 md:pb-6">
      <style>{HASHTAG_STYLE}</style>

      <div className="flex flex-col md:grid md:grid-cols-[1.5fr_1fr] md:gap-6 items-start">
        <div className="min-w-0 w-full flex flex-col">
          <div className="relative w-full aspect-9/8 bg-black rounded-2xl overflow-hidden shadow-sm mb-5 group mt-[calc(env(safe-area-inset-top,0px)+0.75rem)] md:mt-0">
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
              <button
                onClick={() => navigate(-1)}
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center shadow-lg hover:bg-white/40 transition-colors"
              >
                <ArrowLeft size={20} />
              </button>

              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSaveEdit}
                      className="hidden md:flex h-10 px-4 rounded-full bg-emerald-500 text-white items-center justify-center shadow-lg font-bold text-sm gap-2"
                    >
                      <Save size={18} /> {t('common:save', 'Save')}
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center"
                    >
                      <X size={20} />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsActionSheetOpen(true)}
                    className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-md border border-white/40 text-white flex items-center justify-center hover:bg-white/40 transition-colors"
                  >
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

              <div className="flex flex-col items-end gap-1.5">
                {viewModel.duration && viewModel.duration !== '0:00' && (
                  <div className="bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-medium text-white">
                    {viewModel.duration}
                  </div>
                )}
                {showTypeBadge && (
                  <ContentTypeBadge type={viewModel.contentType as any} toolsSubtype={toolsSubtype} />
                )}
                {hasLocations && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide uppercase bg-teal-50/90 text-teal-700 border-teal-200/80 backdrop-blur-sm">
                    <MapPin size={10} strokeWidth={2.5} aria-hidden="true" />
                    Places
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mb-3">
            <EditableTitle
              title={viewModel.title}
              isEditMode={isEditing}
              value={viewModel.title}
              onChange={(val: string) => handleEditField('title', val)}
            />
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
                <span>{viewModel.savedAt}</span>
              </div>
            )}
          </div>

          <MetadataPanel
            variant="mobile"
            category={viewModel.category}
            subCategory={viewModel.subCategory}
            tags={viewModel.tags}
            isEditing={isEditing}
            onEditCategory={(v: string) => handleEditField('category', v)}
            onEditTopic={(v: string) => handleEditField('topic', v)}
            onEditStart={() => setIsEditing(true)}
          />

          <div className="bg-primary-50 rounded-2xl p-5 md:p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-primary-700 font-bold text-sm uppercase tracking-wide">
                {t('videoDetail:aiSummary', 'AI Summary')}
              </h3>
              {viewModel.hasTranslation && !isEditing && (
                <button
                  onClick={(e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); toggleLanguage(); }}
                  className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm bg-primary-600 hover:bg-primary-700 text-white transition-colors"
                >
                  <Globe size={14} />
                  <span className="text-[11px] font-bold uppercase">
                    {showOriginal ? viewModel.languageCode : 'EN'}
                  </span>
                </button>
              )}
            </div>

            {isEditing ? (
              <textarea
                className="w-full text-gray-700 leading-relaxed mb-4 font-medium bg-white/50 border border-primary-200 rounded-xl p-3 min-h-25"
                value={viewModel.summary}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleEditField('summary', e.target.value)}
              />
            ) : (
              <div className="text-gray-700 text-sm md:text-base leading-relaxed mb-4 font-medium whitespace-pre-line">
                {viewModel.summary}
              </div>
            )}

            {showToolsListCard ? (
              <div className="mt-4 pt-4 border-t border-primary-100/50">
                <ToolsListCard toolsList={viewModel.toolsList ?? undefined} showOriginal={showOriginal} />
              </div>
            ) : hasBullets ? (
              <div className="space-y-3 mt-4 pt-4 border-t border-primary-100/50">
                {isEditing ? (
                  <EditableBullets
                    bullets={viewModel.bullets}
                    isEditMode={isEditing}
                    value={viewModel.bullets}
                    onChange={(val: any) => handleEditField('bullets', val)}
                  />
                ) : (
                  viewModel.bullets.map((bullet: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 text-gray-600 text-sm">
                      {bullet.emoji && (
                        <span className="text-base leading-none mt-0.5 shrink-0">{bullet.emoji}</span>
                      )}
                      <span className="leading-relaxed">
                        {bullet.headline && <span className="font-bold text-gray-900">{bullet.headline} </span>}
                        {bullet.text || bullet.description || ''}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>

          {viewModel.recipe && !viewModel.recipe.is_compilation && (
            <div className="mb-5">
              <RecipeDetailsCard
                recipe={viewModel.recipe}
                servingScale={servingScale}
                onServingScaleChange={setServingScale}
                useMetric={useMetric}
                onToggleMetric={setUseMetric}
              />
            </div>
          )}

          {viewModel.workout && (
            <WorkoutCard workoutData={viewModel.workout} showOriginal={showOriginal} />
          )}

          {hasLocations && normalizedLocations.length > 0 && (
            <div className="mb-5">
              <LocationCard locations={normalizedLocations} videoId={viewModel.id} />
            </div>
          )}

          {viewModel.caption && (
            <Accordion icon={<AlignLeft size={16} />} label={t('videoDetail:caption', 'Caption')}>
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{viewModel.caption}</div>
            </Accordion>
          )}

          {viewModel.transcript && (
            <div className="md:hidden">
              <Accordion icon={<CustomMessageSquareMoreIcon size={16} />} label={t('videoDetail:transcript', 'Transcript')}>
                <div className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap font-medium italic border-l-2 border-gray-100 pl-4">
                  {viewModel.transcript}
                </div>
              </Accordion>
            </div>
          )}

          {isEditing && (
            <div className="md:hidden mt-4 flex gap-2">
              <button onClick={() => setIsEditing(false)} className="flex-1 py-3 bg-gray-200 rounded-xl text-sm font-bold text-gray-700">
                {t('common:cancel', 'Cancel')}
              </button>
              <button onClick={handleSaveEdit} className="flex-1 py-3 bg-primary-600 rounded-xl text-sm font-bold text-white shadow-lg">
                {t('common:saveChanges', 'Save Changes')}
              </button>
            </div>
          )}

          {viewModel.originalUrl && (
            <OriginalLink url={viewModel.originalUrl} platform={viewModel.platform} t={t} className="md:hidden mt-4" />
          )}
        </div>

        <div className="hidden md:flex flex-col w-full gap-5 mt-0">
          <MetadataPanel
            variant="desktop"
            category={viewModel.category}
            subCategory={viewModel.subCategory}
            tags={viewModel.tags}
            isEditing={isEditing}
            onEditCategory={(v: string) => handleEditField('category', v)}
            onEditTopic={(v: string) => handleEditField('topic', v)}
            onEditStart={() => setIsEditing(true)}
          />

          {viewModel.transcript && (
            <Accordion icon={<CustomMessageSquareMoreIcon size={16} />} label={t('videoDetail:transcript', 'Transcript')}>
              <div className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap font-medium italic border-l-2 border-gray-100 pl-4">
                {viewModel.transcript}
              </div>
            </Accordion>
          )}

          {viewModel.originalUrl && (
            <OriginalLink url={viewModel.originalUrl} platform={viewModel.platform} t={t} />
          )}
        </div>
      </div>

      <ActionSheet isOpen={isActionSheetOpen} onClose={() => setIsActionSheetOpen(false)} actions={actionItems} />

      <MoveCollectionModalExt
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        videoIds={video ? [video.id] : []}
        onMove={(folderId: string) => { moveVideos(video.id, folderId); setIsMoveModalOpen(false); }}
      />

      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title={t('modals:deleteReelTitle', 'Delete Reel')}
        message={t('modals:deleteReelMessage', 'Are you sure?')}
        confirmLabel={t('modals:confirmDelete', 'Delete')}
        cancelLabel={t('common:cancel', 'Cancel')}
        variant="danger"
      />

      <ReportModalExt
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        videoId={video?.id}
      />
    </div>
  );
};