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
import { LocationCard } from '../components/LocationCard';
import { MetadataPanel } from '../components/MetadataPanel';
import { Skeleton, Accordion, OriginalLink } from '../components/VideoDetailWidgets';
import { ContentTypeBadge, deriveToolsSubtype } from '../components/ContentTypeBadge';
import { useTranslation } from 'react-i18next';
import { useScrollLock } from '../utils/useScrollLock';
import { apiUrl, fetchGcsJson, HASHTAG_STYLE } from '../utils/videoDetailUtils';
import { CustomMessageSquareMoreIcon, IOSShareIcon, PlatformIconAuthor } from '../components/CustomIcons';
import {
  mergeVideoPayload,
  buildViewModel,
  getToolsCategoriesForLanguage,
  isBadgeToolsSubtype,
  isToolsContentType,
  parseSummaryObject,
} from './VideoDetailViewModel';

const MoveCollectionModalExt = MoveCollectionModal as React.ComponentType<{
  isOpen: boolean;
  onClose: () => void;
  videoIds: string[];
  onMove: (folderId: string) => void;
}>;

const ReportModalExt = ReportModal as React.ComponentType<{
  isOpen: boolean;
  onClose: () => void;
  videoId?: string;
}>;

const getAuthToken = (): string => {
  try {
    const direct =
      (window as any).__REKOLEKT_TOKEN__ ||
      localStorage.getItem('auth_token') ||
      localStorage.getItem('token') ||
      localStorage.getItem('access_token') ||
      localStorage.getItem('jwt') ||
      localStorage.getItem('recolekt_token') ||
      '';

    if (direct) {
      return String(direct).replace(/^Bearer\s+/i, '').trim();
    }

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;

      const value = localStorage.getItem(key);
      if (!value) continue;

      const lowerKey = key.toLowerCase();
      const looksRelevant =
        lowerKey.includes('token') ||
        lowerKey.includes('jwt') ||
        lowerKey.includes('auth');

      const looksLikeJwt = value.split('.').length === 3;

      if (looksRelevant && looksLikeJwt) {
        return value.replace(/^Bearer\s+/i, '').trim();
      }
    }

    return '';
  } catch {
    return '';
  }
};

const fetchBackendAuthed = async (url: string) => {
  const token = getAuthToken();

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
};

const extractLocationPlaces = (location: any): any[] => {
  if (!location) return [];

  if (Array.isArray(location)) {
    return location;
  }

  if (Array.isArray(location.places)) {
    return location.places;
  }

  if (Array.isArray(location.items)) {
    return location.items;
  }

  if (Array.isArray(location.location)) {
    return location.location;
  }

  if (location.location && typeof location.location === 'object') {
    return [location.location];
  }

  if (location.name) {
    return [location];
  }

  return [];
};

const cachedLocationNeedsHydration = (candidate: any, thumb?: string) => {
  try {
    const vm = buildViewModel(candidate, false, thumb);
    const places = extractLocationPlaces(vm?.location);

    if (!places.length) return false;

    return places.some((p: any) =>
      p?.lat == null ||
      p?.lng == null ||
      (!p?.city && !p?.region && !p?.country),
    );
  } catch {
    return false;
  }
};

