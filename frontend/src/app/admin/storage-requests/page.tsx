'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import Link from 'next/link';

export default function AdminStorageRequestsPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [status, setStatus] = useState('pending');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!user || !hasRole('admin')) { router.push('/login'); return; }
    loadRequests();
  }, [user, router, status, hasRole]);

  const loadRequests = async () => {
    try {
      const res = await fetch(`/api/v1/admin/storage-requests?status=${status}`, { credentials: 'include' });
      if (res.ok) setRequests(await res.json());
    } catch {}
  };

  const handleApprove = async (id: string) => {
    setMsg('');
    try {
      const res = await fetch(`/api/v1/admin/storage-requests/${id}/approve`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (res.ok) { setMsg('Storage request approved'); loadRequests(); }
      else setMsg(data.error || 'Failed to approve');
    } catch { setMsg('Network error'); }
  };

  const handleReject = async (id: string) => {
    setMsg('');
    try {
      const res = await fetch(`/api/v1/admin/storage-requests/${id}/reject`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (res.ok) { setMsg('Storage request rejected'); loadRequests(); }
      else setMsg(data.error || 'Failed to reject');
    } catch { setMsg('Network error'); }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Storage Requests</h1>
          <Link href="/admin/audit" className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700">Audit</Link>
          <Link href="/admin/wipe-requests" className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700">Wipe</Link>
          <Link href="/admin/notifications" className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700">Notifications</Link>
          <Link href="/admin/users" className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700">Back</Link>
          <button onClick={() => { logout(); fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {}); router.push('/login'); }} className="text-xs px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30">Sign Out</button>
        </div>
        {msg && <p className="mb-4 text-sm text-emerald-500">{msg}</p>}
        <div className="flex gap-2 mb-6">
          {['pending', 'approved', 'rejected'].map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium ${status === s ? 'bg-emerald-600 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>{s}</button>
          ))}
        </div>
        {requests.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No {status} storage requests.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r: any) => (
              <div key={r.id} className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-900 dark:text-white font-semibold">{r.patient_username || r.patient_email}</p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                      Requests <span className="font-mono text-emerald-400">{(r.requested_limit / 1073741824).toFixed(1)} GB</span>
                    </p>
                    <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Reason: {r.reason}</p>
                    <p className="text-xs text-gray-500 mt-1">{new Date(r.created_at).toLocaleString()}</p>
                  </div>
                  {status === 'pending' && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => handleApprove(r.id)} className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500">Approve</button>
                      <button onClick={() => handleReject(r.id)} className="px-3 py-1.5 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-500">Reject</button>
                    </div>
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
