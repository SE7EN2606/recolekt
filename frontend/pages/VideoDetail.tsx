import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { getAuthHeaders } from '../context/AuthContext';
import { ReportModal } from '../components/ReportModal';
import { VideoDetailDesktop } from '../components/VideoDetailDesktop';
import { VideoDetailMobile } from '../components/VideoDetailMobile';
import {
  getBullets,
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
  // If env is "/" we want same-origin, not scheme-relative "//api..."
  if (s === '/' || s === '') return '';
  return s.replace(/\/+$/, '');
})();

function apiUrl(path: string) {
  const p = String(path || '').replace(/^\/+/, '');
  return API_BASE ? `${API_BASE}/${p}` : `/${p}`;
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
    return {
      emoji: match[0].trim(),
      body: text.replace(emojiRegex, '').trim(),
    };
  }
  return { body: text.trim(), emoji: '' };
};

export const VideoDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { deleteVideos } = useData();

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

  const fetchJsonNoStore = useCallback(async (url: string) => {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
      headers: {
        ...getAuthHeaders(),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${text}`);
    }
    return res.json();
  }, []);

  const fetchReelById = useCallback(
    async (reelId: string) => {
      const encoded = encodeURIComponent(String(reelId));
      // DataContext uses /api/reel/:id for DELETE; we use same path for GET
      const url = apiUrl(`api/reel/${encoded}`);
      try {
        const data = await fetchJsonNoStore(url);
        // backend might return { reel: {...} } or just the reel object
        return data?.reel ?? data;
      } catch (err) {
        return null;
      }
    },
    [fetchJsonNoStore],
  );

  const findInSavedReelsList = useCallback(
    async (reelId: string) => {
      const data = await fetchJsonNoStore(apiUrl('api/saved_reels?page=1&per_page=200&view=list'));
      const reels = Array.isArray(data?.reels) ? data.reels : [];

      const target = String(reelId);

      const found = reels.find((r: any) => {
        const candidates = [
          r?.id,
          r?.process_id,
          r?.reel_id,
          r?.processId,
          r?.reelId,
        ]
          .filter(Boolean)
          .map((x: any) => String(x));

        return candidates.includes(target);
      });

      return found || null;
    },
    [fetchJsonNoStore],
  );

  // Single loader used by both initial load and background refresh,
  // with a flag to decide whether to show the spinner.
  const loadVideo = useCallback(
    async (options?: { useSpinner?: boolean }) => {
      const useSpinner = options?.useSpinner ?? false;
      if (!id) return;

      if (useSpinner) setLoading(true);

      try {
        // 1) Try direct endpoint first (most reliable)
        let found: any = await fetchReelById(id);

        // 2) Fallback to list+search
        if (!found) {
          found = await findInSavedReelsList(id);
        }

        if (!found) {
          if (useSpinner) {
            setVideo(null);
            setLoading(false);
          }
          return;
        }

        const foundId = found.id || found.reel_id || found.process_id || id;
        const shortcode = String(foundId).split('--')[0];

        // 1) Transcription from GCS (with backend fallback)
        let transcriptionText = '';
        try {
          const transcriptionPath =
            found.gcs_paths?.transcription ||
            `media/IG_reels/${shortcode}/${shortcode}_transcription.json`;
          const transcriptionUrl = `https://storage.googleapis.com/recolekt-storage/${transcriptionPath}`;
          const transcriptRes = await fetch(transcriptionUrl);
          if (transcriptRes.ok) {
            const transcriptData = await transcriptRes.json();
            transcriptionText = safeStr((transcriptData as any).transcript);
          }
        } catch (err) {
          console.log(
            '⚠️ Could not fetch transcription.json, will use API field if present',
          );
        }

        if (!transcriptionText) {
          if (found.transcription) {
            if (typeof found.transcription === 'string') {
              transcriptionText = found.transcription;
            } else if (
              typeof found.transcription === 'object' &&
              (found.transcription as any).transcript
            ) {
              transcriptionText = safeStr((found.transcription as any).transcript);
            }
          }
        }

        // 2) *_result.json from GCS for caption + recipe + summary
        let resultCaption = '';
        let resultRecipe: any = null;
        let resultSummary: any = null;
        let resultSummaryText: any = null;

        try {
          const resultPath =
            found.gcs_paths?.result_json ||
            `media/IG_reels/${shortcode}/${shortcode}_result.json`;
          const resultUrl = `https://storage.googleapis.com/recolekt-storage/${resultPath}`;
          const resultRes = await fetch(resultUrl);
          if (resultRes.ok) {
            const resultData = await resultRes.json();
            resultCaption = safeStr((resultData as any).caption);
            resultRecipe = (resultData as any).recipe ?? null;
            resultSummary = (resultData as any).summary ?? null;
            resultSummaryText = (resultData as any).summary_text ?? null;
          } else {
            console.log('⚠️ result.json not found, status', resultRes.status);
          }
        } catch (err) {
          console.log('⚠️ Error fetching result.json from GCS', err);
        }

        // 3) Build merged object (single pass)
        const merged: any = {
          ...found,
          __raw: found,
        };

        // Caption priority
        if (resultCaption) merged.caption = resultCaption;
        else if (found.caption) merged.caption = safeStr(found.caption);

        // Recipe priority
        if (resultRecipe) merged.recipe = resultRecipe;
        else if (found.recipe) merged.recipe = found.recipe;

        // Summary from result.json if present
        if (resultSummary) merged.summary = resultSummary;
        if (resultSummaryText) merged.summary_text = resultSummaryText;

        // Transcript
        if (transcriptionText) merged.transcription = transcriptionText;

        // Favorite flag from backend
        setIsFavorite(Boolean(merged.is_favorite ?? merged.isFavorite));

        setVideo(merged);
      } catch (err) {
        console.error('Error fetching video:', err);
      } finally {
        if (useSpinner) setLoading(false);
      }
    },
    [id, fetchReelById, findInSavedReelsList],
  );

  // Initial load for a given id: show spinner, then render once with final data.
  useEffect(() => {
    if (!id) return;
    setVideo(null);
    loadVideo({ useSpinner: true });
  }, [id, loadVideo]);

  // Background refresh while status is not "done": no spinner, no flicker.
  useEffect(() => {
    if (!id) return;
    if (!video || !video.status || video.status === 'done') return;

    const interval = setInterval(() => {
      loadVideo({ useSpinner: false });
    }, 2000);

    return () => clearInterval(interval);
  }, [id, video?.status, loadVideo]);

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
      alert('Link copied to clipboard!');
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  const handleToggleFavorite = async () => {
    if (!video) return;

    const raw = (video as any).__raw || {};
    const updateId =
      (video as any).id || (video as any).process_id || raw.id || raw.process_id;

    if (!updateId) {
      console.warn('Cannot toggle favorite: missing video identifier');
      return;
    }

    const next = !isFavorite;
    setIsFavorite(next);

    try {
      const encodedId = encodeURIComponent(String(updateId));
      const url = apiUrl(`api/update/${encodedId}`);

      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({ is_favorite: next }),
      });

      if (!res.ok) {
        throw new Error(`Failed to update favorite: ${res.status}`);
      }

      // Keep local video object in sync
      setVideo((prev: any) =>
        prev
          ? {
              ...prev,
              is_favorite: next,
              isFavorite: next,
            }
          : prev,
      );
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
      pickFirstString(
        v?.author_name,
        raw?.author_name,
        v?.author,
        raw?.author,
      ) || 'Unknown';

    const category = getCategory(v) || getCategory(raw);
    const topic = getTopic(v) || getTopic(raw);

    const captionLike = safeStr(v?.caption) || safeStr(raw?.caption) || '';

    const englishBlock =
      (summaryObj as any)?.english ||
      (summaryObj as any)?.EN ||
      (summaryObj as any)?.en ||
      {};
    const originalBlock =
      (summaryObj as any)?.original ||
      (summaryObj as any)?.OG ||
      (summaryObj as any)?.og ||
      {};

    const titleFromEnglish = safeStr((englishBlock as any)?.title);
    const titleFromOriginal = safeStr((originalBlock as any)?.title);

    const stableTitle =
      v?.display_title ||
      raw?.display_title ||
      titleFromEnglish ||
      titleFromOriginal ||
      getTitle(v) ||
      getTitle(raw) ||
      'Saved Reel';

    const description =
      safeStr((englishBlock as any)?.summary) ||
      safeStr((originalBlock as any)?.summary) ||
      '';

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
      } catch (e) {
        console.error('❌ Failed to parse recipe JSON:', e);
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

  if (loading) {
    return (
      <div className="p-10 text-center">
        <div className="inline-block w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!video) {
    return <div className="p-10 text-center">Video not found</div>;
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
            <h2 className="text-lg font-bold text-gray-900 mb-3">Delete this reel?</h2>
            <p className="text-sm text-gray-600 mb-6">This action cannot be undone.</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-5 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-5 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Delete
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
