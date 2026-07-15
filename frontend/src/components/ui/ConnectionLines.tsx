'use client';

import { forwardRef } from 'react';

interface ConnectionLinesProps {
  paths: { x1: number; y1: number; x2: number; y2: number }[];
  className?: string;
}

const ConnectionLines = forwardRef<SVGSVGElement, ConnectionLinesProps>(
  ({ paths, className = '' }, ref) => {
    if (!paths.length) return null;

    return (
      <svg
        ref={ref}
        className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="lineGlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#10b981" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.1" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {paths.map((p, i) => {
          const cx1 = p.x1 + (p.x2 - p.x1) * 0.3;
          const cy1 = p.y1;
          const cx2 = p.x2 - (p.x2 - p.x1) * 0.3;
          const cy2 = p.y2;

          return (
            <path
              key={i}
              d={`M${p.x1},${p.y1} C${cx1},${cy1} ${cx2},${cy2} ${p.x2},${p.y2}`}
              className="stroke-emerald-500/60 dark:stroke-emerald-400/50"
              strokeWidth="0.15"
              fill="none"
              filter="url(#glow)"
              strokeDasharray="100"
              strokeDashoffset="100"
            />
          );
        })}
      </svg>
    );
  }
);

ConnectionLines.displayName = 'ConnectionLines';

export default ConnectionLines;
