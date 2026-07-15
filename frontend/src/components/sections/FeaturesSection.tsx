'use client';

import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Activity, Shield, Zap, Globe } from 'lucide-react';
import MedicalCard from '@/components/ui/MedicalCard';
import { useParallax } from '@/hooks/useParallax';

gsap.registerPlugin(ScrollTrigger);

const FEATURES = [
  {
    icon: <Activity size={22} />,
    title: 'Seamless Records',
    description: 'Access and share medical records across hospitals with patient-controlled consent, ensuring data follows you wherever you go.',
    gradient: 'from-emerald-500/20 to-teal-500/10',
  },
  {
    icon: <Shield size={22} />,
    title: 'Privacy First',
    description: 'End-to-end encryption and granular consent controls put you in charge of who sees your health data and when.',
    gradient: 'from-blue-500/20 to-indigo-500/10',
  },
  {
    icon: <Zap size={22} />,
    title: 'Real-time Updates',
    description: 'Instant notifications when your records are accessed, prescriptions are updated, or new test results become available.',
    gradient: 'from-amber-500/20 to-orange-500/10',
  },
  {
    icon: <Globe size={22} />,
    title: 'Nationwide Network',
    description: 'Connected hospitals across all provinces of Nepal, creating a unified healthcare ecosystem for better patient outcomes.',
    gradient: 'from-violet-500/20 to-purple-500/10',
  },
];

export default function FeaturesSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const bgRef = useParallax<HTMLDivElement>({ speed: 0.15, start: 'top bottom', end: 'bottom top' });

  useEffect(() => {
    const ctx = gsap.context(() => {
      const cards = cardsRef.current.filter(Boolean);

      gsap.fromTo(
        headingRef.current,
        { opacity: 0, y: 40 },
        {
          opacity: 1, y: 0, duration: 1, ease: 'power3.out',
          scrollTrigger: { trigger: sectionRef.current, start: 'top 80%', toggleActions: 'play none none reverse' },
        }
      );

      gsap.fromTo(
        cards,
        { opacity: 0, y: 60, scale: 0.95 },
        {
          opacity: 1, y: 0, scale: 1, stagger: 0.15, duration: 0.9, ease: 'power3.out',
          scrollTrigger: {
            trigger: sectionRef.current, start: 'top 70%', end: 'top 30%', scrub: 1,
          },
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative py-32 md:py-44 px-6 overflow-hidden bg-white dark:bg-gray-950"
    >
      {/* Parallax background ornament */}
      <div
        ref={bgRef}
        className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-emerald-500/5 to-teal-500/5 dark:from-emerald-500/10 dark:to-teal-500/5 blur-3xl"
      />

      <div className="max-w-6xl mx-auto">
        <div ref={headingRef}>
          <span className="inline-block text-xs font-semibold tracking-[0.2em] uppercase text-emerald-600 dark:text-emerald-400 mb-4">
            Platform Features
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white leading-tight">
            Everything you need for{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-300">
              better healthcare
            </span>
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg max-w-2xl">
            CHDS Nepal connects patients, doctors, and hospitals in a secure, privacy-respecting ecosystem.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-16">
          {FEATURES.map((f, i) => (
            <MedicalCard
              key={i}
              ref={(el) => { cardsRef.current[i] = el; }}
              icon={f.icon}
              title={f.title}
              description={f.description}
              gradient={f.gradient}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
