'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function AccessDeniedPage() {
  useEffect(() => { document.documentElement.classList.add('dark'); }, []);

  return (
    <div className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-gray-950 px-4">
      <div style={{ width: 420, height: 420 }}>
        <dotlottie-wc
          src="https://lottie.host/5abc427f-4494-479a-8d95-ec54555489c3/Wi3NqNpGfQ.lottie"
          autoplay
          loop
          style={{ width: '420px', height: '420px' }}
        />
      </div>
      <h1 className="mt-4 text-2xl font-bold text-white text-center">Access Denied</h1>
      <p className="mt-2 text-gray-400 text-center max-w-md">
        You do not have permission to view this resource. Your access attempt has been recorded.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-gray-900 font-semibold text-sm hover:bg-gray-100 transition-all"
      >
        Go to Dashboard
      </Link>
      <Link
        href="/"
        className="mt-3 inline-flex items-center gap-2 px-6 py-3 rounded-lg text-gray-400 font-semibold text-sm hover:text-white transition-all"
      >
        Go Home
      </Link>
    </div>
  );
}
