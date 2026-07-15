'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import Link from 'next/link';

export default function VerifyDoctorsPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (!user || !hasRole('admin')) { router.push('/login'); return; }
    loadDoctors();
  }, [user, router, hasRole, filter]);

  const loadDoctors = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/verify-doctors?status=${filter}`, { credentials: 'include' });
      if (res.ok) setDoctors(await res.json());
    } catch {}
    setLoading(false);
  };

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/admin/verify-doctors/${id}/approve`, {
        method: 'POST', credentials: 'include',
      });
      if (res.ok) loadDoctors();
    } catch {}
  };

  const handleReject = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/admin/verify-doctors/${id}/reject`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (res.ok) { setRejectModal(null); setRejectReason(''); loadDoctors(); }
    } catch {}
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Verify Doctors</h1>
          <div className="flex items-center gap-3">
            <Link href="/admin/users" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">&larr; Back to Users</Link>
            <button onClick={() => { logout(); fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {}); router.push('/login'); }} className="text-xs text-red-600 dark:text-red-400 hover:text-red-500">Sign Out</button>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          {['pending', 'approved', 'rejected'].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                filter === s
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
              }`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : doctors.length === 0 ? (
          <p className="text-gray-500">No doctors found with status &quot;{filter}&quot;.</p>
        ) : (
          <div className="space-y-4">
            {doctors.map((d: any) => (
              <div key={d.id}
                className="p-5 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{d.full_name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{d.email}</p>
                    <div className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                      <p><span className="text-gray-400">Hospital:</span> {d.hospital_name}</p>
                      {d.hospital_address && <p><span className="text-gray-400">Address:</span> {d.hospital_address}</p>}
                      {d.license_number && <p><span className="text-gray-400">License:</span> {d.license_number}</p>}
                      {d.availability && <p><span className="text-gray-400">Availability:</span> {d.availability}</p>}
                      {d.rejection_reason && (
                        <p className="text-red-500"><span className="text-gray-400">Rejection reason:</span> {d.rejection_reason}</p>
                      )}
                    </div>
                    {d.certificates && d.certificates.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-400">Certificates uploaded: {d.certificates.length}</p>
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-2">Registered: {new Date(d.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    {d.verification_status === 'pending' && (
                      <>
                        <button onClick={() => handleApprove(d.id)}
                          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500">
                          Approve
                        </button>
                        <button onClick={() => setRejectModal(d.id)}
                          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-500">
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reject Modal */}
        {rejectModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full mx-4">
              <h2 className="text-lg font-bold text-white mb-2">Reject Doctor</h2>
              <p className="text-gray-400 text-sm mb-4">Provide a reason for rejection (optional).</p>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection..."
                className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[80px]" />
              <div className="flex gap-2 mt-4">
                <button onClick={() => { setRejectModal(null); setRejectReason(''); }}
                  className="flex-1 py-2.5 rounded-lg bg-gray-700 text-white text-sm font-semibold hover:bg-gray-600">Cancel</button>
                <button onClick={() => handleReject(rejectModal)}
                  className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-500">Confirm Reject</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
