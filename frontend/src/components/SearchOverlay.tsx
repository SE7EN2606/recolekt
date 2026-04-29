import { API_BASE } from '../utils/api';
import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Play, ChevronRight } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Helpers to normalise both camelCase (context) and snake_case (server) shapes ──
const getVideoId = (v: any): string =>
  v?.id ?? v?.process_id ?? v?.processId ?? '';

const getTitle = (v: any): string =>
  v?.summary_title ||
  v?.summary?.english?.title ||
  v?.summary?.title ||
  v?.title ||
  v?.caption?.split('\n')[0]?.slice(0, 80) ||
  'Untitled';

const getThumbnail = (v: any): string =>
  v?.thumbnailUrl ||
  v?.gcs_urls?.preview_thumbnail ||
  v?.thumbnail ||
  '';

// ── Client-side search index fallback ────────────────────────────────────────
const SKIP_KEYS = new Set([
  'id', 'process_id', 'processId', 'folderId', 'folder_id',
  'userId', 'user_id', 'thumbnail', 'thumbnailUrl', 'url', 'videoUrl',
  'savedAt', 'created_at', 'updated_at', 'status', 'isFavorite',
]);

function buildHaystack(v: any): string {
  const extract = (val: unknown, depth = 0): string => {
    if (depth > 6) return '';
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map(i => extract(i, depth + 1)).join(' ');
    if (val !== null && typeof val === 'object') {
      return Object.entries(val as Record<string, unknown>)
        .filter(([k]) => !SKIP_KEYS.has(k))
        .map(([, child]) => extract(child, depth + 1))
        .join(' ');
    }
    return '';
  };
  return extract(v).toLowerCase();
}

// ── Server-side FTS hook (same pattern as Gallery) ────────────────────────────
function useSearch(query: string) {
  const [results, setResults]     = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults(null); return; }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: query.trim() });
        const res = await fetch(`${API_BASE}/search?${params}`, {
          signal: controller.signal,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.warn('[SearchOverlay] falling back to client index:', err.message);
        setResults(null);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => { if (!query.trim()) setResults(null); }, [query]);

  return { results, searching };
}

// ─────────────────────────────────────────────────────────────────────────────
export const SearchOverlay: React.FC<SearchOverlayProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const { videos } = useData();
  const navigate    = useNavigate();
  const { t }       = useTranslation(['common', 'gallery']);
  const inputRef    = useRef<HTMLInputElement>(null);

  const { results: serverResults, searching } = useSearch(query);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
      setQuery('');
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  // Server results → use directly (already ranked).
  // Fallback → client-side recursive index over the context videos.
  const results: any[] = (() => {
    if (!query.trim()) return [];

    if (serverResults !== null) return serverResults.slice(0, 8);

    const q = query.toLowerCase().trim();
    return (videos || [])
      .filter((v: any) => buildHaystack(v).includes(q))
      .slice(0, 8);
  })();

  const handleSelect = (video: any) => {
    navigate(`/video/${getVideoId(video)}`);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex flex-col">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
          />

          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="relative w-full max-w-2xl mx-auto mt-4 md:mt-20 px-4"
          >
            <div className="bg-white/85 backdrop-blur-2xl rounded-[32px] shadow-[0_16px_40px_rgba(0,0,0,0.12)] overflow-hidden border border-white/60">

              {/* Search input */}
              <div className="flex items-center p-4 border-b border-gray-200/50 gap-2">
                <Search className="text-gray-500 ml-2 shrink-0" size={22} />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={t('common:search', 'Search videos, authors, tags, transcripts...')}
                  className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 text-lg font-medium px-3 text-gray-900 outline-none placeholder-gray-400"
                />
                {/* Spinner */}
                {searching && (
                  <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin shrink-0" />
                )}
                {/* Close overlay */}
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-red-50 rounded-full transition-colors text-gray-500 hover:text-red-500 shrink-0"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto">

                {/* No results */}
                {query.trim() !== '' && !searching && results.length === 0 && (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/40">
                      <Search size={24} className="text-gray-400" />
                    </div>
                    <p className="text-gray-600 font-medium">
                      {t('gallery:noVideosFound', 'No results found')}
                    </p>
                  </div>
                )}

                {/* Results list */}
                {results.length > 0 && (
                  <div className="p-2">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-4 py-3">
                      {t('common:results', 'Results')}
                    </p>
                    {results.map((video: any) => {
                      const videoId   = getVideoId(video);
                      const title     = getTitle(video);
                      const thumbnail = getThumbnail(video);
                      return (
                        <button
                          key={videoId}
                          onClick={() => handleSelect(video)}
                          className="w-full flex items-center gap-4 p-3 hover:bg-white/60 rounded-2xl transition-all group"
                        >
                          <div className="w-14 h-14 rounded-xl bg-black/5 border border-white/40 flex-shrink-0 overflow-hidden relative shadow-sm">
                            {thumbnail ? (
                              <img src={thumbnail} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-primary-600">
                                <Play size={18} fill="currentColor" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <h4 className="font-bold text-base text-gray-900 line-clamp-2 group-hover:text-primary-600 transition-colors leading-snug">
                              {title}
                            </h4>
                          </div>
                          <ChevronRight size={18} className="text-gray-400 group-hover:text-primary-500 mr-2 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Empty state */}
                {query.trim() === '' && (
                  <div className="p-8 text-center text-gray-500 text-sm font-medium">
                    {t('common:startTyping', 'Type to search your videos, transcripts, and tags...')}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};