import { useEffect, useState } from 'react';
import type { LocalCookStatus } from '../recipe-detail/RecipeCookbookRail';
import {
  getRecipeCookState,
  markRecipeCooked,
  RecipeCookStateResponse,
  resetRecipeCookState,
} from './recipeCookStateApi';

type CookStateStatus = 'idle' | 'loading' | 'saving' | 'error';

function getTodayCookedLabel(): string {
  return 'today';
}

function isToday(value: string): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function formatCookedLabel(lastCookedAt: string | null): string {
  if (!lastCookedAt) return '';
  if (isToday(lastCookedAt)) return getTodayCookedLabel();
  return lastCookedAt;
}

function serializeCookState(data: RecipeCookStateResponse): LocalCookStatus {
  const cookCount = Number(data?.cookCount || 0);

  return {
    cookedCount: Number.isFinite(cookCount) && cookCount > 0 ? cookCount : 0,
    lastCookedLabel: formatCookedLabel(data?.lastCookedAt || null),
  };
}

const EMPTY_COOK_STATUS: LocalCookStatus = {
  cookedCount: 0,
  lastCookedLabel: '',
};

export function useRecipeCookState(
  reelId: string,
  enabled: boolean
): {
  cookStatus: LocalCookStatus;
  status: CookStateStatus;
  markCooked: () => void;
  resetCookState: () => void;
} {
  const [cookStatus, setCookStatus] = useState<LocalCookStatus>(EMPTY_COOK_STATUS);
  const [status, setStatus] = useState<CookStateStatus>('idle');

  useEffect(() => {
    setCookStatus(EMPTY_COOK_STATUS);
    setStatus('idle');
  }, [reelId]);

  useEffect(() => {
    if (!reelId || !enabled) return;

    let cancelled = false;
    setStatus('loading');

    const loadCookState = async () => {
      try {
        const data = await getRecipeCookState(reelId);

        if (!cancelled) {
          setCookStatus(serializeCookState(data));
          setStatus('idle');
        }
      } catch (err) {
        console.warn('Recipe cook state load failed', err);
        if (!cancelled) {
          setStatus('error');
        }
      }
    };

    loadCookState();

    return () => {
      cancelled = true;
    };
  }, [reelId, enabled]);

  const markCooked = () => {
    if (!reelId || !enabled) return;

    const previous = cookStatus;

    setCookStatus((current) => ({
      cookedCount: current.cookedCount + 1,
      lastCookedLabel: getTodayCookedLabel(),
    }));
    setStatus('saving');

    markRecipeCooked(reelId)
      .then((data) => {
        setCookStatus(serializeCookState(data));
        setStatus('idle');
      })
      .catch((err) => {
        console.warn('Recipe mark cooked failed', err);
        setCookStatus(previous);
        setStatus('error');
      });
  };

  const resetCookState = () => {
    if (!reelId || !enabled) return;

    const previous = cookStatus;

    setCookStatus(EMPTY_COOK_STATUS);
    setStatus('saving');

    resetRecipeCookState(reelId)
      .then((data) => {
        setCookStatus(serializeCookState(data));
        setStatus('idle');
        window.dispatchEvent(
          new CustomEvent('recolekt:recipe-cook-session-reset', {
            detail: { reelId },
          })
        );
      })
      .catch((err) => {
        console.warn('Recipe cook state reset failed', err);
        setCookStatus(previous);
        setStatus('error');
      });
  };

  return {
    cookStatus,
    status,
    markCooked,
    resetCookState,
  };
}

export default useRecipeCookState;
