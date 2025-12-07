import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { Video } from '../types';
import { useData } from '../context/DataContext';
import { ConfirmModal } from './ConfirmModal';

interface VideoCardProps {
  video: Video;
  selected?: boolean;
  onToggleSelect?: () => void;
  selectionMode?: boolean;
}

export const VideoCard: React.FC<VideoCardProps> = ({ video, selected, onToggleSelect, selectionMode }) => {
  const { toggleFavorite } = useData();
  const navigate = useNavigate();
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const handleHeartClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (video.isFavorite) {
      setShowRemoveConfirm(true);
    } else {
      toggleFavorite(video.id);
    }
  };

  const confirmRemoveFavorite = () => {
    toggleFavorite(video.id);
    setShowRemoveConfirm(false);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (selectionMode) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect?.();
    } else {
      navigate(`/video/${video.id}`);
    }
  };

  return (
    <>
      <div 
        onClick={handleCardClick}
        className={`group relative flex flex-col gap-3 transition-transform duration-300 ${selected ? 'scale-[1]' : ''} cursor-pointer`}
      >
        {/* Minimal Style Block for Keyframes Only */}
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

        {/* Thumbnail Container */}
        <div 
          className="relative rounded-2xl overflow-hidden aspect-[9/16] bg-gray-100 shadow-sm group-hover:shadow-xl group-hover:shadow-primary-900/10 transition-all duration-300 transform-gpu"
          style={{ WebkitMaskImage: '-webkit-radial-gradient(white, black)' }}
        >
          <img 
            src={video.thumbnailUrl} 
            alt={video.title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            loading="lazy"
          />
          
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />

          {selected && (
            <>
              <div className="absolute inset-0 bg-primary-600/50 z-10 pointer-events-none backdrop-blur-[2px]" />
              <div className="absolute inset-0 border-[3px] border-primary-500 rounded-2xl z-20 pointer-events-none" />
            </>
          )}

          <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-medium text-white z-20">
            {video.duration}
          </div>

          <div className="absolute top-3 right-3 z-20">
            <div className="w-8 h-8 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white shadow-sm">
              {video.platform === 'instagram' && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
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
              {video.platform === 'youtube' && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                  <path d="M21.582 7.186c-.252-1.028-1.002-1.84-2.003-2.093C18.094 4.5 12 4.5 12 4.5s-6.094 0-7.579.593c-1.001.253-1.751 1.065-2.003 2.093C1.846 8.73 1.846 12 1.846 12s0 3.27.572 4.814c.252 1.028 1.002 1.84 2.003 2.093C5.906 19.5 12 19.5 12 19.5s6.094 0 7.579-.593c1.001-.253 1.751-1.065 2.003-2.093C22.154 15.27 22.154 12 22.154 12s0-3.27-.572-4.814z" fill="#FF0000"/>
                  <path d="M9.846 15.231V8.769L15.385 12l-5.539 3.231z" fill="white"/>
                </svg>
              )}
              {video.platform === 'tiktok' && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="#000000" fillRule="evenodd" className="w-6 h-6" style={{ display: 'block' }}>
                  <path d="M800 112.962C800 50.575 749.425 0 687.038 0H112.962C50.575 0 0 50.575 0 112.962v574.076C0 749.426 50.575 800 112.962 800h574.076C749.425 800 800 749.426 800 687.038zM662.759 348.916c-51.615.577-99.71-15.027-141.938-43.927v202.874c0 90.166-61.72 167.62-148.996 187.848-119.068 27.165-219.864-58.954-232.577-161.835-13.294-102.884 52.322-193.051 152.892-213.281 19.651-4.045 49.209-4.045 64.458-.577v108.661c-4.692-1.153-9.086-2.31-13.709-2.888-39.304-6.937-77.371 12.715-92.977 48.55-15.605 35.838-5.16 77.451 26.629 101.73 26.586 20.806 56.085 23.694 86.14 9.822 30.057-13.291 46.21-37.567 49.676-70.512.578-4.622.546-9.826.546-15.028V110.206c0-10.981.086-10.502 11.068-10.502h86.12c6.36 0 8.673.915 9.25 8.433 4.621 67.047 55.526 124.147 120.838 132.818 6.937 1.155 14.369 1.613 22.58 2.19z" transform="translate(112 112)"/>
                </svg>
              )}
              {video.platform === 'facebook' && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                  <circle cx="12" cy="12" r="10" fill="#1877F3"/>
                  <path d="M13.25 17.5V12.5h1.75l.25-2H13.25V9.5c0-.576.152-.967.938-.967H15.5V6.875A18.924 18.924 0 0 0 13.562 6.75c-1.595 0-2.562.97-2.562 2.75v1.5H9v2h2v5h2.25z" fill="#FFF"/>
                </svg>
              )}
            </div>
          </div>

          <div className="absolute inset-0 p-4 flex flex-col justify-start z-30">
            {/* TOP LEFT: Action Button (Heart or Radio) */}
            <div className="flex justify-start">
              <button 
                onClick={selectionMode ? (e) => { e.stopPropagation(); onToggleSelect?.(); } : handleHeartClick}
                className={`
                  absolute top-3 left-3 flex-shrink-0 z-30
                  w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200
                  ${selectionMode 
                    ? 'bg-transparent'
                    : 'bg-white/20 backdrop-blur-md hover:bg-white/60 hover:scale-100 shadow-sm'
                  }
                `}
              >
                {selectionMode ? (
                  <div 
                    className={`
                      w-6 h-6 min-w-[18px] min-h-[18px] aspect-square rounded-full border-2 transition-all duration-200 relative flex-shrink-0 box-border
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
                    size={20} 
                    className={`
                      transition-all duration-250 ease-out flex-shrink-0
                      ${video.isFavorite ? 'heart-animate opacity-100' : 'opacity-60 hover:opacity-90'}
                    `}
                    color="#FF2C00"
                    fill={video.isFavorite ? "#e63946" : "transparent"} 
                    strokeWidth={2}
                  />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="px-">
          <h3 className="font-semibold text-gray-900 leading-tight line-clamp-2 group-hover:text-primary-600 transition-colors">
            {video.title}
          </h3>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="w-5 h-5 rounded-full bg-gray-200 flex-shrink-0" />
            <span className="text-xs font-medium text-gray-500 truncate">{video.author}</span>
          </div>
        </div>
      </div>

      <ConfirmModal 
        isOpen={showRemoveConfirm}
        onClose={() => setShowRemoveConfirm(false)}
        onConfirm={confirmRemoveFavorite}
        title="Remove Favorite"
        message="Are you sure you want to remove this video from your favorites?"
        confirmLabel="Remove"
        variant="danger"
      />
    </>
  );
};