export const VideoDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    videos,
    folders,
    deleteVideos,
    moveVideos,
    toggleFavorite,
    updateVideo,
    getVideoById,
  } = useData();

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

  useScrollLock(
    isActionSheetOpen || isMoveModalOpen || isReportModalOpen || isDeleteConfirmOpen,
  );

  const enrichVideo = useCallback(async () => {
    if (!id || !navigator.onLine) {
      setLoading(false);
      return;
    }

    try {
      const db = await fetchBackendAuthed(
        apiUrl(`api/reel/${encodeURIComponent(id)}?ts=${Date.now()}`),
      );

      if (!db) {
        setLoading(false);
        return;
      }

      const resultJsonUrl =
        db?.result_json_url ||
        db?.resultJsonUrl ||
        db?.gcs_result_json_url ||
        db?.result_json ||
        db?.gcs_urls?.result_json ||
        db?.gcs_urls?.result_json_url ||
        null;

      const gcs = resultJsonUrl ? await fetchGcsJson(resultJsonUrl) : null;

      const merged = mergeVideoPayload(db, gcs, galleryThumbnail);

      setVideo((prev: any) => ({
        ...(prev || {}),
        ...merged,
        id: merged.id || merged.process_id || db.id || db.process_id || id,
        process_id: merged.process_id || merged.id || db.process_id || db.id || id,
      }));
    } catch (err) {
      console.error('Enrichment error', err);
    } finally {
      setLoading(false);
    }
  }, [id, galleryThumbnail]);

  useEffect(() => {
    if (!id) return;

    const cached =
      (getVideoById(id) as any) ||
      videos.find((v: any) => v.id === id || v.process_id === id);

    if (!cached) {
      setLoading(true);
      return;
    }

    const thumb = cached.thumbnailUrl || cached.gcs_urls?.preview_thumbnail;
    if (thumb) setGalleryThumbnail(thumb);

    const hydratedCached = {
      ...cached,
      id: cached.id || cached.process_id,
      process_id: cached.process_id || cached.id,
    };

    setVideo(hydratedCached);

    const needsHydration =
      navigator.onLine && cachedLocationNeedsHydration(hydratedCached, thumb);

    setLoading(needsHydration);
  }, [id, videos, getVideoById]);

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

  const handleEditField = (field: string, value: any) => {
    setEditedVideo((prev: any) => {
      if (!prev) return prev;

      const next = { ...prev };
      const summary = parseSummaryObject(next.summary);
      const langKey = showOriginal && summary.english && summary.original
        ? 'original'
        : 'english';

      summary[langKey] = { ...(summary[langKey] || {}) };

      if (field === 'title') {
        next.title = value;
        next.summary_title = value;
        summary[langKey].title = value;
      }

      if (field === 'summary') {
        next.summary_text = value;
        summary[langKey].summary = value;
      }

      if (field === 'bullets') {
        next.bullets = value;
        summary[langKey].headlines = value;
      }

      if (field === 'category') {
        next.category = value;
        next.summary_category = value;
      }

      if (field === 'topic') {
        next.topic = value;
        next.summary_topic = value;
        next.subCategory = value;
      }

      if (field === 'tags') {
        next.tags = value;
        summary[langKey].hashtags = value;
      }

      next.summary = summary;
      return next;
    });
  };

  const currentVideoId = useMemo(
    () => video?.id || video?.process_id || id || '',
    [video?.id, video?.process_id, id],
  );

  const handleToggleFavorite = () => {
    if (!currentVideoId) return;
    toggleFavorite(currentVideoId);
  };

  const handleArchive = () => {
    if (!currentVideoId) return;
    moveVideos([currentVideoId], 'archive');
    setIsActionSheetOpen(false);
  };

  const handleDelete = async () => {
    if (!currentVideoId) return;

    try {
      await deleteVideos([currentVideoId]);
    } catch (err) {
      console.error('Delete failed', err);
    } finally {
      setIsDeleteConfirmOpen(false);
      navigate('/gallery', { replace: true });
    }
  };

  const handleSaveEdit = () => {
    if (editedVideo && currentVideoId && typeof updateVideo === 'function') {
      updateVideo(currentVideoId, editedVideo);
      setVideo(editedVideo);
    }
    setIsEditing(false);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: video?.title || 'Rekolekt',
          url: window.location.href,
        });
      } catch {}
    } else {
      await navigator.clipboard.writeText(window.location.href);
      alert(t('videoDetail:linkCopied', 'Link copied!'));
    }
  };

  const findFolderById = (targetId: string, list: any[]): any | null => {
    for (const f of list) {
      if (f.id === targetId) return f;
      if (f.subFolders?.length) {
        const found = findFolderById(targetId, f.subFolders);
        if (found) return found;
      }
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
    const source = isEditing && editedVideo ? editedVideo : video;
    return buildViewModel(source, showOriginal, galleryThumbnail);
  }, [video, editedVideo, isEditing, showOriginal, galleryThumbnail]);

  if (loading || !viewModel) return <Skeleton />;

  const toolsCategories = getToolsCategoriesForLanguage(viewModel.toolsList, showOriginal);

  const hasToolsList =
    Array.isArray(toolsCategories) &&
    toolsCategories.some((cat: any) => Array.isArray(cat?.items) && cat.items.length > 0);

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

  const normalizedLocations: any[] = extractLocationPlaces(viewModel.location).map(
    (place: any, idx: number) => ({
      ...place,
      _vid: place?._vid || currentVideoId,
      _idx: typeof place?._idx === 'number' ? place._idx : idx,
    }),
  );

  const hasLocations = normalizedLocations.length > 0;
  const isLocationContent = viewModel.contentType === 'location' || hasLocations;

  const showToolsListCard =
    !isLocationContent &&
    hasToolsList &&
    (viewModel.isStructuredTools || !!viewModel.structuredType || !hasBullets);

  const actionItems = (video
    ? [
        { icon: <IOSShareIcon />, label: t('videoDetail:share', 'Share'), onClick: handleShare },
        { icon: <Pencil />, label: t('videoDetail:editReel', 'Edit details'), onClick: () => setIsEditing(true) },
        {
          icon: <Heart />,
          label: video.isFavorite
            ? t('videoDetail:removeFromFavorites')
            : t('videoDetail:addToFavorites'),
          onClick: handleToggleFavorite,
          variant: video.isFavorite ? 'default' : 'primary',
        },
        {
          icon: <FolderInput />,
          label: t('videoDetail:moveToCollection', 'Move to Collection'),
          onClick: () => setIsMoveModalOpen(true),
        },
        { icon: <Archive />, label: t('videoDetail:archive', 'Archive'), onClick: handleArchive },
        {
          icon: <Trash2 />,
          label: t('videoDetail:deleteReel', 'Delete'),
          onClick: () => setIsDeleteConfirmOpen(true),
          variant: 'danger',
        },
        {
          icon: <AlertCircle />,
          label: t('videoDetail:reportIssue', 'Report issue'),
          onClick: () => setIsReportModalOpen(true),
        },
      ]
    : []) as unknown as ActionItem[];

  return (
    <div className="animate-fade-in relative z-0 px-0 pb-20 md:pb-6">
      <style>{HASHTAG_STYLE}</style>

      <div className="flex flex-col md:grid md:grid-cols-[1.5fr_1fr] md:gap-6 items-start">
        <div className="min-w-0 w-full flex flex-col">
          <div className="relative z-0 w-full aspect-9/8 bg-black rounded-2xl overflow-hidden shadow-sm mb-5 group mt-[calc(env(safe-area-inset-top,0px)+0.75rem)] md:mt-0">
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
                    <span className="text-[11px] font-bold text-white uppercase tracking-wide">
                      {folderName}
                    </span>
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
                  <ContentTypeBadge
                    type={viewModel.contentType as any}
                    toolsSubtype={toolsSubtype}
                  />
                )}

                {hasLocations && !isLocationContent && (
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
            <a
              href={viewModel.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 group/author"
            >
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
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleLanguage();
                  }}
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
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  handleEditField('summary', e.target.value)
                }
              />
            ) : (
              <div className="text-gray-700 text-sm md:text-base leading-relaxed mb-4 font-medium whitespace-pre-line">
                {viewModel.summary}
              </div>
            )}

            {showToolsListCard ? (
              <div className="mt-4 pt-4 border-t border-primary-100/50">
                <ToolsListCard
                  toolsList={viewModel.toolsList ?? undefined}
                  showOriginal={showOriginal}
                />
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
                        <span className="text-base leading-none mt-0.5 shrink-0">
                          {bullet.emoji}
                        </span>
                      )}
                      <span className="leading-relaxed">
                        {bullet.headline && (
                          <span className="font-bold text-gray-900">{bullet.headline} </span>
                        )}
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

          {isLocationContent && normalizedLocations.length > 0 && (
            <div className="relative z-0 mb-5">
              <LocationCard
                location={normalizedLocations}
                processId={currentVideoId}
              />
            </div>
          )}

          {viewModel.caption && (
            <Accordion icon={<AlignLeft size={16} />} label={t('videoDetail:caption', 'Caption')}>
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {viewModel.caption}
              </div>
            </Accordion>
          )}

          {viewModel.transcript && (
            <div className="md:hidden">
              <Accordion
                icon={<CustomMessageSquareMoreIcon size={16} />}
                label={t('videoDetail:transcript', 'Transcript')}
              >
                <div className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap font-medium italic border-l-2 border-gray-100 pl-4">
                  {viewModel.transcript}
                </div>
              </Accordion>
            </div>
          )}

          {isEditing && (
            <div className="md:hidden mt-4 flex gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 py-3 bg-gray-200 rounded-xl text-sm font-bold text-gray-700"
              >
                {t('common:cancel', 'Cancel')}
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 py-3 bg-primary-600 rounded-xl text-sm font-bold text-white shadow-lg"
              >
                {t('common:saveChanges', 'Save Changes')}
              </button>
            </div>
          )}

          {viewModel.originalUrl && (
            <OriginalLink
              url={viewModel.originalUrl}
              platform={viewModel.platform}
              t={t}
              className="md:hidden mt-4"
            />
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
            <Accordion
              icon={<CustomMessageSquareMoreIcon size={16} />}
              label={t('videoDetail:transcript', 'Transcript')}
            >
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

      <ActionSheet
        isOpen={isActionSheetOpen}
        onClose={() => setIsActionSheetOpen(false)}
        actions={actionItems}
      />

      <MoveCollectionModalExt
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        videoIds={currentVideoId ? [currentVideoId] : []}
        onMove={(folderId: string) => {
          if (!currentVideoId) return;
          moveVideos([currentVideoId], folderId);
          setIsMoveModalOpen(false);
        }}
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
        videoId={currentVideoId}
      />
    </div>
  );
};

export default VideoDetail;