// src/components/MetadataPanel.tsx
// Mobile violet card + desktop right-column category/topic/hashtags panel
import { useTranslation } from 'react-i18next';
import React from 'react';
import { Pencil } from 'lucide-react';
import {
  CategoryIcon, TopicIcon, HashtagsIcon,
} from '../components/CustomIcons';

interface Props {
  category: string;
  subCategory?: string;
  tags: string[];
  isEditing: boolean;
  onEditCategory: (val: string) => void;
  onEditTopic: (val: string) => void;
  onEditStart: () => void;
  variant: 'mobile' | 'desktop';
}

const HashtagLinks: React.FC<{ tags: string[] }> = ({ tags }) => (
  <div className="hashtag-links flex flex-wrap flex-1 gap-1.5">
    {tags.map((tag, idx) => {
      const clean = (typeof tag === 'string' ? tag : String(tag)).replace('#', '');
      return (
        <a
          key={idx}
          href={`https://www.instagram.com/explore/tags/${clean}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {clean}
        </a>
      );
    })}
  </div>
);

export const MetadataPanel: React.FC<Props> = ({
  category,
  subCategory,
  tags,
  isEditing,
  onEditCategory,
  onEditTopic,
  onEditStart,
  variant,
}) => {
  const { t } = useTranslation('videoDetail');

  const categoryLabel = String(category || '').trim();
  const topicLabel = String(subCategory || '').trim();
  const safeTags = Array.isArray(tags)
    ? tags.map((tag) => String(tag || '').replace('#', '').trim()).filter(Boolean)
    : [];
  if (variant === 'mobile') {
    return (
      <div className="md:hidden mb-6 bg-violet-50 border border-violet-200 rounded-xl overflow-hidden p-4">
        <div className="pb-3 mb-3 border-b border-violet-200/70 relative flex items-center">
          <div className="flex flex-col gap-2 pr-10 flex-1">
            <div className="flex items-center gap-2 min-h-[18px]">
              <CategoryIcon size={14} />
              <span className="text-xs font-bold uppercase tracking-wide truncate text-violet-600">
                {categoryLabel || '\u00A0'}
              </span>
            </div>
            {!isEditing && (
              <div className="flex items-center gap-2 min-h-[18px]">
                <TopicIcon size={14} />
                <span className="text-xs font-bold uppercase tracking-wide truncate text-pink-600">
                  {topicLabel || '\u00A0'}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onEditStart}
            className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition"
          >
            <Pencil size={14} />
          </button>
        </div>
        <div className="mt-3 flex items-start gap-3 min-h-[24px]">
          <div className="text-cyan-600 mt-[3px] flex-shrink-0">
            <HashtagsIcon size={16} />
          </div>
          <HashtagLinks tags={safeTags} />
        </div>
      </div>
    );
  }

  // Desktop variant
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col shrink-0 divide-y divide-gray-100">
      {/* Category */}
      <div className="p-5 flex flex-col gap-3 hover:bg-gray-50/50 transition-colors">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-violet-50 text-violet-600 rounded-md">
            <CategoryIcon size={16} />
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Category</span>
        </div>
        {isEditing ? (
          <input
            className="text-lg font-bold border-b border-primary-200 w-full focus:outline-none"
            value={categoryLabel}
            onChange={(e) => onEditCategory(e.target.value)}
          />
        ) : (
          <div className="text-lg font-bold text-gray-900 pl-1 leading-snug">{categoryLabel}</div>
        )}
      </div>

      {/* Topic */}
      <div className="p-5 flex flex-col gap-3 hover:bg-gray-50/50 transition-colors">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-pink-50 text-pink-600 rounded-md">
            <TopicIcon size={16} />
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Topic</span>
        </div>
        {isEditing ? (
          <input
            className="text-lg font-bold border-b border-primary-200 w-full focus:outline-none"
            value={subCategory || ''}
            onChange={(e) => onEditTopic(e.target.value)}
          />
        ) : (
          <div className="text-lg font-bold text-gray-900 pl-1 leading-snug min-h-[28px]">
            {topicLabel || '\u00A0'}
          </div>
        )}
      </div>

      {/* Hashtags */}
      <div className="p-5 flex flex-col gap-3 bg-gray-50/30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-cyan-50 text-cyan-600 rounded-md">
            <HashtagsIcon size={16} />
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Hashtags</span>
        </div>
        <div className="hashtag-links flex flex-wrap gap-2 pl-1">
          {tags?.length > 0 ? (
            tags.map((tag: string, idx: number) => {
              const c = (typeof tag === 'string' ? tag : String(tag)).replace('#', '');
              return (
                <a
                  key={idx}
                  href={`https://www.instagram.com/explore/tags/${c}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/pill inline-flex max-w-full items-center rounded-full border border-sky-100 bg-sky-50/70 px-3 py-1.5 text-xs font-bold shadow-sm transition duration-300 hover:bg-sky-100/80"
                >
                  <span
                    className="truncate text-quiet transition duration-300 group-hover/pill:text-foreground"
                    style={{ color: 'oklch(0.45 0.08 206)' }}
                  >
                    {c}
                  </span>
                </a>
              );
            })
          ) : (
            <span className="text-gray-400 text-xs italic">No tags</span>
          )}
        </div>
      </div>
    </div>
  );
};
