import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';

interface VideoCardProps {
  video: any;
  selected?: boolean;
  onToggleSelect?: () => void;
  selectionMode?: boolean;
}

export const VideoCard: React.FC<VideoCardProps> = ({ video, selected, onToggleSelect, selectionMode }) => {
  const navigate = useNavigate();
  const [isFavorite, setIsFavorite] = useState(video.is_favorite || false);

  const handleHeartClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsFavorite(!isFavorite);
    // TODO: Update favorite in backend
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (selectionMode) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect?.();
    } else {
      navigate(`/reel/${video.process_id}`);
    }
  };

  const thumbnailUrl = video.gcs_urls?.preview_thumbnail || video.gcs_urls?.thumbnail || '';
  const title = video.summary?.title || 'Untitled';
  const author = video.author_name || 'Unknown';
  const duration = video.duration;
  
  // ✅ Detect platform from source_url or use default
  const detectPlatform = () => {
    const url = video.source_url?.toLowerCase() || '';
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('facebook.com') || url.includes('fb.com')) return 'facebook';
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    return 'instagram'; // default
  };

  const platform = detectPlatform();

  // ✅ Generate profile URL based on platform
  const getProfileUrl = () => {
    const username = author.replace('@', '');
    switch (platform) {
      case 'instagram':
        return `https://www.instagram.com/${username}/`;
      case 'facebook':
        return `https://www.facebook.com/${username}/`;
      case 'tiktok':
        return `https://www.tiktok.com/@${username}`;
      case 'youtube':
        return `https://www.youtube.com/@${username}`;
      default:
        return `https://www.instagram.com/${username}/`;
    }
  };

  const profileUrl = getProfileUrl();

  return (
    <div 
      className={`group relative flex flex-col gap-3 transition-transform duration-300 ${selected ? 'scale-[1]' : ''}`}
    >
      <style>{`
        @keyframes heartBeatOnce {
          0% { transform: scale(1); }
          45% { transform: scale(1.28); }
          100% { transform: scale(1); }
        }
        .heart-animate {
          animation: heartBeatOnce 0.35s ease-out;
        }
      `}</style>

      {/* ✅ Clickable Poster */}
      <div 
        onClick={handleCardClick}
        className="relative rounded-2xl overflow-hidden aspect-[9/16] bg-gray-100 shadow-sm group-hover:shadow-xl group-hover:shadow-primary-900/10 transition-all duration-300 transform-gpu cursor-pointer"
        style={{ WebkitMaskImage: '-webkit-radial-gradient(white, black)' }}
      >
        {thumbnailUrl ? (
          <img 
            src={thumbnailUrl} 
            alt={title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-200">
            <span className="text-gray-400">No preview</span>
          </div>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />

        {selected && (
          <>
            <div className="absolute inset-0 bg-primary-600/50 z-10 pointer-events-none backdrop-blur-[2px]" />
            <div className="absolute inset-0 border-[3px] border-primary-500 rounded-2xl z-20 pointer-events-none" />
          </>
        )}

        {duration && duration !== '0:00' && duration !== 'null' && (
          <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-medium text-white z-20">
            {duration}
          </div>
        )}

        {/* ✅ Platform Logo Badge */}
        <div className="absolute top-3 right-3 z-20">
          <div className="w-7 h-7 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white shadow-sm">
            {/* Instagram */}
            {platform === 'instagram' && (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                <defs>
                  <linearGradient id="instagram-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#FED373"/>
                    <stop offset="25%" stopColor="#F15245"/>
                    <stop offset="50%" stopColor="#D92E7F"/>
                    <stop offset="75%" stopColor="#9B36B7"/>
                    <stop offset="100%" stopColor="#515ECF"/>
                  </linearGradient>
                </defs>
                <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#instagram-gradient)"/>
                <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="2" fill="none"/>
                <circle cx="17.5" cy="6.5" r="1.5" fill="white"/>
              </svg>
            )}

            {/* Facebook */}
            {platform === 'facebook' && (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                <circle cx="12" cy="12" r="10" fill="#1877F2"/>
                <path d="M15.5 12.5h-2v7h-3v-7h-2v-2.5h2v-1.5c0-2.2 1.3-3.5 3.3-3.5 1 0 2 .2 2 .2v2.2h-1.1c-1.1 0-1.4.7-1.4 1.4v1.2h2.4l-.4 2.5z" fill="white"/>
              </svg>
            )}

            {/* TikTok */}
            {platform === 'tiktok' && (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                <rect width="24" height="24" rx="5" fill="black"/>
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" fill="#EE1D52"/>
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" fill="#69C9D0"/>
              </svg>
            )}

            {/* YouTube */}
            {platform === 'youtube' && (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                <rect x="2" y="5" width="20" height="14" rx="3" fill="#FF0000"/>
                <path d="M10 8.5v7l6-3.5-6-3.5z" fill="white"/>
              </svg>
            )}
          </div>
        </div>

        <div className="absolute inset-0 p-4 flex flex-col justify-start z-30">
          <div className="flex justify-start">
            <button 
              onClick={selectionMode ? (e) => { e.stopPropagation(); onToggleSelect?.(); } : handleHeartClick}
              className={`
                absolute top-3 left-3 flex-shrink-0 z-30
                w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200
                ${selectionMode 
                  ? 'bg-transparent'
                  : 'bg-white/20 backdrop-blur-md hover:bg-white/60 hover:scale-100 shadow-sm'
                }
              `}
            >
              {selectionMode ? (
                <div 
                  className={`
                    w-5 h-5 min-w-[18px] min-h-[18px] aspect-square rounded-full border-2 transition-all duration-200 relative flex-shrink-0 box-border
                    ${selected 
                      ? 'bg-primary-600 border-primary-600 ring-4 ring-primary-600/25' 
                      : 'border-white bg-white/30 backdrop-blur-sm hover:bg-primary-600/15 hover:border-primary-600 hover:shadow-[0_0_0_6px_rgba(124,58,237,0.25)] hover:scale-105'
                    }
                  `}
                >
                  {selected && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white rounded-full" />
                  )}
                </div>
              ) : (
                <Heart 
                  size={18}
                  color="#FF2C00"
                  fill={isFavorite ? "#e63946" : "transparent"} 
                  strokeWidth={2}
                  style={{
                    transition: 'all 250ms ease-out',
                    opacity: isFavorite ? 1 : 0.6,
                    animation: isFavorite ? 'heartBeatOnce 0.35s ease-out' : 'none'
                  }}
                />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ✅ Split: Clickable Title + Clickable Author */}
      <div className="px-">
        {/* Title - Clickable to reel detail */}
        <h3 
          onClick={handleCardClick}
          className="font-semibold text-gray-900 leading-tight line-clamp-2 group-hover:text-primary-600 transition-colors cursor-pointer"
        >
          {title}
        </h3>
        
        {/* Author - Clickable to profile page */}
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()} // Prevent card click
          className="flex items-center gap-2 mt-1.5 hover:opacity-70 transition-opacity w-fit"
        >
          <img 
            alt={platform} 
            className="w-5 h-5 rounded-full object-cover flex-shrink-0" 
            src="/instagram_logo.png"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = document.createElement('div');
              fallback.className = 'w-5 h-5 rounded-full bg-gray-200 flex-shrink-0';
              e.currentTarget.parentElement?.insertBefore(fallback, e.currentTarget);
            }}
          />
          <span className="text-xs font-medium text-gray-500 truncate">
            {author.replace('@', '')}
          </span>
        </a>
      </div>
    </div>
  );
};
