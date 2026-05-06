import { getTitle } from "../utils/videoUtils";

type PublicContentType =
  | "recipe"
  | "workout"
  | "location"
  | "products"
  | "software"
  | "finance"
  | "general";

interface NormalizedReel {
  id: any;
  process_id: any;
  source_url: string;
  status: string;
  author_name: string;
  caption: string;
  created_at: string | null;
  folder_id: string;
  content_type: PublicContentType;
  recipe: any;
  workout?: any;
  tools_list: any;
  location?: any;
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

const normalizeContentType = (value: unknown): PublicContentType => {
  const ct = String(value || "").trim().toLowerCase();

  if (ct === "recipe") return "recipe";
  if (ct === "workout") return "workout";
  if (ct === "location" || ct === "places") return "location";
  if (ct === "products" || ct === "tools") return "products";
  if (ct === "software") return "software";
  if (ct === "finance") return "finance";
  return "general";
};

const parseMaybeJson = <T,>(value: unknown, fallback: T): T => {
  if (value == null) return fallback;

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  if (typeof value === "object") return value as T;
  return fallback;
};

const asObject = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

const cleanTitle = (text: string): string => {
  if (!text) return "Untitled Video";

  let clean = text.replace(/#\w+/g, "");

  const hooks = [
    /^saviez[- ]vous (qu'|que)?/i,
    /^did you know/i,
    /^voici comment/i,
    /^here is how/i,
    /^watch until the end/i,
    /^regardez jusqu'à la fin/i,
    /^retour en enfance/i,
    /^back to childhood/i,
    /^aujourd'hui/i,
    /^today/i,
    /^recette d[ue]/i,
    /^recipe of/i,
    /^je vous présente/i,
    /^let me show you/i,
    /^incroyable/i,
    /^amazing/i,
    /^super/i,
    /^facile/i,
    /^easy/i,
    /^recette/i,
    /^recipe/i,
  ];

  hooks.forEach((hook) => {
    clean = clean.replace(hook, "");
  });

  clean = clean.replace(/^[\W_]+/, "").trim();

  if (clean.length > 0) {
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  return clean.substring(0, 60) || "Untitled Video";
};

const normalizeTranscription = (value: unknown): { transcript: string } => {
  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) return { transcript: "" };

    try {
      const parsed = JSON.parse(trimmed);
      return {
        transcript:
          typeof parsed?.transcript === "string"
            ? parsed.transcript
            : typeof parsed?.text === "string"
              ? parsed.text
              : "",
      };
    } catch {
      return { transcript: trimmed };
    }
  }

  if (value && typeof value === "object") {
    const obj = value as any;
    return {
      transcript:
        typeof obj?.transcript === "string"
          ? obj.transcript
          : typeof obj?.text === "string"
            ? obj.text
            : "",
    };
  }

  return { transcript: "" };
};

export function normalizeReel(row: any): NormalizedReel | null {
  if (!row) return null;

  const summaryObj = asObject(parseMaybeJson<any>(row.summary, {}));
  const summaryTextObj = parseMaybeJson<any>(row.summary_text, row.summary_text ?? null);

  const recipe = parseMaybeJson<any>(row.recipe, null);
  const workout = parseMaybeJson<any>(row.workout, null);
  const toolsList = parseMaybeJson<any>(row.tools_list, null);
  const location = parseMaybeJson<any>(row.location, null);
  const gcsUrlsRaw = asObject(parseMaybeJson<any>(row.gcs_urls, {}));
  const transcription = normalizeTranscription(row.transcription);

  const englishSummary = asObject(summaryObj?.english);
  const originalSummary = asObject(summaryObj?.original);
  const summaryTextBlock = asObject(summaryTextObj);
  const englishSummaryText = asObject(summaryTextBlock?.english);
  const originalSummaryText = asObject(summaryTextBlock?.original);

  let title = "";

  if (recipe?.english?.title) {
    title = String(recipe.english.title);
  } else if (englishSummary?.title) {
    title = String(englishSummary.title);
  } else if (englishSummaryText?.title) {
    title = String(englishSummaryText.title);
  } else if (originalSummary?.title) {
    title = String(originalSummary.title);
  } else if (originalSummaryText?.title) {
    title = String(originalSummaryText.title);
  } else if (
    typeof summaryObj?.title === "string" &&
    summaryObj.title &&
    !summaryObj.title.toLowerCase().includes("untitled")
  ) {
    title = summaryObj.title;
  } else if (
    row.summary_title &&
    !String(row.summary_title).toLowerCase().includes("untitled")
  ) {
    title = String(row.summary_title);
  }

  if (!title) {
    const derivedTitle = getTitle({
      ...row,
      summary: summaryObj,
      summary_text: summaryTextObj,
      recipe,
    });

    if (derivedTitle && !String(derivedTitle).toLowerCase().includes("untitled")) {
      title = String(derivedTitle);
    }
  }

  if (!title && row.caption) {
    const firstLine = String(row.caption).split("\n")[0];
    title = cleanTitle(firstLine);
  }

  if (!title) title = "Untitled Reel";

  const summaryText =
    englishSummary?.summary ||
    englishSummaryText?.summary ||
    originalSummary?.summary ||
    originalSummaryText?.summary ||
    summaryObj?.summary ||
    summaryObj?.text ||
    (typeof summaryTextObj === "string" ? summaryTextObj : "") ||
    "";

  let bullets: any[] = [];
  if (Array.isArray(englishSummary?.headlines)) {
    bullets = englishSummary.headlines;
  } else if (Array.isArray(englishSummaryText?.headlines)) {
    bullets = englishSummaryText.headlines;
  } else if (Array.isArray(originalSummary?.headlines)) {
    bullets = originalSummary.headlines;
  } else if (Array.isArray(originalSummaryText?.headlines)) {
    bullets = originalSummaryText.headlines;
  } else if (Array.isArray(summaryObj?.bullets)) {
    bullets = summaryObj.bullets;
  } else if (Array.isArray(summaryObj?.headlines)) {
    bullets = summaryObj.headlines;
  } else if (typeof row.summary_bullets === "string") {
    try {
      bullets = JSON.parse(row.summary_bullets);
    } catch {
      bullets = [];
    }
  } else if (Array.isArray(row.summary_bullets)) {
    bullets = row.summary_bullets;
  }

  const normalizedSummary = {
    category:
      String(
        summaryObj?.category ||
          englishSummary?.category ||
          englishSummaryText?.category ||
          row.summary_category ||
          "",
      ),
    title,
    topic:
      String(
        summaryObj?.topic ||
          englishSummary?.topic ||
          englishSummaryText?.topic ||
          row.summary_topic ||
          "",
      ),
    summary: String(summaryText || ""),
    bullets: Array.isArray(bullets) ? bullets : [],
    emojis: Array.isArray(englishSummary?.emojis)
      ? englishSummary.emojis
      : Array.isArray(englishSummaryText?.emojis)
        ? englishSummaryText.emojis
        : Array.isArray(summaryObj?.emojis)
          ? summaryObj.emojis
          : [],
    hashtags: Array.isArray(englishSummary?.hashtags)
      ? englishSummary.hashtags
      : Array.isArray(englishSummaryText?.hashtags)
        ? englishSummaryText.hashtags
        : Array.isArray(summaryObj?.hashtags)
          ? summaryObj.hashtags
          : Array.isArray(row.summary_hashtags)
            ? row.summary_hashtags
            : [],
  };

  const gcs_urls = {
    video: row.gcs_video_url || gcsUrlsRaw?.video || null,
    thumbnail: row.gcs_thumbnail_url || gcsUrlsRaw?.thumbnail || null,
    preview_thumbnail:
      row.gcs_preview_thumb_url || gcsUrlsRaw?.preview_thumbnail || null,
    caption_json: row.gcs_caption_json_url || gcsUrlsRaw?.caption_json || null,
    transcription: row.gcs_transcription_url || gcsUrlsRaw?.transcription || null,
    result_json: row.gcs_result_json_url || gcsUrlsRaw?.result_json || null,
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
    content_type: normalizeContentType(row.content_type),
    recipe,
    workout,
    tools_list: toolsList,
    location,
    summary: normalizedSummary,
    summary_text: summaryTextObj,
    transcription,
    gcs_urls,
    is_favorite: Boolean(row.is_favorite ?? row.isFavorite),
    isTemp: Boolean(row.isTemp),
    duration: row.duration || null,
    title,
    author: row.author_name || "Unknown",
    thumbnailUrl: gcs_urls.preview_thumbnail || gcs_urls.thumbnail || "",
    videoUrl: gcs_urls.video || "",
    __raw: row,
  };
}