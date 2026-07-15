'use client';

import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface ParallaxOptions {
  speed?: number;
  direction?: 'vertical' | 'horizontal';
  start?: string;
  end?: string;
  scrub?: number;
}

export function useParallax<T extends HTMLElement>(options: ParallaxOptions = {}) {
  const ref = useRef<T>(null!);
  const { speed = 0.3, direction = 'vertical', start = 'top bottom', end = 'bottom top', scrub = 1 } = options;

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ref.current,
        direction === 'vertical' ? { y: `${speed * 100}px` } : { x: `${speed * 100}px` },
        {
          ...(direction === 'vertical' ? { y: `-${speed * 100}px` } : { x: `-${speed * 100}px` }),
          ease: 'none',
          scrollTrigger: {
            trigger: ref.current,
            start,
            end,
            scrub,
            invalidateOnRefresh: true,
          },
        }
      );
    }, ref);

    return () => ctx.revert();
  }, [speed, direction, start, end, scrub]);

  return ref;
}
