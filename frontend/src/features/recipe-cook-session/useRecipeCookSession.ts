import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createEmptyCookSession,
  getRecipeCookSession,
  RecipeCookSessionPayload,
  RecipeCookSessionStatus,
  saveRecipeCookSession,
} from './recipeCookSessionApi';

type CookSessionStatus = 'idle' | 'loading' | 'saving' | 'error';

function toSet(values: string[]) {
  return new Set(values.map((value) => String(value)));
}

function serializeSession(session: RecipeCookSessionPayload) {
  return JSON.stringify({
    currentStepIndex: session.currentStepIndex,
    checkedIngredientIds: [...session.checkedIngredientIds].sort(),
    completedStepIds: [...session.completedStepIds].sort(),
    status: session.status,
  });
}

export function useRecipeCookSession(
  reelId: string,
  enabled: boolean
): {
  currentStepIndex: number;
  checkedIngredientIds: Set<string>;
  completedStepIds: Set<string>;
  status: CookSessionStatus;
  setCurrentStepIndex: (stepIndex: number) => void;
  toggleCheckedIngredientId: (id: string) => void;
  toggleCompletedStepId: (stepIndex: number) => void;
  markCompletedStepId: (stepIndex: number) => void;
  completeSession: () => void;
} {
  const [session, setSession] = useState<RecipeCookSessionPayload>(() => createEmptyCookSession());
  const [status, setStatus] = useState<CookSessionStatus>('idle');
  const [loaded, setLoaded] = useState(false);
  const lastSavedRef = useRef('');

  useEffect(() => {
    setSession(createEmptyCookSession());
    setStatus('idle');
    setLoaded(false);
    lastSavedRef.current = '';
  }, [reelId]);

  useEffect(() => {
    const handleReset = (event: Event) => {
      const detail = (event as CustomEvent<{ reelId?: string }>).detail;
      if (!detail?.reelId || detail.reelId !== reelId) return;

      const emptySession = createEmptyCookSession();
      setSession(emptySession);
      lastSavedRef.current = serializeSession(emptySession);
      setStatus('idle');
    };

    window.addEventListener('recolekt:recipe-cook-session-reset', handleReset);
    return () => {
      window.removeEventListener('recolekt:recipe-cook-session-reset', handleReset);
    };
  }, [reelId]);

  useEffect(() => {
    if (!reelId || !enabled) return;

    let cancelled = false;
    setStatus('loading');

    const loadSession = async () => {
      try {
        const nextSession = await getRecipeCookSession(reelId);

        if (!cancelled) {
          setSession(nextSession);
          lastSavedRef.current = serializeSession(nextSession);
          setLoaded(true);
          setStatus('idle');
        }
      } catch (err) {
        console.warn('Recipe cook session load failed', err);
        if (!cancelled) {
          setLoaded(true);
          setStatus('error');
        }
      }
    };

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [reelId, enabled]);

  useEffect(() => {
    if (!reelId || !enabled || !loaded) return;

    const serialized = serializeSession(session);
    if (serialized === lastSavedRef.current) return;

    let cancelled = false;
    setStatus('saving');

    const timer = window.setTimeout(async () => {
      try {
        const savedSession = await saveRecipeCookSession(reelId, session);
        if (!cancelled) {
          setSession(savedSession);
          lastSavedRef.current = serializeSession(savedSession);
          setStatus('idle');
        }
      } catch (err) {
        console.warn('Recipe cook session save failed', err);
        if (!cancelled) {
          setStatus('error');
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reelId, enabled, loaded, session]);

  const updateSession = (
    updater: (current: RecipeCookSessionPayload) => RecipeCookSessionPayload
  ) => {
    setSession((current) => updater(current));
  };

  const setCurrentStepIndex = (stepIndex: number) => {
    updateSession((current) => ({
      ...current,
      currentStepIndex: Math.max(0, stepIndex),
      status: 'active',
    }));
  };

  const toggleCheckedIngredientId = (id: string) => {
    updateSession((current) => {
      const ids = toSet(current.checkedIngredientIds);
      ids.has(id) ? ids.delete(id) : ids.add(id);

      return {
        ...current,
        checkedIngredientIds: [...ids],
        status: 'active',
      };
    });
  };

  const toggleCompletedStepId = (stepIndex: number) => {
    updateSession((current) => {
      const ids = toSet(current.completedStepIds);
      const id = String(stepIndex);
      ids.has(id) ? ids.delete(id) : ids.add(id);

      return {
        ...current,
        completedStepIds: [...ids],
        status: 'active',
      };
    });
  };

  const markCompletedStepId = (stepIndex: number) => {
    updateSession((current) => {
      const ids = toSet(current.completedStepIds);
      ids.add(String(stepIndex));

      return {
        ...current,
        completedStepIds: [...ids],
        status: 'active',
      };
    });
  };

  const completeSession = () => {
    updateSession((current) => ({
      ...current,
      status: 'completed' as RecipeCookSessionStatus,
    }));
  };

  const checkedIngredientIds = useMemo(
    () => toSet(session.checkedIngredientIds),
    [session.checkedIngredientIds]
  );
  const completedStepIds = useMemo(
    () => toSet(session.completedStepIds),
    [session.completedStepIds]
  );

  return {
    currentStepIndex: session.currentStepIndex,
    checkedIngredientIds,
    completedStepIds,
    status,
    setCurrentStepIndex,
    toggleCheckedIngredientId,
    toggleCompletedStepId,
    markCompletedStepId,
    completeSession,
  };
}

export default useRecipeCookSession;
