import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type TimerContextValue = {
  timerSeconds: number;
  isTimerRunning: boolean;
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  formatTime: (seconds?: number) => string;
  cookModeOpen: boolean;
  setCookModeOpen: (open: boolean) => void;
};

const TimerContext = createContext<TimerContextValue | null>(null);

export function formatTimerTime(seconds = 0) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;

  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export const TimerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [cookModeOpen, setCookModeOpen] = useState(false);

  useEffect(() => {
    if (!isTimerRunning) return;

    const intervalId = window.setInterval(() => {
      setTimerSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isTimerRunning]);

  const startTimer = useCallback(() => setIsTimerRunning(true), []);
  const pauseTimer = useCallback(() => setIsTimerRunning(false), []);
  const resetTimer = useCallback(() => {
    setIsTimerRunning(false);
    setTimerSeconds(0);
  }, []);

  const value = useMemo(
    () => ({
      timerSeconds,
      isTimerRunning,
      startTimer,
      pauseTimer,
      resetTimer,
      formatTime: formatTimerTime,
      cookModeOpen,
      setCookModeOpen,
    }),
    [cookModeOpen, isTimerRunning, pauseTimer, resetTimer, startTimer, timerSeconds]
  );

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
};

export function useTimer() {
  const context = useContext(TimerContext);
  if (!context) {
    throw new Error('useTimer must be used within TimerProvider');
  }
  return context;
}
