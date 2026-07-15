'use client';

import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface ScrollRevealOptions {
  from?: gsap.TweenVars;
  to?: gsap.TweenVars;
  trigger?: gsap.DOMTarget;
  start?: string;
  end?: string;
  scrub?: boolean | number;
  markers?: boolean;
  toggleActions?: string;
  delay?: number;
  duration?: number;
  ease?: string;
  disabled?: boolean;
}

export function useScrollReveal<T extends HTMLElement>(options: ScrollRevealOptions = {}) {
  const ref = useRef<T>(null!);
  const animationRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (options.disabled || !ref.current) return;

    const ctx = gsap.context(() => {
      animationRef.current = gsap.fromTo(
        ref.current,
        { opacity: 0, y: 40, ...options.from },
        {
          opacity: 1,
          y: 0,
          duration: options.duration ?? 1.2,
          ease: options.ease ?? 'power3.out',
          scrollTrigger: {
            trigger: options.trigger || ref.current,
            start: options.start ?? 'top 85%',
            end: options.end ?? 'top 40%',
            scrub: options.scrub ?? false,
            toggleActions: options.toggleActions ?? 'play none none reverse',
          },
          ...options.to,
        }
      );
    }, ref);

    return () => ctx.revert();
  }, []);

  return ref;
}
