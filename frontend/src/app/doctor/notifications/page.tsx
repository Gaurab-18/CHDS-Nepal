'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import Link from 'next/link';

export default function DoctorNotificationsPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/notifications', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unread_count);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!user || !hasRole('doctor')) { router.push('/login'); return; }
    load();
  }, [user, router, hasRole, load]);

  const handleMarkRead = async (id: string) => {
    await fetch(`/api/v1/notifications/${id}/read`, { method: 'PATCH', credentials: 'include' });
    load();
  };

  const handleMarkAllRead = async () => {
    await fetch('/api/v1/notifications/read-all', { method: 'POST', credentials: 'include' });
    load();
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{unreadCount} unread</p>
          </div>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500">
                Mark All Read
              </button>
            )}
            <button onClick={() => { logout(); router.push('/login'); }}
              className="text-xs text-red-600 dark:text-red-400">Sign Out</button>
          </div>
        </div>

        <Link href="/doctor/search" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline mb-6 inline-block">
          &larr; Back to search
        </Link>

        {notifications.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400">No notifications yet.</p>
        )}

        <div className="space-y-3 mt-4">
          {notifications.map((n: any) => (
            <div
              key={n.id}
              className={`p-4 rounded-lg border border-gray-200 dark:border-gray-800 border-l-4 ${!n.is_read ? 'border-l-emerald-500 ring-1 ring-emerald-500/20' : 'border-l-gray-400 dark:border-l-gray-600'}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />}
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{n.title}</h3>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{n.message}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
                {!n.is_read && (
                  <button
                    onClick={() => handleMarkRead(n.id)}
                    className="ml-4 text-xs px-3 py-1 rounded bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700 flex-shrink-0"
                  >
                    Mark Read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
