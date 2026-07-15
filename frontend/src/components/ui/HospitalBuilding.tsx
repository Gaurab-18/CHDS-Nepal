'use client';

import { forwardRef } from 'react';

interface HospitalBuildingProps {
  variant?: 'small' | 'main';
  className?: string;
  style?: React.CSSProperties;
}

const HospitalBuilding = forwardRef<HTMLDivElement, HospitalBuildingProps>(
  ({ variant = 'small', className = '', style }, ref) => {
    const isMain = variant === 'main';
    const size = isMain ? 160 : 80;

    return (
      <div
        ref={ref}
        className={`absolute flex items-center justify-center ${className}`}
        style={{ width: size, height: size * 1.25, ...style }}
      >
        <svg
          viewBox="0 0 120 150"
          className={isMain ? 'w-40 h-50' : 'w-20 h-25'}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id={`buildBody${isMain ? 'M' : 'S'}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.95" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.75" />
            </linearGradient>
            <linearGradient id={`glass${isMain ? 'M' : 'S'}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.15" />
            </linearGradient>
            <filter id={`shadow${isMain ? 'M' : 'S'}`}>
              <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="currentColor" floodOpacity="0.15" />
            </filter>
          </defs>

          {/* Base shadow */}
          <rect x="10" y="130" width="100" height="6" rx="3" className="fill-black/10 dark:fill-black/30" />

          {/* Main building body */}
          <rect
            x="15" y="35" width="90" height="100" rx="4"
            className="text-gray-100 dark:text-slate-700"
            fill={`url(#buildBody${isMain ? 'M' : 'S'})`}
            filter={`url(#shadow${isMain ? 'M' : 'S'})`}
          />

          {/* Building outline */}
          <rect x="15" y="35" width="90" height="100" rx="4"
            stroke="currentColor" strokeWidth="1"
            className="text-gray-300 dark:text-slate-500" />

          {/* Roof line */}
          <rect x="15" y="35" width="90" height="4" rx="1"
            className="fill-emerald-500/40 dark:fill-emerald-400/30" />

          {/* Medical cross - vertical */}
          <rect x="53" y="12" width="14" height="30" rx="3"
            className="fill-emerald-500 dark:fill-emerald-400"
            filter={`url(#shadow${isMain ? 'M' : 'S'})`} />
          {/* Medical cross - horizontal */}
          <rect x="43" y="20" width="34" height="12" rx="3"
            className="fill-emerald-500 dark:fill-emerald-400" />
          {/* Cross glow */}
          <rect x="53" y="12" width="14" height="30" rx="3"
            className="fill-emerald-300/30 dark:fill-emerald-400/20 blur-sm" />

          {/* Windows row 1 */}
          {[0, 1, 2].map((col) => (
            <rect key={`w1-${col}`} x={24 + col * 26} y="48" width="16" height="14" rx="2"
              className="fill-sky-200/70 dark:fill-sky-300/30" />
          ))}

          {/* Windows row 2 */}
          {[0, 1, 2].map((col) => (
            <rect key={`w2-${col}`} x={24 + col * 26} y="70" width="16" height="14" rx="2"
              className="fill-sky-200/70 dark:fill-sky-300/30" />
          ))}

          {/* Main hospital has extra rows */}
          {isMain && [0, 1].map((row) => (
            [0, 1, 2].map((col) => (
              <rect key={`w3-${row}-${col}`} x={24 + col * 26} y={92 + row * 22} width="16" height="14" rx="2"
                className="fill-sky-200/70 dark:fill-sky-300/30" />
            ))
          ))}

          {/* Glass highlight overlay */}
          <rect x="20" y="44" width="80" height="85" rx="3"
            fill={`url(#glass${isMain ? 'M' : 'S'})`} />

          {/* Entrance door */}
          <rect x="48" y={isMain ? 115 : 100} width="24" height={isMain ? 20 : 35} rx="2"
            className="fill-gray-400/50 dark:fill-gray-600/50" />
          <rect x="52" y={isMain ? 118 : 103} width="16" height="14" rx="1.5"
            className="fill-amber-200/60 dark:fill-amber-300/20" />

          {/* Entrance arch for main */}
          {isMain && (
            <path d="M48,115 Q60,105 72,115"
              className="stroke-emerald-500/40 dark:stroke-emerald-400/30" strokeWidth="1.5" fill="none" />
          )}

          {/* Ground line */}
          <line x1="5" y1="135" x2="115" y2="135"
            stroke="currentColor" strokeWidth="1"
            className="text-gray-300 dark:text-slate-600" strokeDasharray="4 3" />
        </svg>
      </div>
    );
  }
);

HospitalBuilding.displayName = 'HospitalBuilding';

export default HospitalBuilding;
