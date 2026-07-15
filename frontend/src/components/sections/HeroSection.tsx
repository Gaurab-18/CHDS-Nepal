'use client';

import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import HospitalBuilding from '@/components/ui/HospitalBuilding';
import ConnectionLines from '@/components/ui/ConnectionLines';
import ScrollIndicator from '@/components/ui/ScrollIndicator';

gsap.registerPlugin(ScrollTrigger);

const HOSPITAL_POSITIONS = [
  { x: '12%', y: '18%', variant: 'small' as const },
  { x: '82%', y: '12%', variant: 'small' as const },
  { x: '8%', y: '52%', variant: 'small' as const },
  { x: '88%', y: '58%', variant: 'small' as const },
  { x: '18%', y: '78%', variant: 'small' as const },
  { x: '78%', y: '82%', variant: 'small' as const },
  { x: '50%', y: '5%', variant: 'small' as const },
];

const LINE_PATHS = [
  { x1: 12, y1: 23, x2: 50, y2: 42 },
  { x1: 82, y1: 18, x2: 50, y2: 42 },
  { x1: 8, y1: 52, x2: 50, y2: 42 },
  { x1: 88, y1: 58, x2: 50, y2: 42 },
  { x1: 18, y1: 78, x2: 50, y2: 42 },
  { x1: 78, y1: 82, x2: 50, y2: 42 },
  { x1: 50, y1: 10, x2: 50, y2: 42 },
];

export default function HeroSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mainHospitalRef = useRef<HTMLDivElement>(null);
  const hospitalRefs = useRef<(HTMLDivElement | null)[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const wrapper = wrapperRef.current;
    const hospitals = hospitalRefs.current.filter(Boolean);
    const lines = svgRef.current?.querySelectorAll('path');
    if (!section || !wrapper || !hospitals.length || !lines?.length) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          pin: true,
          start: 'top top',
          end: '+=280%',
          scrub: 1.2,
          invalidateOnRefresh: true,
        },
      });

      tl.fromTo(
        hospitals,
        { opacity: 0, scale: 0.6, y: (i) => (i < 2 ? -40 : i > 4 ? 40 : 0) },
        { opacity: 1, scale: 1, y: 0, stagger: 0.12, duration: 0.8, ease: 'power3.out' },
        0
      );

      tl.fromTo(
        mainHospitalRef.current,
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.8, ease: 'back.out(2)' },
        0.15
      );

      tl.to(lines, {
        strokeDashoffset: 0,
        duration: 1.5,
        stagger: { each: 0.08, from: 'edges' },
        ease: 'power2.inOut',
      }, 0.25);

      tl.to(wrapper, { scale: 1.25, duration: 2, ease: 'power2.inOut' }, 0.5);

      tl.fromTo(
        textRef.current,
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 1, ease: 'power3.out' },
        0.7
      );

      tl.fromTo(
        subtitleRef.current,
        { opacity: 0, y: 20 },
        { opacity: 0.7, y: 0, duration: 0.8, ease: 'power2.out' },
        0.85
      );

      tl.fromTo(
        badgeRef.current,
        { opacity: 0, scale: 0.9 },
        { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(2)' },
        0.9
      );
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative w-full h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50 dark:from-slate-950 dark:via-gray-900 dark:to-emerald-950"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.06)_0%,transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.08)_0%,transparent_70%)]" />

      <div
        ref={wrapperRef}
        className="relative w-full h-full flex items-center justify-center"
        style={{ transformOrigin: '50% 42%' }}
      >
        <ConnectionLines ref={svgRef} paths={LINE_PATHS} className="z-10" />

        {HOSPITAL_POSITIONS.map((pos, i) => (
          <HospitalBuilding
            key={i}
            ref={(el) => { hospitalRefs.current[i] = el; }}
            variant={pos.variant}
            className="z-20"
            style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' }}
          />
        ))}

        <HospitalBuilding
          ref={mainHospitalRef}
          variant="main"
          className="z-30"
          style={{ left: '50%', top: '42%', transform: 'translate(-50%, -50%)' }}
        />

        <div
          ref={textRef}
          className="absolute z-40 text-center"
          style={{ bottom: '18%', left: '50%', transform: 'translateX(-50%)' }}
        >
          <div
            ref={badgeRef}
            className="inline-flex items-center gap-2 px-4 py-1.5 mb-5 rounded-full text-xs font-medium tracking-wide uppercase
              bg-emerald-100/80 text-emerald-800
              dark:bg-emerald-900/40 dark:text-emerald-300
              border border-emerald-200/50 dark:border-emerald-700/30"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Healthcare Network
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight text-gray-900 dark:text-white leading-none">
            CHDS{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-300">
              Nepal
            </span>
          </h1>

          <p
            ref={subtitleRef}
            className="mt-4 text-lg md:text-xl text-gray-500 dark:text-gray-400 max-w-xl mx-auto leading-relaxed"
          >
            Patient-mediated healthcare data sharing platform connecting hospitals across Nepal
          </p>
        </div>
      </div>

      <ScrollIndicator />
    </section>
  );
}
