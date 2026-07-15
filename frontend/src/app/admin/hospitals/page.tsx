'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import Link from 'next/link';

interface Hospital {
  id: string;
  name: string;
  address: string | null;
  contact_number: string | null;
  contact_email: string | null;
  software_type: string | null;
  status: string;
  created_at: string;
  linked_patients: string;
  total_records: string;
  last_submission: string | null;
}

export default function AdminHospitalsPage() {
  const router = useRouter();
  const { user, hasRole } = useAuth();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [flash, setFlash] = useState('');
  const [form, setForm] = useState({ name: '', address: '', contact_number: '', contact_email: '', software_type: '' });

  useEffect(() => {
    if (!user || !hasRole('admin')) { router.push('/login'); return; }
    loadHospitals();
  }, [user, router, hasRole]);

  async function loadHospitals() {
    try {
      const res = await fetch('/api/v1/admin/hospitals', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setHospitals(data.hospitals);
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      const res = await fetch(`/api/v1/admin/hospitals/${id}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setFlash(`Hospital ${status === 'active' ? 'approved' : status}`);
        loadHospitals();
      }
    } catch {}
  }

  async function regenerateKey(id: string) {
    try {
      const res = await fetch(`/api/v1/admin/hospitals/${id}/regenerate-key`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.api_key);
        setShowKeyModal(id);
      }
    } catch {}
  }

  async function createHospital(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/admin/hospitals', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.api_key);
        setShowKeyModal('new');
        setForm({ name: '', address: '', contact_number: '', contact_email: '', software_type: '' });
        setShowForm(false);
        loadHospitals();
      }
    } catch {}
  }

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      active: 'bg-emerald-100 text-emerald-700',
      pending: 'bg-yellow-100 text-yellow-700',
      suspended: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-700'}`}>
        {status}
      </span>
    );
  }

  if (!user || !hasRole('admin')) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Hospitals</h1>
          <div className="flex items-center gap-2">
            <Link href="/admin/users" className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700">Back to Users</Link>
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-sm font-medium"
            >
              {showForm ? 'Cancel' : '+ Register Hospital'}
            </button>
          </div>
        </div>

        {flash && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm">
            {flash}
            <button onClick={() => setFlash('')} className="float-right font-bold">&times;</button>
          </div>
        )}

        {showForm && (
          <form onSubmit={createHospital} className="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Hospital name *" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <input placeholder="Software type" value={form.software_type} onChange={e => setForm({...form, software_type: e.target.value})}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <input placeholder="Address" value={form.address} onChange={e => setForm({...form, address: e.target.value})}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <input placeholder="Contact number" value={form.contact_number} onChange={e => setForm({...form, contact_number: e.target.value})}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <input placeholder="Contact email" type="email" value={form.contact_email} onChange={e => setForm({...form, contact_email: e.target.value})}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 col-span-2" />
            </div>
            <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-sm font-medium">
              Create Hospital
            </button>
          </form>
        )}

        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : hospitals.length === 0 ? (
          <p className="text-gray-500 text-sm">No hospitals registered.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left py-3 px-2 font-medium text-gray-500">Name</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Software</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Status</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Patients</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Records</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Last Submission</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {hospitals.map(h => (
                <tr key={h.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900">
                  <td className="py-3 px-2">
                    <div className="font-medium text-gray-900 dark:text-white">{h.name}</div>
                    {h.contact_email && <div className="text-xs text-gray-500">{h.contact_email}</div>}
                  </td>
                  <td className="py-3 px-2 text-gray-600 dark:text-gray-400">{h.software_type || '-'}</td>
                  <td className="py-3 px-2">{statusBadge(h.status)}</td>
                  <td className="py-3 px-2 text-gray-600 dark:text-gray-400">{h.linked_patients}</td>
                  <td className="py-3 px-2 text-gray-600 dark:text-gray-400">{h.total_records}</td>
                  <td className="py-3 px-2 text-gray-600 dark:text-gray-400 text-xs">
                    {h.last_submission ? new Date(h.last_submission).toLocaleDateString() : '-'}
                  </td>
                  <td className="py-3 px-2 text-right space-x-2">
                    {h.status === 'pending' && (
                      <button onClick={() => updateStatus(h.id, 'active')}
                        className="px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-500 text-xs">
                        Approve
                      </button>
                    )}
                    {h.status === 'active' && (
                      <button onClick={() => updateStatus(h.id, 'suspended')}
                        className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-500 text-xs">
                        Suspend
                      </button>
                    )}
                    {h.status === 'suspended' && (
                      <button onClick={() => updateStatus(h.id, 'active')}
                        className="px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-500 text-xs">
                        Reactivate
                      </button>
                    )}
                    <button onClick={() => regenerateKey(h.id)}
                      className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700 text-xs">
                      New Key
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {showKeyModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">API Key Generated</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Copy this key now. It will <strong>not</strong> be shown again.
              </p>
              <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm break-all mb-4">
                {newKey}
              </div>
              <button
                onClick={() => { navigator.clipboard?.writeText(newKey); setShowKeyModal(null); setNewKey(''); }}
                className="w-full px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-sm font-medium"
              >
                Copy & Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
