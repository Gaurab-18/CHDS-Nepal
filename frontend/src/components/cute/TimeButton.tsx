'use client';

import { useState } from 'react';
import ClockPopup from './ClockPopup';

export default function TimeButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-[9990] w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 shadow-lg transition-colors text-lg"
        title="Show clock"
      >
        🕐
      </button>
      {open && <ClockPopup onClose={() => setOpen(false)} />}
    </>
  );
}
