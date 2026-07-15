'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const IDLE_TIMEOUT = 15 * 60 * 1000;
const WARNING_BEFORE = 60 * 1000;

export default function IdleTimer() {
  const router = useRouter();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const countdownRef = useRef<ReturnType<typeof setInterval>>();

  const resetTimer = useCallback(() => {
    if (showWarning) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowWarning(true), IDLE_TIMEOUT - WARNING_BEFORE);
  }, [showWarning]);

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  useEffect(() => {
    if (!showWarning) return;
    setCountdown(60);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(countdownRef.current);
          fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
          localStorage.removeItem('chds-user');
          router.push('/login');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [showWarning, router]);

  const stayLoggedIn = () => {
    clearInterval(countdownRef.current);
    setShowWarning(false);
    resetTimer();
  };

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl text-center">
        <div className="relative w-20 h-20 mx-auto mb-4">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r="30" fill="none" stroke="#374151" strokeWidth="6" />
            <circle cx="36" cy="36" r="30" fill="none" stroke="#10b981" strokeWidth="6" strokeDasharray={`${(countdown / 60) * 188.5} 188.5`} strokeLinecap="round" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-white">{countdown}</span>
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Session expiring</h2>
        <p className="text-gray-400 text-sm mb-6">Your session is about to expire due to inactivity.</p>
        <button onClick={stayLoggedIn} className="w-full py-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-500">
          Stay logged in
        </button>
      </div>
    </div>
  );
}
