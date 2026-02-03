export interface Video {
  id: string;
  title: string;
  author: string;
  platform: 'instagram' | 'youtube' | 'tiktok';
  thumbnailUrl: string;
  duration: string;
  savedAt: string;
  category: string;
  tags: string[];
  
  // ✅ UPDATED: Summary is now an object containing details
  summary: {
    title?: string | { english: string; original: string }; // ✅ ADDED: Support dual-language
    category?: string;
    topic?: string;
    summary?: string; // The actual text summary
    bullets?: { headline: string; text: string; emoji?: string }[];
    hashtags?: string[];
    emojis?: string[];
  } | string; // Allow string fallback for legacy

  transcript?: string;
  originalUrl: string;
  isFavorite: boolean;
  folderId: string;
  
  // New AI fields
  content_type?: string;
  recipe?: any;
  workout?: any;
  
  // ✅ ADDED: Backend status
  status?: string;
  __raw?: any;
}

export interface Folder {
  id: string;
  name: string;
  subFolders?: Folder[];
  parentId?: string | null;
}
