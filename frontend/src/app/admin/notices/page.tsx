'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import Link from 'next/link';

export default function AdminNoticesPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();
  const [notices, setNotices] = useState<any[]>([]);
  const [form, setForm] = useState({ title: '', message: '', target_role: 'all' });
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!user || !hasRole('admin')) { router.push('/login'); return; }
    loadNotices();
  }, [user, router, hasRole]);

  const loadNotices = async () => {
    try {
      const res = await fetch('/api/v1/admin/notices', { credentials: 'include' });
      if (res.ok) setNotices(await res.json());
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setMsg('');
    try {
      const res = await fetch('/api/v1/admin/notices', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(`Notice sent to ${data.message}`);
        setForm({ title: '', message: '', target_role: 'all' });
        loadNotices();
      } else {
        setMsg(data.error || 'Failed to send notice');
      }
    } catch {
      setMsg('Network error');
    }
    setSending(false);
  };

  const roleLabels: Record<string, string> = {
    all: 'All Users',
    patient: 'Patients Only',
    doctor: 'Doctors Only',
    admin: 'Admins Only',
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Send Notice</h1>
          <div className="flex items-center gap-3">
            <Link href="/admin/users" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">&larr; Back to Users</Link>
            <button onClick={() => { logout(); fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {}); router.push('/login'); }} className="text-xs text-red-600 dark:text-red-400 hover:text-red-500">Sign Out</button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mb-8 p-6 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 max-w-lg">
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Title</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required
                placeholder="Notice title"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Message</label>
              <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required rows={4}
                placeholder="Notice message..."
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Target</label>
              <select value={form.target_role} onChange={(e) => setForm({ ...form, target_role: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="all">All Users</option>
                <option value="patient">Patients Only</option>
                <option value="doctor">Doctors Only</option>
                <option value="admin">Admins Only</option>
              </select>
            </div>
            <button type="submit" disabled={sending}
              className="w-full py-2.5 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-500 disabled:opacity-50">
              {sending ? 'Sending...' : 'Send Notice'}
            </button>
            {msg && <p className={`text-xs ${msg.includes('sent to') ? 'text-emerald-500' : 'text-red-400'}`}>{msg}</p>}
          </div>
        </form>

        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Notice History</h2>
        {notices.length === 0 && <p className="text-gray-500 dark:text-gray-400">No notices sent yet.</p>}
        <div className="space-y-3">
          {notices.map((n: any) => (
            <div key={n.id} className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-4 border-l-purple-500">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{n.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{n.message}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400">
                      {roleLabels[n.target_role] || n.target_role}
                    </span>
                    <span className="text-xs text-gray-400">by {n.created_by_name || 'Unknown'}</span>
                    <span className="text-xs text-gray-400">{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
