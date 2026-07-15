'use client';

import { useRef, useEffect } from 'react';
import { MapPin, Calendar, Building2 } from 'lucide-react';

interface HospitalSlideProps {
  name: string;
  location: string;
  established: number;
  description: string;
  stat: string;
  index: number;
  isHero?: boolean;
  tagline?: string;
}

export default function HospitalSlide({
  name, location, established, description, stat, index, isHero, tagline,
}: HospitalSlideProps) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <section
      id={isHero ? 'hero' : `hospital-${index}`}
      className="relative w-full min-h-screen snap-center flex items-center justify-center px-6 md:px-12 lg:px-24"
    >
      <div className="max-w-3xl w-full">
        {isHero ? (
          <div className="text-center md:text-left">
            <span className="inline-block text-xs font-semibold tracking-[0.2em] uppercase text-emerald-500 dark:text-emerald-400 mb-4">
              CHDS Nepal
            </span>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-gray-900 dark:text-white leading-none tracking-tight">
              Connecting
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-400">
                Nepali Healthcare
              </span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-gray-500 dark:text-gray-400 max-w-xl leading-relaxed">
              A patient-mediated data sharing platform uniting hospitals across Nepal for seamless, secure healthcare.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-start gap-4">
              <a
                href="#hospital-1"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-sm tracking-wide hover:bg-gray-800 dark:hover:bg-gray-100 transition-all duration-300 shadow-lg"
              >
                Explore Network
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </a>
              <a
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-emerald-500 text-emerald-500 font-semibold text-sm tracking-wide hover:bg-emerald-500 hover:text-white transition-all duration-300 shadow-lg"
              >
                Sign In
              </a>
              <a
                href="/register"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-gray-400 text-gray-500 dark:text-gray-400 font-semibold text-sm tracking-wide hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-300 shadow-lg"
              >
                Register
              </a>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-[1fr_auto] gap-8 md:gap-12 items-start">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-4xl md:text-5xl font-bold text-emerald-500/30 dark:text-emerald-400/20 tabular-nums">
                  {String(index).padStart(2, '0')}
                </span>
              </div>
              <h2 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white leading-tight tracking-tight">
                {name}
              </h2>
              <div className="flex flex-wrap gap-3 mt-4">
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <MapPin size={12} />
                  {location}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <Calendar size={12} />
                  Est. {established}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  <Building2 size={12} />
                  {stat}
                </span>
              </div>
              <p className="mt-5 text-base leading-relaxed text-gray-600 dark:text-gray-300 max-w-lg">
                {description}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
