'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';

export default function NotificationsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
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
    if (!user) { router.push('/login'); return; }
    load();
  }, [user, router, load]);

  const handleMarkRead = async (id: string) => {
    await fetch(`/api/v1/notifications/${id}/read`, { method: 'PATCH', credentials: 'include' });
    load();
  };

  const handleMarkAllRead = async () => {
    await fetch('/api/v1/notifications/read-all', { method: 'POST', credentials: 'include' });
    load();
  };

  const typeStyles: Record<string, string> = {
    storage_approved: 'border-l-emerald-500 bg-emerald-50 dark:bg-emerald-500/5',
    storage_rejected: 'border-l-red-500 bg-red-50 dark:bg-red-500/5',
    wipe_rejected: 'border-l-red-500 bg-red-50 dark:bg-red-500/5',
    emergency_override: 'border-l-amber-500 bg-amber-50 dark:bg-amber-500/5',
    password_reset: 'border-l-blue-500 bg-blue-50 dark:bg-blue-500/5',
    admin_notice: 'border-l-purple-500 bg-purple-50 dark:bg-purple-500/5',
    general: 'border-l-gray-500 bg-gray-50 dark:bg-gray-500/5',
  };

  const typeIcons: Record<string, string> = {
    storage_approved: '✓',
    storage_rejected: '✗',
    wipe_rejected: '✗',
    emergency_override: '⚠',
    password_reset: '🔑',
    admin_notice: '📢',
    general: '●',
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex pt-8">
      <aside className="w-64 border-r border-gray-200 dark:border-gray-800 p-6 flex flex-col gap-1">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">CHDS</h2>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-left px-3 py-2 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
        >
          ← Back to Dashboard
        </button>
        <div className="mt-auto pt-6 border-t border-gray-200 dark:border-gray-800">
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{user.email}</p>
          <button
            onClick={() => { logout(); router.push('/login'); }}
            className="mt-2 text-xs text-red-600 dark:text-red-400 hover:text-red-500"
          >
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{unreadCount} unread</p>
          </div>
          {unreadCount > 0 && (
            <button onClick={handleMarkAllRead}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500">
              Mark All Read
            </button>
          )}
        </div>

        {notifications.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400">No notifications yet.</p>
        )}

        <div className="space-y-3 max-w-2xl">
          {notifications.map((n: any) => {
            const style = typeStyles[n.type] || typeStyles.general;
            const icon = typeIcons[n.type] || typeIcons.general;
            return (
              <div
                key={n.id}
                className={`p-4 rounded-lg border border-gray-200 dark:border-gray-800 border-l-4 ${style} ${!n.is_read ? 'ring-1 ring-emerald-500/20' : ''}`}
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
            );
          })}
        </div>
      </main>
    </div>
  );
}
