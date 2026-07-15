'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import Link from 'next/link';

export default function AdminAuditPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();
  const [entries, setEntries] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!user || !hasRole('admin')) { router.push('/login'); return; }
    loadEntries();
  }, [user, router, page, hasRole]);

  const loadEntries = async () => {
    try {
      const res = await fetch(`/api/v1/admin/audit-log?page=${page}&limit=50`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries);
        setTotal(data.total);
      }
    } catch {}
  };

  const filtered = filter ? entries.filter((e: any) =>
    (e.action || '').toLowerCase().includes(filter.toLowerCase()) ||
    (e.username || '').toLowerCase().includes(filter.toLowerCase())
  ) : entries;

  const exportCSV = () => {
    const header = 'Timestamp,Action,Actor,Email,IP,Details\n';
    const rows = entries.map((e: any) =>
      `"${e.timestamp}","${e.action}","${e.username || ''}","${e.email || ''}","${e.ip_address || ''}","${(e.override_reason || '').replace(/"/g, '""')}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'admin-audit-log.csv';
    a.click();
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Log</h1>
          <div className="flex gap-2">
            <button onClick={exportCSV} className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs hover:bg-gray-300 dark:hover:bg-gray-700">Export CSV</button>
            <Link href="/admin/storage-requests" className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs hover:bg-gray-300 dark:hover:bg-gray-700">Storage</Link>
            <Link href="/admin/users" className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs hover:bg-gray-300 dark:hover:bg-gray-700">Back</Link>
            <button onClick={() => { logout(); fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {}); router.push('/login'); }} className="px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 text-xs hover:bg-red-600/30">Sign Out</button>
          </div>
        </div>
        <input type="text" placeholder="Filter by action or user..." value={filter} onChange={(e) => setFilter(e.target.value)}
          className="mb-4 w-full max-w-xs px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white text-sm" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Timestamp</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Action</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">User</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">IP</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e: any) => (
                <tr key={e.id} className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 px-4 text-gray-500 dark:text-gray-400 text-xs">{new Date(e.timestamp).toLocaleString()}</td>
                  <td className="py-2 px-4"><span className="text-emerald-700 dark:text-emerald-400 text-xs font-medium">{e.action}</span></td>
                  <td className="py-2 px-4 text-gray-500 dark:text-gray-400 text-xs">{e.username || e.email || '-'}</td>
                  <td className="py-2 px-4 text-gray-400 dark:text-gray-500 text-xs font-mono">{e.ip_address || '-'}</td>
                  <td className="py-2 px-4 text-gray-400 dark:text-gray-500 text-xs">{e.override_reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>Page {page} of {Math.max(1, Math.ceil(total / 50))} ({total} entries)</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-800 disabled:opacity-50">Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page * 50 >= total} className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-800 disabled:opacity-50">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
