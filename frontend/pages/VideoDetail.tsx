import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
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

const safeStr = (v: any): string => {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return String(v);
};

const stripLeadingEmoji = (s: string) => {
  const text = (s || '').trim();
  return text
    .replace(
      /^[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D]+\s*/u,
      '',
    )
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
  const { deleteVideos, videos } = useData();

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

  // Enrich the video from DataContext with GCS transcription + result.json
  const fetchVideo = useCallback(async () => {
    if (!id) return;

    // Wait until DataContext has loaded at least once
    if (videos.length === 0) {
      return;
    }

    setLoading(true);

    // 1) Find the video in context
    const base = videos.find(
      (v: any) => v.id === id || v.process_id === id,
    );

    if (!base) {
      // Context is loaded but this id doesn't exist
      setVideo(null);
      setLoading(false);
      return;
    }

    const raw = base.__raw || base;
    const shortcode = String(raw.id || base.id || '').split('--')[0];

    // 2) Fetch transcription.json from GCS
    let transcriptionText = '';
    try {
      const transcriptionPath =
        raw.gcs_paths?.transcription ||
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

    if (!transcriptionText && raw.transcription) {
      if (typeof raw.transcription === 'string') {
        transcriptionText = raw.transcription;
      } else if (
        typeof raw.transcription === 'object' &&
        (raw.transcription as any).transcript
      ) {
        transcriptionText = safeStr(
          (raw.transcription as any).transcript,
        );
      }
    }

    // 3) Fetch *_result.json from GCS to get full caption + recipe/summary
    let resultCaption = '';
    let resultRecipe: any = null;
    let resultSummary: any = null;
    let resultSummaryText: any = null;

    try {
      const resultPath =
        raw.gcs_paths?.result_json ||
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

    // 4) Build merged object, starting from the DataContext video
    const merged: any = {
      ...base,
      __raw: raw,
    };

    // Caption priority: result.json > DB/api field > context field
    if (resultCaption) {
      merged.caption = resultCaption;
    } else if (raw.caption) {
      merged.caption = safeStr(raw.caption);
    }

    // Recipe priority: result.json.recipe > DB/api field > context field
    if (resultRecipe) {
      merged.recipe = resultRecipe;
    } else if (raw.recipe) {
      merged.recipe = raw.recipe;
    }

    // Summary fields from result.json if present
    if (resultSummary) {
      merged.summary = resultSummary;
    }
    if (resultSummaryText) {
      merged.summary_text = resultSummaryText;
    }

    // Transcription
    if (transcriptionText) {
      merged.transcription = transcriptionText;
    }

    console.log('🎯 Final merged video object:', merged);
    setVideo(merged);
    setLoading(false);
  }, [id, videos]);

  useEffect(() => {
    fetchVideo();
  }, [fetchVideo]);

  const handleDelete = async () => {
    if (!video || !video.process_id) {
      alert('Cannot delete: video data not found');
      setConfirmDelete(false);
      return;
    }

    try {
      await deleteVideos([video.process_id]);
      setConfirmDelete(false);
      navigate('/gallery/all', { replace: true });
    } catch (err) {
      alert('Error deleting reel. Please try again.');
      setConfirmDelete(false);
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

  const viewModel = useMemo(() => {
    const v = video || {};
    const raw = v.__raw || {};

    // Prefer summary/summary_text from merged (may come from result.json)
    let summaryObj = v?.summary ?? raw?.summary ?? {};
    const summaryTextObj =
      v?.summary_text ??
      v?.summary ??
      raw?.summary_text ??
      raw?.summary ??
      null;

    if (
      summaryObj &&
      typeof summaryObj === 'object' &&
      summaryObj.summary &&
      !summaryObj.english &&
      !summaryObj.original
    ) {
      summaryObj = summaryObj.summary;
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

    // Use merged caption (possibly from result.json)
    const captionLike =
      safeStr(v?.caption) || safeStr(raw?.caption) || '';

    const englishBlock =
      summaryObj?.english || summaryObj?.EN || summaryObj?.en || {};
    const originalBlock =
      summaryObj?.original || summaryObj?.OG || summaryObj?.og || {};

    const titleFromEnglish = safeStr(englishBlock?.title);
    const titleFromOriginal = safeStr(originalBlock?.title);

    const stableTitle =
      v?.display_title ||
      raw?.display_title ||
      titleFromEnglish ||
      titleFromOriginal ||
      getTitle(v) ||
      getTitle(raw) ||
      'Saved Reel';

    const description =
      safeStr(englishBlock?.summary) ||
      safeStr(originalBlock?.summary) ||
      '';

    const bulletsRaw =
      englishBlock?.headlines ||
      englishBlock?.bullets ||
      originalBlock?.headlines ||
      originalBlock?.bullets ||
      [];

    const bullets = (Array.isArray(bulletsRaw) ? bulletsRaw : []).map(
      (b: any) => {
        if (typeof b === 'string') return stripLeadingEmoji(b);
        if (b && typeof b === 'object') {
          const headline = stripLeadingEmoji(
            String(b.headline ?? b.text ?? ''),
          );
          const text = stripLeadingEmoji(
            String(b.text ?? b.description ?? ''),
          );
          const emoji = String(b.emoji || '');
          return { headline, text, emoji };
        }
        return b;
      },
    );

    const hashtags =
      englishBlock?.hashtags ||
      originalBlock?.hashtags ||
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
      (recipeData.english || recipeData.original);

    const transcription = v?.transcription || '';

    const duration = v?.duration ?? raw?.duration ?? '';
    const sourceUrl = v?.source_url ?? raw?.source_url ?? '';
    const preview =
      v?.gcs_urls?.preview_thumbnail ??
      raw?.gcs_urls?.preview_thumbnail ??
      v?.gcs_urls?.thumbnail ??
      '';

    console.log('🎯 viewModel.recipe:', recipeData);

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
      <li
        key={index}
        className="flex flex-wrap items-baseline gap-2 py-1"
      >
        {emoji ? (
          <span className="text-lg leading-none select-none">
            {emoji}
          </span>
        ) : null}

        {(val || unit) && (
          <div className="flex items-baseline gap-1">
            {val && (
              <span className="font-bold text-purple-600 text-base">
                {val}
              </span>
            )}
            {unit && (
              <span className="font-bold text-gray-900 text-base">
                {unit}
              </span>
            )}
          </div>
        )}

        <span className="font-normal text-gray-900 text-base flex-1">
          {item}
        </span>
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
            <h2 className="text-lg font-bold text-gray-900 mb-3">
              Delete this reel?
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              This action cannot be undone.
            </p>
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
