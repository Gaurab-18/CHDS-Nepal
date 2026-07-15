'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import Link from 'next/link';

export default function AdminNotificationsPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user || !hasRole('admin')) { router.push('/login'); return; }
    loadNotifications();
  }, [user, router, hasRole]);

  const loadNotifications = async () => {
    try {
      const res = await fetch('/api/v1/admin/notifications', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unread_count);
      }
    } catch {}
  };

  const handleMarkRead = async (id: string) => {
    try {
      await fetch(`/api/v1/admin/notifications/${id}/read`, { method: 'PATCH', credentials: 'include' });
      loadNotifications();
    } catch {}
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h1>
            {unreadCount > 0 && <p className="text-sm text-emerald-600 dark:text-emerald-400">{unreadCount} unread</p>}
          </div>
          <Link href="/admin/storage-requests" className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700">Storage</Link>
          <Link href="/admin/users" className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700">Back</Link>
          <button onClick={() => { logout(); fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {}); router.push('/login'); }} className="text-xs px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30">Sign Out</button>
        </div>
        {notifications.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No notifications.</p>
        ) : (
          <div className="space-y-2">
            {notifications.map((n: any) => (
              <div key={n.id} className={`p-4 rounded-lg border ${n.is_read ? 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800' : 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-900 dark:text-white font-semibold text-sm">{n.title}</p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{n.message}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                  {!n.is_read && (
                    <button onClick={() => handleMarkRead(n.id)} className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap">Mark read</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
