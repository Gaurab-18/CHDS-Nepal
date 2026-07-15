'use client';

import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useCounter } from '@/hooks/useCounter';
import { Building2, Users, Stethoscope, Activity } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const STATS_DATA = [
  { icon: <Building2 size={24} />, from: 0, to: 157, suffix: '+', label: 'Connected Hospitals' },
  { icon: <Users size={24} />, from: 0, to: 2.4, suffix: 'M+', label: 'Active Patients', decimals: 1 },
  { icon: <Stethoscope size={24} />, from: 0, to: 12500, suffix: '+', label: 'Registered Doctors', decimals: 0 },
  { icon: <Activity size={24} />, from: 0, to: 50000, suffix: '+', label: 'Daily Transactions', decimals: 0 },
];

function StatCard({ data, index }: { data: typeof STATS_DATA[0]; index: number }) {
  const { ref, displayValue } = useCounter({
    from: data.from,
    to: data.to,
    duration: 2.5,
    ease: 'power2.out',
    start: 'top 85%',
    suffix: data.suffix,
    decimals: data.decimals,
  });

  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 40 },
        {
          opacity: 1, y: 0, duration: 0.8, delay: index * 0.15, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' },
        }
      );
    }, el);
    return () => ctx.revert();
  }, [index]);

  return (
    <div
      ref={cardRef}
      className="text-center p-8 rounded-2xl bg-white/5 dark:bg-white/[0.03] border border-gray-100 dark:border-white/5 backdrop-blur-sm"
    >
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400 mb-5 mx-auto">
        {data.icon}
      </div>
      <div className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white tabular-nums">
        <span ref={ref}>{displayValue}</span>
      </div>
      <div className="mt-2 text-sm text-gray-500 dark:text-gray-400 font-medium">{data.label}</div>
    </div>
  );
}

export default function StatsSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const heading = section?.querySelector('.stats-heading');
    if (!heading || !section) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        heading,
        { opacity: 0, y: 30 },
        {
          opacity: 1, y: 0, duration: 0.8, ease: 'power3.out',
          scrollTrigger: { trigger: section, start: 'top 80%', toggleActions: 'play none none reverse' },
        }
      );
    }, section);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative py-32 md:py-40 px-6 overflow-hidden bg-gradient-to-b from-white to-gray-50 dark:from-gray-950 dark:to-gray-900"
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16 stats-heading">
          <span className="inline-block text-xs font-semibold tracking-[0.2em] uppercase text-emerald-600 dark:text-emerald-400 mb-4">
            Our Impact
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white leading-tight">
            Growing across{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-300">
              Nepal
            </span>
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {STATS_DATA.map((data, i) => (
            <StatCard key={i} data={data} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
