import React from 'react';
import { apiUrl } from '../../utils/videoDetailUtils';

const getRecipeAssistantToken = (): string => {
  try {
    return String(
      (window as any).__REKOLEKT_TOKEN__ ||
      localStorage.getItem("auth_token") ||
      localStorage.getItem("token") ||
      localStorage.getItem("access_token") ||
      localStorage.getItem("jwt") ||
      ""
    ).replace(/^Bearer\s+/i, "").trim();
  } catch {
    return "";
  }
};

export type RecipeAssistantHistoryEntry = {
  question: string;
  answer: string;
  createdAt?: string;
  created_at?: string;
};

type RecipeAssistantResponse = {
  history?: RecipeAssistantHistoryEntry[];
  answer?: string;
  error?: string;
};

type Params = {
  recipeId?: string;
};

export const useRecipeAssistant = ({
  recipeId,
}: Params) => {
  const [askQuestion, setAskQuestion] = React.useState('');
  const [askAnswer, setAskAnswer] = React.useState('');
  const [askLoading, setAskLoading] = React.useState(false);
  const [askError, setAskError] = React.useState('');
  const [askHistory, setAskHistory] = React.useState<
    RecipeAssistantHistoryEntry[]
  >([]);

  const askHistoryStorageKey = React.useMemo(
    () => (recipeId ? `recolekt:recipe-ask:${recipeId}` : ''),
    [recipeId],
  );

  const loadAskHistory = React.useCallback(async () => {
    if (!askHistoryStorageKey || !recipeId) return;

    try {
      const raw = localStorage.getItem(askHistoryStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setAskHistory(Array.isArray(parsed) ? parsed.slice(0, 10) : []);
    } catch {
      setAskHistory([]);
    }

    try {
      const token = getRecipeAssistantToken();
      const res = await fetch(
        apiUrl(`api/reel/${encodeURIComponent(recipeId)}/ask/history?limit=10`),
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
        }
      );

      const data = (await res.json().catch(() => ({}))) as {
        history?: RecipeAssistantHistoryEntry[];
      };

      if (res.ok && Array.isArray(data.history)) {
        const nextHistory = data.history.slice(0, 10);
        setAskHistory(nextHistory);
        try {
          localStorage.setItem(askHistoryStorageKey, JSON.stringify(nextHistory));
        } catch {}
      }
    } catch {
      // Keep cached history only.
    }
  }, [askHistoryStorageKey, recipeId]);

  const handleAskRecipe = async () => {
    const question = askQuestion.trim();

    if (!question || !recipeId || askLoading) return;

    setAskLoading(true);
    setAskError('');

    try {
      const token = getRecipeAssistantToken();

      const res = await fetch(
        apiUrl(`api/reel/${encodeURIComponent(recipeId)}/ask`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({ question }),
        }
      );

      const data = (await res.json().catch(() => ({}))) as RecipeAssistantResponse;

      if (!res.ok) {
        throw new Error(
          data?.error || `Recipe assistant failed (${res.status})`
        );
      }

      const nextAnswer = data.answer || 'No answer returned.';

      setAskAnswer(nextAnswer);

      const fallbackEntry = {
        question,
        answer: nextAnswer,
        createdAt: new Date().toISOString(),
      };

      const nextHistory =
        Array.isArray(data.history) && data.history.length > 0
          ? data.history.slice(0, 10)
          : [fallbackEntry, ...askHistory].slice(0, 10);

      setAskHistory(nextHistory);

      if (askHistoryStorageKey) {
        try {
          localStorage.setItem(
            askHistoryStorageKey,
            JSON.stringify(nextHistory)
          );
        } catch {}
      }
    } catch (err: any) {
      setAskError(err?.message || 'Recipe assistant failed.');
    } finally {
      setAskLoading(false);
    }
  };

  return {
    askQuestion,
    setAskQuestion,
    askAnswer,
    setAskAnswer,
    askLoading,
    askError,
    askHistory,
    askHistoryStorageKey,
    setAskHistory,
    loadAskHistory,
    handleAskRecipe,
  };
};

export default useRecipeAssistant;
