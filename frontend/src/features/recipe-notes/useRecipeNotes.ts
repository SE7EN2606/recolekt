import { useEffect, useRef, useState } from 'react';
import { getRecipeNote, saveRecipeNote } from './recipeNotesApi';

export type RecipeNoteStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

export function useRecipeNotes(
  reelId: string,
  enabled: boolean
): {
  note: string;
  setNote: (value: string) => void;
  status: RecipeNoteStatus;
} {
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<RecipeNoteStatus>('idle');
  const [lastSavedNote, setLastSavedNote] = useState('');
  const loadKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setNote('');
    setLastSavedNote('');
    setStatus('idle');
    loadKeyRef.current = null;
  }, [reelId]);

  useEffect(() => {
    if (!reelId || !enabled) return;
    if (loadKeyRef.current === reelId) return;

    let cancelled = false;
    loadKeyRef.current = reelId;
    setStatus('loading');

    const loadRecipeNote = async () => {
      try {
        const data = await getRecipeNote(reelId);
        const nextNote = String(data?.noteText || '');

        if (!cancelled) {
          setNote(nextNote);
          setLastSavedNote(nextNote);
          setStatus(nextNote ? 'saved' : 'idle');
        }
      } catch {
        if (!cancelled) {
          setStatus('error');
        }
      }
    };

    loadRecipeNote();

    return () => {
      cancelled = true;
    };
  }, [reelId, enabled]);

  useEffect(() => {
    if (!reelId || !enabled) return;
    if (loadKeyRef.current !== reelId) return;
    if (note === lastSavedNote) return;

    let cancelled = false;
    setStatus('saving');

    const timer = window.setTimeout(async () => {
      try {
        const data = await saveRecipeNote(reelId, note);
        const savedNote = String(data?.noteText ?? note);

        if (!cancelled) {
          setLastSavedNote(savedNote);
          setStatus('saved');
        }
      } catch {
        if (!cancelled) {
          setStatus('error');
        }
      }
    }, 800);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reelId, enabled, note, lastSavedNote]);

  return {
    note,
    setNote,
    status,
  };
}

export default useRecipeNotes;
