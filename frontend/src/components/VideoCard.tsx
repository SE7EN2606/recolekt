import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Globe, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { getAuthHeaders } from '../context/AuthContext';

interface VideoCardProps {
  video: any;
  selected?: boolean;
  onToggleSelect?: () => void;
  selectionMode?: boolean;
}

const RAW_API_BASE = (import.meta.env.VITE_API_BASE ?? import.meta.env.VITE_API_URL ?? '') as string;
const API_BASE = String(RAW_API_BASE).replace(/\/+$/, '');

function joinUrl(base: string, path: string) {
  const p = String(path || '').replace(/^\/+/, '');
  if (!base) return `/${p}`;
  const b = String(base || '').replace(/\/+$/, '');
  return `${b}/${p}`;
}

const safeStr = (v: any): string => {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return String(v);
};

/**
 * Resolve the best display title from a video object.
 * Priority:
 *  1. summary.english.title  (from result.json summary block)
 *  2. summary_title          (top-level denormalized field)
 *  3. summary.original.title
 *  4. video.title
 *  5. First line of caption  (last resort)
 */
function resolveTitle(video: any, preferOriginal = false): { english: string; original: string; hasTwoLanguages: boolean } {
  const DEFAULT = 'Untitled Video';

  const summary = video?.summary ?? video?.raw?.summary ?? {};

  // Unwrap nested summary.summary shape
  const summaryObj =
    summary?.english || summary?.original
      ? summary
      : summary?.summary ?? summary;

  const englishBlock = summaryObj?.english ?? summaryObj?.EN ?? summaryObj?.en ?? {};
  const originalBlock = summaryObj?.original ?? summaryObj?.OG ?? summaryObj?.og ?? {};

  const engTitle = safeStr(englishBlock?.title).trim();
  const origTitle = safeStr(originalBlock?.title).trim();

  // Also check top-level summary_title
  const topLevelTitle = safeStr(video?.summary_title ?? video?.summaryTitle).trim();

  // Also check recipe.english.title / recipe.original.title
  const recipe = video?.recipe;
  const recipeObj = recipe && typeof recipe === 'object' ? recipe : null;
  const recipeEngTitle = safeStr(recipeObj?.english?.title).trim();
  const recipeOrigTitle = safeStr(recipeObj?.original?.title).trim();

  // Resolve english
  const english =
    engTitle ||
    topLevelTitle ||
    recipeEngTitle ||
    safeStr(video?.title).trim() ||
    safeStr(video?.caption ?? '').split('\n')[0].trim() ||
    DEFAULT;

  // Resolve original
  const original =
    origTitle ||
    recipeOrigTitle ||
    safeStr(video?.title).trim() ||
    english; // fall back to english if no original

  // Only show globe / hasTwoLanguages when they are meaningfully different
  const hasTwoLanguages =
    !!(engTitle && origTitle) && engTitle !== origTitle;

  return { english, original, hasTwoLanguages };
}

