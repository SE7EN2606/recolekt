import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { getAuthHeaders } from '../context/AuthContext';
import { ReportModal } from '../components/ReportModal';
import { VideoDetailDesktop } from '../components/VideoDetailDesktop';
import { VideoDetailMobile } from '../components/VideoDetailMobile';
import { useTranslation } from 'react-i18next'; // 🔥 IMPORT
import {
  getTitle,
  getTopic,
  getCategory,
  getHashtags,
  pickFirstString,
} from '../utils/videoUtils';
import {
  parseQuantity,
  convertToMetric,
  convertToImperial,
  scaleQuantity,
} from '../utils/conversionUtils';

const RAW_API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:5001';

const API_BASE = (() => {
  const s = String(RAW_API_BASE ?? '').trim();
  if (s === '/' || s === '') return '';
  return s.replace(/\/+$/, '');
})();

function apiUrl(path: string) {
  const p = String(path || '').replace(/^\/+/, '');
  return API_BASE ? `${API_BASE}/${p}` : `/${p}`;
}

async function fetchGcsJson<T = any>(url: string): Promise<T> {
  const finalUrl = import.meta.env.DEV
    ? url.replace('https://storage.googleapis.com', '/gcs-proxy')
    : url;

  const res = await fetch(finalUrl, {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'follow',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GCS HTTP ${res.status} ${text}`);
  }

  return res.json() as Promise<T>;
}

const safeStr = (v: any): string => {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return String(v);
};

const stripLeadingEmoji = (s: string) => {
  const text = (s || '').trim();
  return text
    .replace(/^[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D]+\s*/u, '')
    .trim();
};

const splitTrailingEmoji = (text: string): { body: string; emoji: string } => {
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D]+$/u;
  const match = text.match(emojiRegex);
  if (match) {
    return { emoji: match[0].trim(), body: text.replace(emojiRegex, '').trim() };
  }
  return { body: text.trim(), emoji: '' };
};

function mapCachedVideoToRaw(v: any): any {
  if (!v) return null;
  const raw = v.raw ?? {};
  return {
    id: v.id,
    source_url: v.originalUrl ?? raw.source_url,
    caption: v.raw?.caption ?? raw.caption ?? '',
    author_name: v.author ?? raw.author_name,
    is_favorite: v.isFavorite ?? raw.is_favorite ?? false,
    status: v.status ?? raw.status,
    content_type: v.contenttype ?? raw.content_type,
    created_at: v.savedAt ?? raw.created_at,
    duration: v.duration ?? raw.duration,
    gcs_urls: raw.gcs_urls ?? { preview_thumbnail: v.thumbnailUrl },
    summary: v.summary ?? raw.summary ?? {},
    transcription: v.transcription ?? raw.transcription ?? '',
    recipe: v.recipe ?? raw.recipe ?? null,
    workout: v.workout ?? raw.workout ?? null,
    __raw: raw,
    __fromCache: true,
  };
}

export const VideoDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { videos, deleteVideos } = useData();
  const { t } = useTranslation(['videoDetail']); // 🔥 HOOK

  const [video, setVideo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [servingScale, setServingScale] = useState(1);
  const [useMetric, setUseMetric] = useState(true);

  const [isEditMode, setIsEditMode] = useState(false);
  const [tempTitle, setTempTitle] = useState('');
  const [tempCategory, setTempCategory] = useState('');
  const [tempTopic, setTempTopic] = useState('');
  const [tempDescription, setTempDescription] = useState('');
  const [tempBullets, setTempBullets] = useState<
    Array<{ headline: string; text: string; emoji?: string }>
  >([]);
  const [tempHashtags, setTempHashtags] = useState<string[]>([]);

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);

  const fetchBackendJsonNoStore = useCallback(async (url: string) => {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${text}`);
    }
    return res.json();
  }, []);

  const normalizeId = (v: any) => (v == null ? '' : String(v));
  const getShortcode = (fullId: string) => normalizeId(fullId).split('--')[0];

  // ─── STEP 1: Seed instantly from DataContext cache ─────────────────────────
  useEffect(() => {
    if (!id || videos.length === 0) return;

    const targetShort = getShortcode(id);

    const cached = videos.find((v: any) => {
      const vid = normalizeId(v.id);
      if (vid === id) return true;
      const short = getShortcode(vid);
      return targetShort && short === targetShort;
    });

    if (cached && !video) {
      const raw = mapCachedVideoToRaw(cached);
      setIsFavorite(Boolean(raw.is_favorite));
      setVideo(raw);
      setLoading(false);
    }
  }, [id, videos]);

  // ─── STEP 2: Enrich with fresh DB + GCS data in the background ─────────────
  const enrichVideo = useCallback(
    async (options?: { useSpinner?: boolean }) => {
      const useSpinner = options?.useSpinner ?? false;
      if (!id) return;

      try {
        let found: any = null;
        try {
          found = await fetchBackendJsonNoStore(
            apiUrl(`api/reel/${encodeURIComponent(id)}`)
          );
        } catch {
          return;
        }

        if (!found?.id) return;

        const foundId = found.id || id;
        const shortcode = getShortcode(foundId);
        const cacheBust = `v=${encodeURIComponent(String(Date.now()))}`;

        const transcriptionPath =
          found.gcs_paths?.transcription ||
          `media/IG_reels/${shortcode}/${shortcode}_transcription.json`;
        const resultPath =
          found.gcs_paths?.result_json ||
          `media/IG_reels/${shortcode}/${shortcode}_result.json`;

        const transcriptionUrl = `https://storage.googleapis.com/recolekt-storage/${transcriptionPath}?${cacheBust}`;
        const resultUrl = `https://storage.googleapis.com/recolekt-storage/${resultPath}?${cacheBust}`;

        const [transcriptData, resultData] = await Promise.allSettled([
          fetchGcsJson<any>(transcriptionUrl),
          fetchGcsJson<any>(resultUrl),
        ]);

        let transcriptionText = '';
        if (transcriptData.status === 'fulfilled') {
          transcriptionText = safeStr(transcriptData.value?.transcript);
        }
        if (!transcriptionText && found.transcription) {
          if (typeof found.transcription === 'string') {
            transcriptionText = found.transcription;
          } else if (typeof found.transcription === 'object' && (found.transcription as any).transcript) {
            transcriptionText = safeStr((found.transcription as any).transcript);
          }
        }

        let resultCaption = '';
        let resultRecipe: any = null;
        let resultSummary: any = null;
        let resultSummaryText: any = null;
        if (resultData.status === 'fulfilled') {
          resultCaption = safeStr(resultData.value?.caption);
          resultRecipe = resultData.value?.recipe ?? null;
          resultSummary = resultData.value?.summary ?? null;
          resultSummaryText = resultData.value?.summary_text ?? null;
        }

        const merged: any = { ...found, __raw: found };

        if (resultCaption) merged.caption = resultCaption;
        else if (found.caption) merged.caption = safeStr(found.caption);

        if (resultRecipe) merged.recipe = resultRecipe;
        else if (found.recipe) merged.recipe = found.recipe;

        if (resultSummary) merged.summary = resultSummary;
        if (resultSummaryText) merged.summary_text = resultSummaryText;
        if (transcriptionText) merged.transcription = transcriptionText;

        setIsFavorite(Boolean(merged.is_favorite ?? merged.isFavorite));
        setVideo(merged);
      } catch (err) {
        console.error('Error enriching video:', err);
      } finally {
        if (useSpinner) setLoading(false);
      }
    },
    [id, fetchBackendJsonNoStore]
  );

  // On mount: if no cache hit, show spinner; otherwise enrich silently
  useEffect(() => {
    if (!id) return;
    const hasCacheHit = videos.some((v: any) => {
      const vid = normalizeId(v.id);
      if (vid === id) return true;
      return getShortcode(vid) === getShortcode(id);
    });

    if (hasCacheHit) {
      enrichVideo({ useSpinner: false });
    } else {
      setLoading(true);
      enrichVideo({ useSpinner: true });
    }
  }, [id]);

  // Poll every 2s if still processing
  useEffect(() => {
    if (!id) return;
    if (!video || !video.status || video.status === 'done') return;

    const interval = setInterval(() => enrichVideo({ useSpinner: false }), 2000);
    return () => clearInterval(interval);
  }, [id, video?.status, enrichVideo]);

  const handleDelete = async () => {
    if (!video) {
      alert('Cannot delete: video not loaded');
      setConfirmDelete(false);
      return;
    }

    const raw = (video as any).__raw || {};
    const deleteId =
      (video as any).process_id || (video as any).id || raw.process_id || raw.id;

    if (!deleteId) {
      alert('Cannot delete: missing video identifier');
      setConfirmDelete(false);
      return;
    }

    setConfirmDelete(false);
    navigate('/gallery/all', { replace: true });

    try {
      await deleteVideos([deleteId]);
    } catch (err) {
      console.error('Error deleting reel. Please try again.', err);
    }
  };

  const handleShare = async () => {
    const title = getTitle(video || {});
    const shareData = {
      title,
      text: `Check out this reel: ${title}`,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      alert(t('videoDetail:linkCopied')); // 🔥 TRANSLATED
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  const handleToggleFavorite = async () => {
    if (!video) return;

    const raw = (video as any).__raw || {};
    const updateId =
      (video as any).id || (video as any).process_id || raw.id || raw.process_id;

    if (!updateId) return;

    const next = !isFavorite;
    setIsFavorite(next);

    try {
      const encodedId = encodeURIComponent(String(updateId));
      const url = apiUrl(`api/update/${encodedId}`);

      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ is_favorite: next }),
      });

      if (!res.ok) throw new Error(`Failed to update favorite: ${res.status}`);

      setVideo((prev: any) => (prev ? { ...prev, is_favorite: next, isFavorite: next } : prev));
    } catch (err) {
      console.error('❌ Failed to update favorite status', err);
      setIsFavorite((prev) => !prev);
    }
  };

  const viewModel = useMemo(() => {
    const v = video || {};
    const raw = v.__raw || {};

    let summaryObj = v?.summary ?? raw?.summary ?? {};
    const summaryTextObj =
      v?.summary_text ?? v?.summary ?? raw?.summary_text ?? raw?.summary ?? null;

    if (
      summaryObj &&
      typeof summaryObj === 'object' &&
      (summaryObj as any).summary &&
      !(summaryObj as any).english &&
      !(summaryObj as any).original
    ) {
      summaryObj = (summaryObj as any).summary;
    }

    const author =
      pickFirstString(v?.author_name, raw?.author_name, v?.author, raw?.author) || 'Unknown';

    const category = getCategory(v) || getCategory(raw);
    const topic = getTopic(v) || getTopic(raw);

    const captionLike = safeStr(v?.caption) || safeStr(raw?.caption) || '';

    const englishBlock =
      (summaryObj as any)?.english || (summaryObj as any)?.EN || (summaryObj as any)?.en || {};
    const originalBlock =
      (summaryObj as any)?.original || (summaryObj as any)?.OG || (summaryObj as any)?.og || {};

    // ── Globe visibility: only show if english and original are meaningfully different ──
    const englishTitle = safeStr((englishBlock as any)?.title).trim();
    const originalTitle = safeStr((originalBlock as any)?.title).trim();
    const englishSummary = safeStr((englishBlock as any)?.summary).trim();
    const originalSummary = safeStr((originalBlock as any)?.summary).trim();
    const hasTwoLanguages =
      !!(englishTitle && originalTitle) &&
      (englishTitle !== originalTitle || englishSummary !== originalSummary);

    const stableTitle =
      v?.display_title ||
      raw?.display_title ||
      safeStr((englishBlock as any)?.title) ||
      safeStr((originalBlock as any)?.title) ||
      getTitle(v) ||
      getTitle(raw) ||
      'Saved Reel';

    const description =
      safeStr((englishBlock as any)?.summary) || safeStr((originalBlock as any)?.summary) || '';

    const bulletsRaw =
      (englishBlock as any)?.headlines ||
      (englishBlock as any)?.bullets ||
      (originalBlock as any)?.headlines ||
      (originalBlock as any)?.bullets ||
      [];

    const bullets = (Array.isArray(bulletsRaw) ? bulletsRaw : []).map((b: any) => {
      if (typeof b === 'string') return stripLeadingEmoji(b);
      if (b && typeof b === 'object') {
        const headline = stripLeadingEmoji(String(b.headline ?? b.text ?? ''));
        const text = stripLeadingEmoji(String(b.text ?? b.description ?? ''));
        const emoji = String(b.emoji || '');
        return { headline, text, emoji };
      }
      return b;
    });

    const hashtags =
      (englishBlock as any)?.hashtags ||
      (originalBlock as any)?.hashtags ||
      getHashtags(v) ||
      getHashtags(raw) ||
      [];

    const createdAt = v?.created_at ?? raw?.created_at;
    const savedAt = createdAt
      ? new Date(createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '';

    let recipeData = v?.recipe ?? raw?.recipe ?? null;
    if (recipeData && typeof recipeData === 'string') {
      try {
        recipeData = JSON.parse(recipeData);
      } catch {
        recipeData = null;
      }
    }

    const isRecipe =
      !!recipeData &&
      typeof recipeData === 'object' &&
      ((recipeData as any).english || (recipeData as any).original);

    const transcription = v?.transcription || '';

    const duration = v?.duration ?? raw?.duration ?? '';
    const sourceUrl = v?.source_url ?? raw?.source_url ?? '';
    const preview =
      v?.gcs_urls?.preview_thumbnail ??
      raw?.gcs_urls?.preview_thumbnail ??
      v?.gcs_urls?.thumbnail ??
      '';

    return {
      title: stableTitle,
      author,
      category,
      topic,
      description,
      bullets,
      hashtags,
      savedAt,
      isRecipe,
      recipe: recipeData,
      caption: captionLike,
      transcription,
      duration,
      sourceUrl,
      preview,
      summary: summaryObj,
      summary_text: summaryTextObj,
      // ── NEW: controls globe button visibility ──
      hasTwoLanguages,
    };
  }, [video]);

  const handleModifyToggle = () => {
    if (!isEditMode) {
      setTempTitle(viewModel.title);
      setTempCategory(viewModel.category);
      setTempTopic(viewModel.topic);
      setTempDescription(viewModel.description);
      setTempBullets([...viewModel.bullets]);
      setTempHashtags([...viewModel.hashtags]);
      setIsEditMode(true);
    } else {
      setIsEditMode(false);
    }
  };

  const renderIngredient = (ing: any, index: number) => {
    let qtyRaw = '';
    let item = '';
    let emoji = '';

    if (typeof ing === 'string') {
      const parts = splitTrailingEmoji(ing);
      item = parts.body;
      emoji = parts.emoji;
    } else {
      item = String(ing?.item ?? ing?.name ?? '');
      qtyRaw = String(ing?.quantity ?? '');
      emoji = String(ing?.emoji ?? '');
      const parts = splitTrailingEmoji(item);
      item = parts.body;
      if (!emoji) emoji = parts.emoji;
    }

    const { val, unit } = parseQuantity(qtyRaw);

    return (
      <li key={index} className="flex flex-wrap items-baseline gap-2 py-1">
        {emoji ? <span className="text-lg leading-none select-none">{emoji}</span> : null}
        {(val || unit) && (
          <div className="flex items-baseline gap-1">
            {val && <span className="font-bold text-purple-600 text-base">{val}</span>}
            {unit && <span className="font-bold text-gray-900 text-base">{unit}</span>}
          </div>
        )}
        <span className="font-normal text-gray-900 text-base flex-1">{item}</span>
      </li>
    );
  };

  if (loading && !video) {
    return (
      <div className="p-10 text-center">
        <div className="inline-block w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-gray-500">{t('videoDetail:loading')}</p> {/* 🔥 TRANSLATED */}
      </div>
    );
  }

  if (!video) {
    return <div className="p-10 text-center">{t('videoDetail:videoNotFound')}</div>; // 🔥 TRANSLATED
  }

  const sharedProps = {
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
    isFavorite,
    onToggleFavorite: handleToggleFavorite,
    onNavigateBack: () => navigate(-1),
    onShare: handleShare,
    onModifyToggle: handleModifyToggle,
    onCancelEdit: () => setIsEditMode(false),
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
    onReportClick: () => setIsReportModalOpen(true),
    onDeleteClick: () => setConfirmDelete(true),
    renderIngredient,
    parseQuantity,
    scaleQuantity,
    convertToMetric,
    convertToImperial,
  };

  return (
    <div className="animate-fade-in pb-2 md:pb-12">
      <VideoDetailDesktop {...sharedProps} />
      <VideoDetailMobile {...sharedProps} />

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-[90%] max-w-sm p-6 text-center">
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('videoDetail:deleteTitle')}</h2> {/* 🔥 TRANSLATED */}
            <p className="text-sm text-gray-600 mb-6">{t('videoDetail:deleteWarning')}</p> {/* 🔥 TRANSLATED */}
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-5 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                {t('videoDetail:cancel')} {/* 🔥 TRANSLATED */}
              </button>
              <button
                onClick={handleDelete}
                className="px-5 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                {t('videoDetail:delete')} {/* 🔥 TRANSLATED */}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        initialUrl={window.location.href}
      />
    </div>
  );
};