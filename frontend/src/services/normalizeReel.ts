import { getTitle } from "../utils/videoUtils";

interface NormalizedReel {
  id: any;
  process_id: any;
  source_url: string;
  status: string;
  author_name: string;
  caption: string;
  created_at: string | null;
  folder_id: string;
  content_type: string;
  recipe: any;
  tools_list: any;
  summary: {
    category: string;
    title: string;
    topic: string;
    bullets: any[];
    emojis: any[];
    hashtags: any[];
    summary: string;
  };
  summary_text: any;
  transcription: {
    transcript: string;
  };
  gcs_urls: {
    video: any;
    thumbnail: any;
    preview_thumbnail: any;
    caption_json: any;
    transcription: any;
    result_json: any;
  };
  is_favorite: boolean;
  isTemp: boolean;
  duration: any;
  title: string;
  thumbnailUrl: string;
  videoUrl: string;
  author: string;
  __raw: any;
}

const cleanTitle = (text: string): string => {
  if (!text) return "Untitled Video";

  let clean = text.replace(/#\w+/g, '');

  const hooks = [
    /^saviez[- ]vous (qu'|que)?/i, /^did you know/i, /^voici comment/i, /^here is how/i,
    /^watch until the end/i, /^regardez jusqu'à la fin/i, /^retour en enfance/i,
    /^back to childhood/i, /^aujourd'hui/i, /^today/i, /^recette d[ue]/i, /^recipe of/i,
    /^je vous présente/i, /^let me show you/i, /^incroyable/i, /^amazing/i, /^super/i,
    /^facile/i, /^easy/i, /^recette/i, /^recipe/i
  ];

  hooks.forEach(hook => { clean = clean.replace(hook, ''); });
  clean = clean.replace(/^[\W_]+/, '').trim();

  if (clean.length > 0) {
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  return clean.substring(0, 60);
};

export function normalizeReel(row: any): NormalizedReel | null {
  if (!row) return null;

  const summaryObj = row.summary || {};

  let recipe = row.recipe;
  if (typeof recipe === 'string') {
    try { recipe = JSON.parse(recipe); } catch (e) { recipe = null; }
  }

  let title = "";

  if (recipe && recipe.english && recipe.english.title) {
    title = recipe.english.title;
  }
  else if (summaryObj.title && typeof summaryObj.title === 'object' && summaryObj.title.english) {
    title = summaryObj.title.english;
  }
  else if (typeof summaryObj.title === 'string' && summaryObj.title && !summaryObj.title.toLowerCase().includes("untitled")) {
    title = summaryObj.title;
  }
  else if (row.summary_title && !row.summary_title.toLowerCase().includes("untitled")) {
    title = row.summary_title;
  }

  if (!title && row.caption) {
    const firstLine = row.caption.split('\n')[0];
    title = cleanTitle(firstLine);
  }

  if (!title) title = "Untitled Reel";

  const summaryText = summaryObj.summary || summaryObj.text || row.summary_text || "";

  let bullets = [];
  if (Array.isArray(summaryObj.bullets)) bullets = summaryObj.bullets;
  else if (Array.isArray(summaryObj.headlines)) bullets = summaryObj.headlines;
  else if (typeof row.summary_bullets === 'string') {
    try { bullets = JSON.parse(row.summary_bullets); } catch {}
  } else if (Array.isArray(row.summary_bullets)) {
    bullets = row.summary_bullets;
  }

  const normalizedSummary = {
    category: summaryObj.category || row.summary_category || "General",
    title: title,
    topic: summaryObj.topic || row.summary_topic || "General",
    summary: summaryText,
    bullets: bullets,
    emojis: Array.isArray(summaryObj.emojis) ? summaryObj.emojis : [],
    hashtags: Array.isArray(summaryObj.hashtags) ? summaryObj.hashtags : (row.summary_hashtags || []),
  };

  const gcs_urls = {
    video: row.gcs_video_url || row.gcs_urls?.video || null,
    thumbnail: row.gcs_thumbnail_url || row.gcs_urls?.thumbnail || null,
    preview_thumbnail: row.gcs_preview_thumb_url || row.gcs_urls?.preview_thumbnail || null,
    caption_json: row.gcs_caption_json_url || row.gcs_urls?.caption_json || null,
    transcription: row.gcs_transcription_url || row.gcs_urls?.transcription || null,
    result_json: row.gcs_result_json_url || row.gcs_urls?.result_json || null,
  };

  return {
    id: row.id || row.process_id,
    process_id: row.process_id || row.id,
    source_url: row.source_url || "",
    status: row.status || "done",
    author_name: row.author_name || "",
    caption: row.caption || "",
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    folder_id: row.folder_id || "default",
    content_type: row.content_type || 'generic',
    recipe,
    tools_list: row.tools_list || null,
    summary: normalizedSummary,
    summary_text: row.summary_text || null,
    transcription: row.transcription || { transcript: "" },
    gcs_urls,
    is_favorite: row.is_favorite || false,
    isTemp: row.isTemp || false,
    duration: row.duration || null,
    title: title,
    author: row.author_name || "Unknown",
    thumbnailUrl: gcs_urls.preview_thumbnail || gcs_urls.thumbnail || "",
    videoUrl: gcs_urls.video || "",
    __raw: row
  };
}