'use client';
import { useEffect, useState } from 'react';

export default function ServiceStatusBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    fetch('/api/v1/health', { signal: controller.signal })
      .then((r) => { if (!r.ok) setOffline(true); })
      .catch(() => setOffline(true))
      .finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-600/90 text-white px-4 py-2 text-sm text-center font-medium">
      CHDS is currently offline. Your last known consents are shown below. For urgent records contact your hospital directly.
    </div>
  );
}
