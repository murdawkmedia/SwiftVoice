import React from 'react';

interface StatsOverlayProps {
  wpm: number;
  accuracy: number;
  timeLeft: number;
  isDark: boolean;
}

const StatsOverlay: React.FC<StatsOverlayProps> = ({ wpm, accuracy, timeLeft, isDark }) => {
  const valueClass = isDark ? 'text-white' : 'text-gray-900';
  const labelClass = isDark ? 'text-gray-500' : 'text-gray-400';

  return (
    <div
      className="flex flex-wrap items-center gap-x-12 gap-y-4 justify-center mb-8"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center min-w-20">
        <span className={`text-xs font-semibold uppercase mb-1 transition-colors duration-300 ${labelClass}`}>Time</span>
        <span aria-label={`${timeLeft} seconds remaining`} className={`text-3xl font-light tabular-nums transition-colors duration-300 ${valueClass}`}>
          {timeLeft}s
        </span>
      </div>
      <div className="flex flex-col items-center min-w-20">
        <span className={`text-xs font-semibold uppercase mb-1 transition-colors duration-300 ${labelClass}`}>WPM</span>
        <span aria-label={`${Math.round(wpm)} words per minute`} className={`text-3xl font-light tabular-nums transition-colors duration-300 ${valueClass}`}>
          {Math.round(wpm)}
        </span>
      </div>
      <div className="flex flex-col items-center min-w-20">
        <span className={`text-xs font-semibold uppercase mb-1 transition-colors duration-300 ${labelClass}`}>Accuracy</span>
        <span aria-label={`${Math.round(accuracy)} percent accuracy`} className={`text-3xl font-light tabular-nums transition-colors duration-300 ${valueClass}`}>
          {Math.round(accuracy)}%
        </span>
      </div>
    </div>
  );
};

export default StatsOverlay;
