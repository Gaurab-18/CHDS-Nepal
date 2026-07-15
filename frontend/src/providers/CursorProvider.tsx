'use client';

import { createContext, useContext, useState, useEffect } from 'react';

export type CursorType = 'ambulance' | 'canvas' | 'none';

interface CursorContextValue {
  cursorType: CursorType;
  setCursorType: (t: CursorType) => void;
}

const CursorContext = createContext<CursorContextValue>({
  cursorType: 'ambulance',
  setCursorType: () => {},
});

export function useCursor() {
  return useContext(CursorContext);
}

const STORAGE_KEY = 'chds_cursor_type';

export default function CursorProvider({ children }: { children: React.ReactNode }) {
  const [cursorType, setCursorTypeState] = useState<CursorType>('ambulance');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'canvas' || stored === 'none' || stored === 'ambulance') {
      setCursorTypeState(stored);
    }
    setMounted(true);
  }, []);

  const setCursorType = (t: CursorType) => {
    setCursorTypeState(t);
    localStorage.setItem(STORAGE_KEY, t);
  };

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <CursorContext.Provider value={{ cursorType, setCursorType }}>
      {children}
    </CursorContext.Provider>
  );
}
