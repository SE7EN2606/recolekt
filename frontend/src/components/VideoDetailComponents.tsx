import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next'; // 🔥 IMPORT

interface EditableTitleProps {
  title: string;
  isEditMode: boolean;
  value: string;
  onChange: (value: string) => void;
  mobile?: boolean;
}

export const EditableTitle: React.FC<EditableTitleProps> = ({ 
  title, 
  isEditMode, 
  value, 
  onChange,
  mobile = false 
}) => {
  if (isEditMode) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className={`w-full px-3 py-2 ${mobile ? 'text-xl' : 'text-2xl lg:text-2xl'} font-bold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none`}
      />
    );
  }

  return (
    <h1 className={`${mobile ? 'text-xl' : 'text-2xl lg:text-2xl'} font-bold text-gray-900 leading-tight`}>
      {title}
    </h1>
  );
};

interface EditableBulletsProps {
  bullets: Array<{ headline: string; text: string; emoji?: string }>;
  isEditMode: boolean;
  value: Array<{ headline: string; text: string; emoji?: string }>;
  onChange: (bullets: Array<{ headline: string; text: string; emoji?: string }>) => void;
  mobile?: boolean;
}

export const EditableBullets: React.FC<EditableBulletsProps> = ({ 
  bullets, 
  isEditMode, 
  value, 
  onChange,
  mobile = false 
}) => {
  const { t } = useTranslation(['videoDetail']); // 🔥 HOOK

  // Safety check to ensure value is always an array
  const safeValue = Array.isArray(value) ? value : [];
  const safeBullets = Array.isArray(bullets) ? bullets : [];

  const updateBullet = (index: number, field: 'headline' | 'text' | 'emoji', newValue: string) => {
    const newBullets = [...safeValue];
    // Ensure object exists before updating
    if (!newBullets[index]) newBullets[index] = { headline: '', text: '', emoji: '•' };
    newBullets[index] = { ...newBullets[index], [field]: newValue };
    onChange(newBullets);
  };

  const addBullet = () => {
    onChange([...safeValue, { headline: '', text: '', emoji: '•' }]);
  };

  const removeBullet = (index: number) => {
    onChange(safeValue.filter((_, i) => i !== index));
  };

  if (!safeBullets.length && !isEditMode) return null;

  if (isEditMode) {
    return (
      <div className={mobile ? 'space-y-2' : 'space-y-3'}>
        {safeValue.map((b, i) => (
          <div key={i} className={`flex gap-2 items-start ${mobile ? 'p-2' : 'p-3'} bg-gray-50 rounded-lg border border-gray-200`}>
            <input
              type="text"
              value={b.emoji || ''}
              onChange={(e) => updateBullet(i, 'emoji', e.target.value)}
              className={`${mobile ? 'w-10' : 'w-12'} px-2 py-1 text-center ${mobile ? 'text-xs' : ''} border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500`}
              placeholder="📌"
            />
            <div className={`flex-1 ${mobile ? 'space-y-1' : 'space-y-2'}`}>
              <input
                type="text"
                value={b.headline || ''}
                onChange={(e) => updateBullet(i, 'headline', e.target.value)}
                className={`w-full px-${mobile ? '2' : '3'} py-1.5 text-${mobile ? 'xs' : 'sm'} font-semibold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500`}
                placeholder={t('videoDetail:headline')}
              />
              <input
                type="text"
                value={b.text || ''}
                onChange={(e) => updateBullet(i, 'text', e.target.value)}
                className={`w-full px-${mobile ? '2' : '3'} py-1.5 text-${mobile ? 'xs' : 'sm'} border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500`}
                placeholder={t('videoDetail:description')}
              />
            </div>
            <button
              onClick={() => removeBullet(i)}
              className="p-1 text-red-600 hover:bg-red-50 rounded"
            >
              <X size={mobile ? 14 : 18} />
            </button>
          </div>
        ))}
        <button
          onClick={addBullet}
          className={`text-${mobile ? 'xs' : 'sm'} text-primary-600 hover:text-primary-700 font-medium`}
        >
          {t('videoDetail:addHighlight')}
        </button>
      </div>
    );
  }

  return (
    <ul className={mobile ? 'space-y-2' : 'space-y-3'}>
      {safeBullets.map((b: any, i: number) => (
        <li key={i} className={`flex ${mobile ? 'gap-2' : 'gap-3'} items-start`}>
          <span className={`${mobile ? 'text-base' : 'text-lg'} min-w-[24px] flex justify-center mt-0.5`}>
            {b.emoji || '•'}
          </span>
          <div className="flex-1">
            <p className={`text-${mobile ? 'xs' : 'sm'} text-gray-900 ${mobile ? 'mb-0.5' : 'mb-1'}`}>
              <span className="font-semibold">{b.headline}</span>
              {b.headline && b.text && <span className="text-gray-400 mx-1.5">—</span>}
              <span className={mobile ? 'text-gray-600' : 'text-gray-700'}>{b.text}</span>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
};

interface EditableHashtagsProps {
  hashtags: string[];
  isEditMode: boolean;
  value: string[];
  onChange: (hashtags: string[]) => void;
  mobile?: boolean;
}

export const EditableHashtags: React.FC<EditableHashtagsProps> = ({ 
  hashtags, 
  isEditMode, 
  value, 
  onChange,
  mobile = false 
}) => {
  const { t } = useTranslation(['videoDetail']); // 🔥 HOOK

  const safeValue = Array.isArray(value) ? value : [];
  const safeHashtags = Array.isArray(hashtags) ? hashtags : [];

  const addHashtag = () => {
    onChange([...safeValue, '']);
  };

  const updateHashtag = (index: number, newValue: string) => {
    const newHashtags = [...safeValue];
    newHashtags[index] = newValue.replace('#', '');
    onChange(newHashtags);
  };

  const removeHashtag = (index: number) => {
    onChange(safeValue.filter((_, i) => i !== index));
  };

  if (!safeHashtags.length && !isEditMode) return null;

  if (isEditMode) {
    return (
      <div className="space-y-2">
        {safeValue.map((tag, index) => (
          <div key={index} className="flex gap-2 items-center">
            <input
              type="text"
              value={tag}
              onChange={(e) => updateHashtag(index, e.target.value)}
              placeholder={t('videoDetail:hashtag')}
              className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              onClick={() => removeHashtag(index)}
              className="p-1 text-red-600 hover:bg-red-50 rounded-full"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          onClick={addHashtag}
          className="text-xs text-primary-600 hover:text-primary-700 font-medium"
        >
          {t('videoDetail:addHashtag')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {safeHashtags.map((tag: string, index: number) => (
        <a
          key={index}
          href={`https://www.instagram.com/explore/tags/${tag}/`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${mobile ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-xs'} bg-violet-100 text-violet-700 font-medium rounded-full hover:bg-violet-200 transition`}
        >
          #{tag}
        </a>
      ))}
    </div>
  );
};

interface VideoMetaInfoProps {
  author: string;
  savedAt: string;
}

export const VideoMetaInfo: React.FC<VideoMetaInfoProps> = ({ author, savedAt }) => {
  const { t } = useTranslation(['videoDetail']); // 🔥 HOOK
  return (
    <div className="flex items-center justify-between mb-4 pb-2">
      <a
        href={`https://www.instagram.com/${author.replace('@', '')}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center hover:opacity-80"
        style={{ gap: '0.375rem' }}
      >
        <img 
          src="/instagram_logo.png" 
          alt="Instagram" 
          className="w-8 h-8 rounded-full" 
          style={{ marginRight: '-0.125rem' }} 
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <div className="text-sm font-semibold text-gray-900">
          {author.replace('@', '')}
        </div>
      </a>
      {savedAt && <div className="text-sm text-gray-500">{t('videoDetail:savedOn', { date: savedAt })}</div>}
    </div>
  );
};

interface EditableFieldProps {
  label: string;
  value: string;
  isEditMode: boolean;
  onChange: (value: string) => void;
}

export const EditableField: React.FC<EditableFieldProps> = ({ 
  label, 
  value, 
  isEditMode, 
  onChange 
}) => {
  return (
    <div className="bg-white border border-gray-200 p-6 rounded-lg">
      <div className="text-xs uppercase text-gray-500 font-semibold mb-3">{label}</div>
      {isEditMode ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
        />
      ) : (
        <p className="text-sm font-medium text-gray-900 whitespace-pre-wrap">{value}</p>
      )}
    </div>
  );
};