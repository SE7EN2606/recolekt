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

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const { videos } = useData();
  const navigate = useNavigate();
  const { t } = useTranslation(['common', 'gallery']);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
      setQuery('');
    }
    return () => {
      document.body.style.overflow = 'unset';
    }
  }, [isOpen]);

  const results = query.trim() === '' 
    ? [] 
    : (videos || []).filter((v: any) => {
        const safeText = (text: any) => typeof text === 'string' ? text : '';
        const tagsStr = Array.isArray(v.tags) ? v.tags.join(' ') : '';
        
        const searchStr = [
          safeText(v.title),
          safeText(v.author),
          safeText(v.category),
          safeText(v.summary?.topic || v.__raw?.summary_topic),
          safeText(v.caption || v.__raw?.caption),
          safeText(v.transcript),
          tagsStr
        ].join(' ').toLowerCase();
        
        return searchStr.includes(query.toLowerCase());
      }).slice(0, 8); 

  const handleSelect = (videoId: string) => {
    navigate(`/video/${videoId}`);
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
              
              <div className="flex items-center p-4 border-b border-gray-200/50">
                <Search className="text-gray-500 ml-2" size={22} />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('common:search', 'Search videos, authors, tags, transcripts...')}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-lg font-medium px-4 text-gray-900 outline-none placeholder-gray-400"
                />
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-black/5 rounded-full transition-colors text-gray-500"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {query.trim() !== '' && results.length === 0 && (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/40">
                      <Search size={24} className="text-gray-400" />
                    </div>
                    <p className="text-gray-600 font-medium">{t('gallery:noVideosFound', 'No results found')}</p>
                  </div>
                )}

                {results.length > 0 && (
                  <div className="p-2">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-4 py-3">
                      {t('common:results', 'Results')}
                    </p>
                    {results.map((video: any) => (
                      <button
                        key={video.id}
                        onClick={() => handleSelect(video.id)}
                        className="w-full flex items-center gap-4 p-3 hover:bg-white/60 rounded-2xl transition-all group"
                      >
                        <div className="w-14 h-14 rounded-xl bg-black/5 border border-white/40 flex-shrink-0 overflow-hidden relative shadow-sm">
                          {video.thumbnailUrl ? (
                            <img src={video.thumbnailUrl} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-primary-600">
                              <Play size={18} fill="currentColor" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <h4 className="font-bold text-base text-gray-900 line-clamp-2 group-hover:text-primary-600 transition-colors leading-snug">
                            {video.title || video.summary?.topic || video.caption || 'Untitled Video'}
                          </h4>
                        </div>
                        <ChevronRight size={18} className="text-gray-400 group-hover:text-primary-500 mr-2 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}

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