const VideoCardComponent: React.FC<VideoCardProps> = ({ video, selected, onToggleSelect, selectionMode }) => {
  const navigate = useNavigate();

  const videoId = video?.id ?? video?.process_id ?? video?.processId ?? '';

  const [isFavorite, setIsFavorite] = useState<boolean>(Boolean(video?.isFavorite ?? video?.is_favorite ?? false));
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    setIsFavorite(Boolean(video?.isFavorite ?? video?.is_favorite ?? false));
  }, [video?.isFavorite, video?.is_favorite, videoId]);

  useEffect(() => {
    setShowOriginal(false);
  }, [videoId]);

  const isProcessing = video?.category === 'Processing' || video?.status === 'processing';
  const isFailed = video?.category === 'Failed' || video?.status === 'failed';
  const isDisabled = isProcessing || isFailed;

  // ── Title & language resolution ──────────────────────────────────────────
  const { english: englishTitle, original: originalTitle, hasTwoLanguages } = useMemo(
    () => resolveTitle(video),
    [video]
  );

  const displayTitle = showOriginal ? originalTitle : englishTitle;

  // Language badge code from transcription
  let languageCode = 'OG';
  const transcription = video?.transcription ?? video?.transcript ?? video?.raw?.transcription;
  if (transcription && typeof transcription === 'object' && transcription.detected_language) {
    languageCode = String(transcription.detected_language).toUpperCase();
  }

  // ── Display helpers ───────────────────────────────────────────────────────
  const thumbnailUrl =
    video?.thumbnailUrl ||
    video?.thumbnail_url ||
    video?.gcs_urls?.preview_thumbnail ||
    video?.gcsUrls?.previewThumbnail ||
    video?.preview_thumbnail ||
    video?.raw?.gcsurls?.previewthumbnail ||
    '';

  const author = String(video?.author ?? video?.author_name ?? video?.authorName ?? 'Unknown');
  const duration = video?.duration;

  const sourceUrl = String(
    video?.originalUrl ?? video?.source_url ?? video?.sourceUrl ?? video?.raw?.sourceurl ?? '',
  );

  const platform = useMemo(() => {
    const url = sourceUrl.toLowerCase();
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('facebook.com') || url.includes('fb.com')) return 'facebook';
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    return 'instagram';
  }, [sourceUrl]);

  const profileUrl =
    platform === 'instagram'
      ? `https://www.instagram.com/${author.replace('@', '')}/`
      : sourceUrl || '#';

  // ── Event handlers ────────────────────────────────────────────────────────
  const handleHeartClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled) return;

    const next = !isFavorite;
    setIsFavorite(next);

    if (!videoId) {
      console.warn('Cannot toggle favorite: missing video id');
      return;
    }

    try {
      const encodedId = encodeURIComponent(String(videoId));
      const url = joinUrl(API_BASE, `/api/update/${encodedId}`);

      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({ is_favorite: next }),
      });

      if (!res.ok) throw new Error(`Failed to update favorite: ${res.status}`);
    } catch (err) {
      console.error('❌ Failed to update favorite status', err);
      setIsFavorite((prev) => !prev);
    }
  };

  const handleLanguageToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled) return;
    setShowOriginal((prev) => !prev);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (isDisabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (selectionMode) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect?.();
    } else {
      navigate(`/video/${videoId}`);
    }
  };

  const errorText =
    video?.errorMessage ||
    video?.error_message ||
    video?.raw?.errormessage ||
    'Something went wrong. Please try again.';

  return (
    <div className="group relative flex flex-col gap-3 transition-transform duration-300">
      <div
        onClick={handleCardClick}
        className={`relative rounded-2xl overflow-hidden aspect-[9/16] bg-gray-100 shadow-sm transition-shadow duration-300 ${
          isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
        } ${selected ? 'ring-4 ring-primary-500 ring-offset-2' : 'hover:shadow-lg'}`}
        style={{ WebkitMaskImage: '-webkit-radial-gradient(white, black)' }}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={displayTitle}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-200">
            <span className="text-gray-400 text-sm">No preview</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />

        {/* Processing overlay (defensive — Gallery.tsx renders its own styled version) */}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-white animate-spin" />
              <span className="text-white text-sm font-medium">Processing...</span>
            </div>
          </div>
        )}

        {/* Failed overlay */}
        {isFailed && (
          <div className="absolute inset-0 bg-red-500/90 backdrop-blur-sm z-40 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-3 px-4 text-center">
              <AlertCircle className="w-10 h-10 text-white" />
              <div>
                <p className="text-white text-sm font-semibold mb-1">Processing Failed</p>
                <p className="text-white/90 text-xs">{errorText}</p>
              </div>
            </div>
          </div>
        )}

        {selectionMode && (
          <div className="absolute top-3 right-3 z-20 pointer-events-none">
            {selected ? (
              <div className="bg-primary-600 text-white rounded-full p-1 shadow-md">
                <CheckCircle2 size={20} />
              </div>
            ) : (
              <div className="w-7 h-7 rounded-full border-2 border-white/60 bg-black/20 backdrop-blur-sm" />
            )}
          </div>
        )}

        {/* Globe — only shown when two real distinct languages exist */}
        {hasTwoLanguages && !isDisabled && !selectionMode && (
          <button
            onClick={handleLanguageToggle}
            className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1.5 text-white hover:bg-black/80 transition-colors z-30"
            title={showOriginal ? `Showing ${languageCode}` : 'Showing English'}
          >
            <Globe size={12} className="text-gray-200" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {showOriginal ? languageCode : 'EN'}
            </span>
          </button>
        )}

        {duration && duration !== '0:00' && (
          <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-medium text-white z-20">
            {duration}
          </div>
        )}

        {!selectionMode && (
          <div className="absolute top-3 right-3 z-20">
            <div className="w-7 h-7 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white shadow-sm">
              {platform === 'instagram' && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                  <defs>
                    <linearGradient id={`instagram-gradient-${videoId || 'x'}`} x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#FED373" />
                      <stop offset="25%" stopColor="#F15245" />
                      <stop offset="50%" stopColor="#D92E7F" />
                      <stop offset="75%" stopColor="#9B36B7" />
                      <stop offset="100%" stopColor="#515ECF" />
                    </linearGradient>
                  </defs>
                  <rect x="2" y="2" width="20" height="20" rx="5" fill={`url(#instagram-gradient-${videoId || 'x'})`} />
                  <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="2" fill="none" />
                  <circle cx="17.5" cy="6.5" r="1.5" fill="white" />
                </svg>
              )}
            </div>
          </div>
        )}

        {!selectionMode && (
          <div className="absolute inset-0 p-4 flex flex-col justify-start z-30 pointer-events-none">
            <div className="flex justify-start pointer-events-auto">
              <button
                onClick={handleHeartClick}
                disabled={isDisabled}
                className={`
                  absolute top-3 left-3 flex-shrink-0 z-30
                  w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200
                  ${
                    isDisabled
                      ? 'bg-transparent opacity-30 cursor-not-allowed'
                      : 'bg-white/20 backdrop-blur-md hover:bg-white/60 hover:scale-100 shadow-sm'
                  }
                `}
              >
                <Heart
                  size={18}
                  color="#FF2C00"
                  fill={isFavorite ? '#e63946' : 'transparent'}
                  strokeWidth={2}
                  style={{ transition: 'all 250ms ease-out', opacity: isFavorite ? 1 : 0.6 }}
                />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="px-1">
        <h3
          onClick={handleCardClick}
          className={`font-semibold text-gray-900 leading-tight line-clamp-2 transition-colors ${
            isDisabled ? 'cursor-not-allowed opacity-50' : 'hover:text-primary-600 cursor-pointer'
          }`}
          title={displayTitle}
        >
          {displayTitle}
        </h3>

        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-1.5 w-fit group/author"
          onClick={(e) => {
            e.stopPropagation();
            if (isDisabled) e.preventDefault();
          }}
        >
          <svg className="w-3 h-3 text-pink-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
          </svg>
          <span
            className={`text-xs font-medium text-gray-500 truncate group-hover/author:text-gray-900 transition-colors ${
              isDisabled ? 'opacity-50' : ''
            }`}
          >
            {author}
          </span>
        </a>
      </div>
    </div>
  );
};

export const VideoCard = React.memo(VideoCardComponent);
