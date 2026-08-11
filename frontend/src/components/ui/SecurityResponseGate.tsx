'use client';

import { useEffect } from 'react';

export default function SecurityResponseGate() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
      const isAuthUrl = url.includes('/api/v1/auth/');
      const loggedIn = !!localStorage.getItem('chds-user');

      // Session expired → 401 on any authenticated (non-login) API call
      if (res.status === 401 && !isAuthUrl && loggedIn) {
        window.location.href = '/session-expired';
        return res;
      }

      // Access denied → 403 on any authenticated (non-login) API call
      if (res.status === 403 && !isAuthUrl && loggedIn) {
        window.location.href = '/access-denied';
        return res;
      }

      // Hacking detected → blocked upload (400 with security message)
      if (res.status === 400 && url.includes('records/upload')) {
        res
          .clone()
          .json()
          .then((d: any) => {
            const msg: string = d?.error || '';
            if (/not allowed|security reasons|blocked|extension/i.test(msg)) {
              window.location.href = '/hacking-detected';
            }
          })
          .catch(() => {});
      }

      return res;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
