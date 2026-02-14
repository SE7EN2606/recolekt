import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { getAuthHeaders } from '../context/AuthContext';
import { ReportModal } from '../components/ReportModal';
import { VideoDetailDesktop } from '../components/VideoDetailDesktop';
import { VideoDetailMobile } from '../components/VideoDetailMobile';
import { normalizeReel } from '../services/normalizeReel';
import {
  getBullets,
  getTitle,
  getTopic,
  getCategory,
  getHashtags,
  pickFirstString
} from '../utils/videoUtils';
import {
  parseQuantity,
  convertToMetric,
  convertToImperial,
  scaleQuantity
} from '../utils/conversionUtils';

const API_BASE = import.meta.env.VITE_API_BASE;

const stripLeadingEmoji = (s: string) => {
  const text = (s || '').trim();
  return text.replace(/^[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D]+\s*/u, '').trim();
};

const safeStr = (v: any): string => {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return String(v);
};

const extractTranscriptText = (maybe: any): string => {
  if (!maybe) return '';
  if (typeof maybe === 'string') return maybe;

  if (typeof maybe === 'object') {
    if (typeof maybe.transcript === 'string') return maybe.transcript;
    if (typeof maybe.text === 'string') return maybe.text;
    if (typeof maybe.content === 'string') return maybe.content;
  }

  return '';
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

// ✅ Helper to extract Instagram shortcode from URL
const extractShortcodeFromUrl = (url: string): string | null => {
  if (!url) return null;
  const match = url.match(/instagram\.com\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
};

export const VideoDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { deleteVideos, videos, refreshVideos } = useData();

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
  const [tempBullets, setTempBullets] = useState<Array<{ headline: string; text: string; emoji?: string }>>([]);
  const [tempHashtags, setTempHashtags] = useState<string[]>([]);

  const [fetchedTranscript, setFetchedTranscript] = useState<string>('');
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const notFoundPollRef = useRef(0);
  const transcriptFetchedRef = useRef<Set<string>>(new Set());

  const fetchJsonNoStore = useCallback(async (url: string) => {
    const u = url.includes('?') ? `${url}&_=${Date.now()}` : `${url}?_=${Date.now()}`;
    const res = await fetch(u, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
      headers: {
        ...getAuthHeaders(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, []);

  const fetchVideo = useCallback(async () => {
    if (!id) return;

    const foundInContext = videos.find(v => v.id === id || v.process_id === id);
    if (foundInContext) {
      setVideo(foundInContext);
      setLoading(false);
    }

    try {
      const data = await fetchJsonNoStore(`${API_BASE}/api/saved_reels`);
      const reels = Array.isArray(data?.reels) ? data.reels : [];
      const found = reels.find((r: any) => r?.id === id || r?.process_id === id);

      if (!found) {
        notFoundPollRef.current += 1;
        setLoading(true);
        if (notFoundPollRef.current > 20) {
          setLoading(false);
          setVideo(null);
        }
        return;
      }

      notFoundPollRef.current = 0;

      let normalized: any = found;
      try {
        normalized = normalizeReel(found);
      } catch {
        normalized = found;
      }

      const merged = { ...normalized, __raw: found };
      setVideo(merged);
      setLoading(false);

      const apiTranscript =
        extractTranscriptText(found?.transcription) ||
        extractTranscriptText(normalized?.transcription) ||
        '';

      if (apiTranscript.trim() && !fetchedTranscript.trim()) {
        setFetchedTranscript(apiTranscript);
      }

      // ✅ Extract shortcode from source_url or use reel_id
      const shortcode = 
        found?.shortcode || 
        found?.reel_id || 
        extractShortcodeFromUrl(found?.source_url) || 
        id.split('--')[0];

      console.log('🔍 Using shortcode:', shortcode);
      console.log('🔍 found.shortcode:', found?.shortcode);
      console.log('🔍 found.reel_id:', found?.reel_id);
      console.log('🔍 found.source_url:', found?.source_url);

      const transcriptJsonUrl = `https://storage.googleapis.com/recolekt-storage/media/IG_reels/${shortcode}/${shortcode}_transcription.json`;

      console.log('🔍 Transcript JSON URL:', transcriptJsonUrl);

      if (transcriptJsonUrl && !transcriptFetchedRef.current.has(String(id))) {
        transcriptFetchedRef.current.add(String(id));
        try {
          const jsonRes = await fetch(transcriptJsonUrl, {
            credentials: 'include',
            headers: getAuthHeaders(),
          });
          if (jsonRes.ok) {
            const jsonData = await jsonRes.json();
            console.log('🔍 Fetched transcript JSON:', jsonData);
            
            // Extract transcript text from JSON
            const transcriptText = 
              jsonData?.transcript || 
              jsonData?.text || 
              jsonData?.content || 
              (typeof jsonData === 'string' ? jsonData : '');
            
            if (transcriptText.trim()) {
              setFetchedTranscript(transcriptText.trim());
              console.log('🔍 Set transcript text:', transcriptText.substring(0, 200));
            }
          } else {
            console.log('🔍 Transcript JSON fetch failed:', jsonRes.status);
          }
        } catch (err) {
          console.error('Failed to fetch transcript JSON from GCS:', err);
        }
      }
    } catch (err) {
      console.error('Error fetching video:', err);
      setLoading(false);
    }
  }, [id, fetchJsonNoStore, fetchedTranscript, videos]);

  useEffect(() => {
    fetchVideo();
  }, [fetchVideo]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!video) {
        fetchVideo();
        return;
      }
      if (video?.status && video.status !== 'done') {
        fetchVideo();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [video, fetchVideo]);

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

    // ✅ Get the bilingual summary object - handle both wrapped and direct formats
    let summaryObj = v?.summary ?? raw?.summary ?? {};
    
    // ✅ If summaryObj has a nested 'summary' property, unwrap it
    if (summaryObj && typeof summaryObj === 'object' && summaryObj.summary && !summaryObj.english && !summaryObj.original) {
      summaryObj = summaryObj.summary;
    }
    
    console.log('🔍 VideoDetail viewModel summaryObj (after unwrap):', summaryObj);

    const author = pickFirstString(v?.author_name, raw?.author_name, v?.author, raw?.author) || 'Unknown';
    const category = getCategory(v) || getCategory(raw);
    const topic = getTopic(v) || getTopic(raw);

    const captionLike = safeStr(v?.caption) || safeStr(raw?.caption) || '';

    // ✅ Extract english summary from the bilingual structure
    const englishBlock = summaryObj?.english || summaryObj?.EN || summaryObj?.en || {};
    const originalBlock = summaryObj?.original || summaryObj?.OG || summaryObj?.og || {};

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

    // ✅ Use english.summary
    const description = safeStr(englishBlock?.summary) || safeStr(originalBlock?.summary) || '';

    console.log('🔍 VideoDetail description extracted:', description);

    // ✅ Extract bullets from english block
    const bulletsRaw = englishBlock?.headlines || englishBlock?.bullets || originalBlock?.headlines || originalBlock?.bullets || [];

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

    const hashtags = englishBlock?.hashtags || originalBlock?.hashtags || getHashtags(v) || getHashtags(raw) || [];

    const createdAt = v?.created_at ?? raw?.created_at;
    const savedAt = createdAt
      ? new Date(createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '';

    // ✅ Check if recipe exists (don't rely on content_type)
    const recipeData = v?.recipe ?? raw?.recipe ?? null;
    const isRecipe = !!(recipeData && typeof recipeData === 'object' && (recipeData.english || recipeData.original));

    let recipe = recipeData;
    if (recipe && typeof recipe === 'string') {
      try {
        recipe = JSON.parse(recipe);
      } catch (e) {
        console.error('❌ Failed to parse recipe JSON:', e);
        recipe = null;
      }
    }

    console.log('🔍 VideoDetail isRecipe:', isRecipe, 'recipe:', recipe);

    // ✅ Enhanced transcript extraction
    const transcriptText =
      fetchedTranscript.trim() ||
      extractTranscriptText(v?.transcription) ||
      extractTranscriptText(raw?.transcription) ||
      safeStr(v?.transcript) ||
      safeStr(raw?.transcript) ||
      '';

    console.log('🔍 VideoDetail transcriptText:', transcriptText);
    console.log('🔍 VideoDetail fetchedTranscript:', fetchedTranscript);

    const transcription = transcriptText ? { transcript: transcriptText } : { transcript: '' };

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
      recipe,
      caption: captionLike,
      transcription,
      duration,
      sourceUrl,
      preview,
      summary: summaryObj,
    };
  }, [video, fetchedTranscript]);

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
        <div className="inline-block w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
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
