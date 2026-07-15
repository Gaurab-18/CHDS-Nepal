'use client';

import { useState, useEffect, useRef } from 'react';
import NetworkBackground from '@/components/ui/NetworkBackground';
import HospitalSlide from '@/components/sections/HospitalSlide';
import CTASection from '@/components/sections/CTASection';


const HOSPITALS = [
  { id: 'bir', name: 'Bir Hospital', location: 'Kathmandu', established: 1889, stat: '500+ beds', description: 'Nepal\'s oldest hospital, serving the nation since the 19th century with comprehensive care and a legacy of medical excellence.', x: 78, y: 18 },
  { id: 'patan', name: 'Patan Hospital', location: 'Lalitpur', established: 1982, stat: '350+ beds', description: 'A leading public hospital providing affordable healthcare to millions across the Kathmandu valley.', x: 88, y: 48 },
  { id: 'tuth', name: 'T.U. Teaching Hospital', location: 'Kathmandu', established: 1983, stat: '700+ beds', description: 'Nepal\'s premier teaching hospital, training the next generation of physicians while delivering tertiary care.', x: 72, y: 78 },
  { id: 'grande', name: 'Grande International', location: 'Kathmandu', established: 2011, stat: '300+ beds', description: 'A modern multi-specialty hospital setting new standards for private healthcare in Nepal.', x: 28, y: 78 },
  { id: 'mediciti', name: 'Nepal Mediciti', location: 'Lalitpur', established: 2016, stat: '400+ beds', description: 'A state-of-the-art medical facility with advanced technology and internationally trained specialists.', x: 12, y: 42 },
  { id: 'norvic', name: 'Norvic Hospital', location: 'Kathmandu', established: 1994, stat: '200+ beds', description: 'A trusted name in Nepali healthcare, renowned for cardiac care and patient-centered services.', x: 28, y: 16 },
];

export default function Home() {
  const [activeIndex, setActiveIndex] = useState(-1);
  const sectionsRef = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            if (!isNaN(idx)) setActiveIndex(idx);
          }
        }
      },
      { threshold: 0.4 }
    );

    const els = sectionsRef.current.filter(Boolean);
    els.forEach((el) => observer.observe(el!));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative">
      <NetworkBackground
        nodes={HOSPITALS.map((h) => ({ id: h.id, x: h.x, y: h.y, name: h.name.split(' ')[0] }))}
        activeIndex={activeIndex}
      />

      <main className="relative z-10 w-full h-screen overflow-y-scroll snap-y snap-mandatory overscroll-none">
        {/* Hero */}
        <section ref={(el) => { sectionsRef.current[0] = el; }} data-index={-1} className="snap-start">
          <HospitalSlide
            name="CHDS Nepal"
            location=""
            established={0}
            description=""
            stat=""
            index={0}
            isHero
            tagline="Patient-mediated healthcare data sharing platform"
          />
        </section>

        {/* Hospital slides */}
        {HOSPITALS.map((h, i) => (
          <section
            key={h.id}
            ref={(el) => { sectionsRef.current[i + 1] = el; }}
            data-index={i}
            className="snap-start"
          >
            <HospitalSlide
              name={h.name}
              location={h.location}
              established={h.established}
              description={h.description}
              stat={h.stat}
              index={i + 1}
            />
          </section>
        ))}

        {/* CTA */}
        <section ref={(el) => { sectionsRef.current[HOSPITALS.length + 1] = el; }} data-index={-1} className="snap-start">
          <CTASection />
        </section>
      </main>
    </div>
  );
}
