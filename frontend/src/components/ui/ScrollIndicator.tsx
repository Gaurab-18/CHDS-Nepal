'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function ScrollIndicator() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    gsap.to(ref.current, {
      y: 8,
      opacity: 0.4,
      duration: 1.5,
      repeat: -1,
      yoyo: true,
      ease: 'power2.inOut',
    });
  }, []);

  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
      <span className="text-xs tracking-widest uppercase font-medium">Scroll</span>
      <div ref={ref} className="w-5 h-8 rounded-full border-2 border-current flex items-start justify-center p-1">
        <div className="w-1.5 h-1.5 rounded-full bg-current" />
      </div>
    </div>
  );
}
