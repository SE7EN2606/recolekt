import { apiDelete, apiGet, apiPut } from '../../lib/apiClient';

export type RecipeNoteResponse = {
  noteText: string;
  createdAt?: string;
  updatedAt?: string;
};

function noteUrl(reelId: string) {
  return `api/reel/${encodeURIComponent(reelId)}/notes`;
}

export async function getRecipeNote(reelId: string): Promise<RecipeNoteResponse> {
  const data = await apiGet<any>(noteUrl(reelId));

  return {
    noteText: String(data?.noteText || ''),
    createdAt: data?.createdAt,
    updatedAt: data?.updatedAt,
  };
}

export async function saveRecipeNote(
  reelId: string,
  noteText: string
): Promise<RecipeNoteResponse> {
  const data = await apiPut<any>(noteUrl(reelId), { noteText });

  return {
    noteText: String(data?.noteText ?? noteText),
    createdAt: data?.createdAt,
    updatedAt: data?.updatedAt,
  };
}

export async function deleteRecipeNote(reelId: string): Promise<RecipeNoteResponse> {
  const data = await apiDelete<any>(noteUrl(reelId));

  return {
    noteText: String(data?.noteText || ''),
    createdAt: data?.createdAt,
    updatedAt: data?.updatedAt,
  };
}
