'use client';

import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface CounterOptions {
  from?: number;
  to: number;
  duration?: number;
  ease?: string;
  trigger?: gsap.DOMTarget;
  start?: string;
  suffix?: string;
  prefix?: string;
  decimals?: number;
}

export function useCounter(options: CounterOptions) {
  const { from = 0, to, duration = 2, ease = 'power2.out', start = 'top 85%', suffix = '', prefix = '', decimals = 0 } = options;
  const [displayValue, setDisplayValue] = useState(from);
  const ref = useRef<HTMLSpanElement>(null!);
  const animated = useRef(false);

  useEffect(() => {
    if (animated.current) return;
    animated.current = true;

    const obj = { val: from };

    const ctx = gsap.context(() => {
      gsap.to(obj, {
        val: to,
        duration,
        ease,
        onUpdate: () => {
          setDisplayValue(obj.val);
        },
        scrollTrigger: {
          trigger: ref.current.parentElement || ref.current,
          start,
          toggleActions: 'play none none none',
        },
      });
    }, ref);

    return () => ctx.revert();
  }, [to, duration, ease, start]);

  return { ref, displayValue: `${prefix}${displayValue.toFixed(decimals)}${suffix}` };
}
