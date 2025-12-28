// /Users/greg/Downloads/Apps/recolekt-app/frontend/services/normalizeReel.ts

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
  summary: {
    category: string;
    title: string;
    topic: string;
    bullets: any[];
    emojis: any[];
    hashtags: any[];
  };
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
}

export function normalizeReel(row: any): NormalizedReel | null {
  if (!row) return null;

  // -------------------------------------------------------
  // SUMMARY: Handle both preview JSON and DB formats
  // -------------------------------------------------------
  const summary = (() => {
    // Preview JSON format (has row.summary object)
    if (row.summary && typeof row.summary === 'object') {
      return {
        category: row.summary.category || row.category || "General",
        title: row.summary.title || "Untitled Reel",
        topic: row.summary.topic || "",
        bullets: Array.isArray(row.summary.bullets) ? row.summary.bullets : [],
        emojis: Array.isArray(row.summary.emojis) ? row.summary.emojis : [],
        hashtags: Array.isArray(row.summary.hashtags) ? row.summary.hashtags : [],
      };
    }

    // DB format (has summary_title, summary_topic, etc.)
    let bullets: any[] = [];
    try {
      if (Array.isArray(row.summary_bullets)) {
        bullets = row.summary_bullets;
      } else if (typeof row.summary_bullets === "string") {
        bullets = JSON.parse(row.summary_bullets);
      }
    } catch {
      bullets = [];
    }

    return {
      category: row.summary_category || row.category || "General",
      title: row.summary_title || "Untitled Reel",
      topic: row.summary_topic || "",
      bullets: bullets,
      emojis: [],
      hashtags: Array.isArray(row.summary_hashtags) ? row.summary_hashtags : [],
    };
  })();

  // -------------------------------------------------------
  // ✅ RECIPE: Parse if it's a JSON string
  // -------------------------------------------------------
  let recipe = row.recipe;
  if (typeof recipe === 'string') {
    try {
      recipe = JSON.parse(recipe);
    } catch (e) {
      recipe = null;
    }
  }

  // -------------------------------------------------------
  // TRANSCRIPTION: Handle object, JSON string, or plain text
  // -------------------------------------------------------
  let transcription: any = { transcript: "" };
  try {
    if (typeof row.transcription_json === "object" && row.transcription_json !== null) {
      transcription = row.transcription_json;
    } else if (typeof row.transcription_json === "string") {
      transcription = JSON.parse(row.transcription_json);
    } else if (row.transcription) {
      transcription = { transcript: row.transcription };
    }
  } catch {
    transcription = { transcript: row.transcription || "" };
  }

  // -------------------------------------------------------
  // GCS URLs: Handle both DB format and preview JSON format
  // -------------------------------------------------------
  const gcs_urls = {
    video: row.gcs_video_url || row.gcs_urls?.video || null,
    thumbnail: row.gcs_thumbnail_url || row.gcs_urls?.thumbnail || null,
    preview_thumbnail: 
      row.gcs_preview_thumb_url || 
      row.gcs_urls?.preview_thumbnail || 
      null,
    caption_json: row.gcs_caption_json_url || row.gcs_urls?.caption_json || null,
    transcription: row.gcs_transcription_url || row.gcs_urls?.transcription || null,
    result_json: row.gcs_result_json_url || row.gcs_urls?.result_json || null,
  };

  // -------------------------------------------------------
  // STATUS: Explicit handling
  // -------------------------------------------------------
  const getStatus = () => {
    if (row.isTemp === true) return "processing";
    if (row.status === "done") return "done";
    if (row.status === "processing") return "processing";
    if (row.status === "error") return "error";
    return "done";
  };

  // -------------------------------------------------------
  // RETURN: Complete normalized object
  // -------------------------------------------------------
  return {
    id: row.id || row.process_id,
    process_id: row.process_id || row.id,
    source_url: row.source_url || "",
    status: getStatus(),
    author_name: row.author_name || "",
    caption: row.caption || "",
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    folder_id: row.folder_id || "default",
    
    // ✅ ADD: content_type and recipe
    content_type: row.content_type || 'generic',
    recipe: recipe,
    
    summary,
    transcription,
    gcs_urls,
    
    is_favorite: row.is_favorite || false,
    isTemp: row.isTemp || false,
    duration: row.duration || null,
  };
}
