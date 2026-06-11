import { apiGet, apiPost } from '../../lib/apiClient';

export type FolderSuggestion = {
  suggestion_id: string;
  reel_id: string;
  title: string;
  summary_title?: string | null;
  summary_topic?: string | null;
  summary_category?: string | null;
  thumbnail_url?: string | null;
  thumbnailUrl?: string | null;
  source_url?: string | null;
  content_type?: string | null;
  list_subtype?: string | null;
  confidence: number;
  reason: string;
  suggested_folder_id?: string | null;
  suggested_folder_name: string;
  suggestion_type: 'existing_folder' | 'new_folder';
  status: 'pending' | 'applied' | 'dismissed';
};

export type FolderSuggestionGroup = {
  suggested_folder_id?: string | null;
  suggested_folder_name: string;
  suggestion_type: 'existing_folder' | 'new_folder';
  count: number;
  avg_confidence: number;
  suggestions: FolderSuggestion[];
};

export type FolderSuggestionsResponse = {
  suggestions: FolderSuggestion[];
  groups: FolderSuggestionGroup[];
  total: number;
  unsorted_count: number;
  suggestions_created_or_updated?: number;
  unsorted_considered?: number;
  folders_considered?: number;
};

function normalizeSuggestion(raw: any): FolderSuggestion {
  return {
    ...raw,
    thumbnailUrl: raw?.thumbnailUrl || raw?.thumbnail_url || '',
    thumbnail_url: raw?.thumbnail_url || raw?.thumbnailUrl || '',
  };
}

function normalizeResponse(data: FolderSuggestionsResponse): FolderSuggestionsResponse {
  const groups = (data.groups || []).map((group) => ({
    ...group,
    suggestions: (group.suggestions || []).map(normalizeSuggestion),
  }));
  const suggestions = (data.suggestions || []).map(normalizeSuggestion);
  return { ...data, groups, suggestions };
}

export function listFolderSuggestions() {
  return apiGet<FolderSuggestionsResponse>('api/folder-suggestions').then(normalizeResponse);
}

export function generateFolderSuggestions(limit = 100) {
  return apiPost<FolderSuggestionsResponse>('api/folder-suggestions/generate', {
    limit,
    include_new_folder_suggestions: false,
  }).then(normalizeResponse);
}

export function applyFolderSuggestions(suggestionIds: string[]) {
  return apiPost<{ ok: boolean; applied: string[]; skipped: Array<{ suggestion_id: string; reason: string }> }>(
    'api/folder-suggestions/apply',
    { suggestion_ids: suggestionIds },
  );
}

export function dismissFolderSuggestions(suggestionIds: string[]) {
  return apiPost<{ ok: boolean; dismissed: string[] }>('api/folder-suggestions/dismiss', {
    suggestion_ids: suggestionIds,
  });
}
