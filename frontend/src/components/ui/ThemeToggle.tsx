'use client';

import { useTheme } from '@/providers/ThemeProvider';
import { Sun, Moon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (btnRef.current) {
      gsap.fromTo(btnRef.current, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(2)' });
    }
  }, []);

  return (
    <button
      ref={btnRef}
      onClick={toggle}
      className={`p-2 rounded-full bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 shadow-lg hover:scale-110 transition-transform duration-300 ${className}`}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? <Sun size={16} className="text-amber-300" /> : <Moon size={16} className="text-indigo-600" />}
    </button>
  );
}
