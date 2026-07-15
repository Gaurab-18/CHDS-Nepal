'use client';

import { ArrowRight } from 'lucide-react';

export default function CTASection() {
  return (
    <section className="relative w-full min-h-screen snap-center flex items-center justify-center px-6 md:px-12 lg:px-24">
      <div className="max-w-3xl w-full text-center">
        <span className="inline-block text-xs font-semibold tracking-[0.2em] uppercase text-emerald-500 dark:text-emerald-400 mb-4">
          Join the Network
        </span>

        <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold text-gray-900 dark:text-white leading-tight tracking-tight">
          Ready to transform{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-400">
            healthcare
          </span>
          ?
        </h2>

        <p className="mt-6 text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
          Connect your hospital to Nepal&apos;s healthcare network. Secure data sharing, patient-controlled consent, and seamless interoperability across all provinces.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-sm tracking-wide hover:bg-gray-800 dark:hover:bg-gray-100 transition-all duration-300 shadow-lg hover:shadow-xl"
          >
            Get Started
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </a>
        </div>

        <p className="mt-10 text-xs text-gray-400 dark:text-gray-500 leading-relaxed max-w-md mx-auto">
          Built for Nepali healthcare infrastructure. Patient-mediated, privacy-first, interoperable by design.
        </p>
      </div>
    </section>
  );
}
