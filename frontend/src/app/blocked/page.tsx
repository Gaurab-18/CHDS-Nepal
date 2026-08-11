'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function BlockedContent() {
  const searchParams = useSearchParams();
  const blockId = searchParams.get('blockId');
  const [copied, setCopied] = useState(false);

  const copyRef = () => {
    if (blockId) {
      navigator.clipboard.writeText(blockId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
      <h1 className="mt-4 text-2xl font-bold text-white text-center">Account Under Review</h1>
      <p className="mt-2 text-gray-400 text-center max-w-md">
        Your access has been temporarily restricted due to suspicious activity.
        An administrator has been notified and will review your case shortly.
      </p>
      <div className="mt-6 flex flex-col items-center gap-2">
        {blockId && (
          <button
            onClick={copyRef}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {copied ? 'Reference ID copied!' : `Reference: ${blockId.slice(0, 8)}... (click to copy)`}
          </button>
        )}
        <p className="text-xs text-gray-600 mt-4">
          If you believe this is a mistake, please contact your system administrator.
        </p>
      </div>
    </div>
  );
}

export default function BlockedPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-gray-950">
        <p className="text-gray-400">Loading...</p>
      </div>
    }>
      <BlockedContent />
    </Suspense>
  );
}
