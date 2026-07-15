'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-gray-950">
      <div style={{ width: 300, height: 300 }}>
        <dotlottie-wc
          src="https://lottie.host/bccd1ef1-08a9-4347-a1f2-ad4b582f3dac/JNrEasMGSI.lottie"
          autoplay
          loop
          style={{ width: '300px', height: '300px' }}
        />
      </div>
      <h1 className="mt-4 text-2xl font-bold text-white">Page not found</h1>
      <p className="mt-2 text-gray-400">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-gray-900 font-semibold text-sm hover:bg-gray-100 transition-all"
      >
        Go Home
      </Link>
    </div>
  );
}
