'use client';

import { forwardRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MedicalCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  gradient?: string;
  className?: string;
  style?: React.CSSProperties;
}

const MedicalCard = forwardRef<HTMLDivElement, MedicalCardProps>(
  ({ icon, title, description, gradient = 'from-emerald-500/20 to-teal-500/10', className, style }, ref) => {
    return (
      <div
        ref={ref}
        style={style}
        className={cn(
          'group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 md:p-8 shadow-xl transition-all duration-500 hover:shadow-2xl hover:scale-[1.02]',
          'dark:bg-white/5 dark:border-white/10',
          'bg-white/70 border-gray-200/50',
          className
        )}
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-60 dark:opacity-40`} />
        <div className="relative z-10">
          <div className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400">
            {icon}
          </div>
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">{title}</h3>
          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{description}</p>
        </div>
      </div>
    );
  }
);

MedicalCard.displayName = 'MedicalCard';

export default MedicalCard;
