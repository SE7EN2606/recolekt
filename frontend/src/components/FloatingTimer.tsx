import React from 'react';
import { Clock, GripVertical, Pause, Play, RotateCcw } from 'lucide-react';
import { useTimer } from '../context/TimerContext';

const DEFAULT_GLOBAL_POSITION = { x: 18, y: 96 };
const DEFAULT_COOK_MODE_POSITION = { x: 24, y: 104 };

export const FloatingTimer: React.FC<{ variant?: 'global' | 'cookMode' }> = ({ variant = 'global' }) => {
  const { timerSeconds, isTimerRunning, startTimer, pauseTimer, resetTimer, formatTime, cookModeOpen } = useTimer();
  const [position, setPosition] = React.useState(
    variant === 'cookMode' ? DEFAULT_COOK_MODE_POSITION : DEFAULT_GLOBAL_POSITION
  );
  const dragRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  if (variant === 'global' && cookModeOpen) return null;
  if (variant === 'global' && !isTimerRunning && timerSeconds <= 0) return null;

  const clamp = (x: number, y: number) => {
    if (typeof window === 'undefined') return { x, y };
    return {
      x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - 224)),
      y: Math.min(Math.max(72, y), Math.max(72, window.innerHeight - 124)),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(clamp(drag.originX - (event.clientX - drag.startX), drag.originY - (event.clientY - drag.startY)));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  return (
    <div
      className={`fixed touch-none select-none rounded-2xl border border-slate-700/70 bg-slate-900/95 p-2 text-white shadow-2xl shadow-slate-950/40 backdrop-blur ${
        variant === 'cookMode' ? 'z-[10001]' : 'z-[9998]'
      }`}
      style={{ right: position.x, bottom: position.y }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="timer"
      aria-label={`Cooking timer ${formatTime(timerSeconds)}`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-5 cursor-grab items-center justify-center rounded-lg text-white/35 active:cursor-grabbing">
          <GripVertical size={16} />
        </span>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
          <Clock size={17} />
        </span>
        <span className="min-w-[72px]">
          <span className="block text-[10px] font-black uppercase tracking-widest text-white/40">
            Cooking Time
          </span>
          <span className="block font-mono text-lg font-black tabular-nums leading-tight">
            {formatTime(timerSeconds)}
          </span>
        </span>
        <button
          type="button"
          onClick={isTimerRunning ? pauseTimer : startTimer}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-950 transition-colors hover:bg-emerald-50"
          aria-label={isTimerRunning ? 'Pause timer' : 'Start timer'}
        >
          {isTimerRunning ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button
          type="button"
          onClick={resetTimer}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white/80 transition-colors hover:bg-white/15"
          aria-label="Reset timer"
        >
          <RotateCcw size={15} />
        </button>
      </div>
    </div>
  );
};

export default FloatingTimer;
