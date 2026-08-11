'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import Link from 'next/link';
import TimeButton from '@/components/cute/TimeButton';

export default function DoctorSearchPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();
  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [consenting, setConsenting] = useState<string | null>(null);
  const [consentFeedback, setConsentFeedback] = useState<Record<string, { type: 'success' | 'error'; message: string }>>({});

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (!hasRole('doctor')) { router.push('/dashboard'); return; }
    loadPatients();
  }, [router, hasRole]);

  const loadPatients = async (query?: string) => {
    try {
      const url = query ? `/api/v1/doctor/patients?q=${encodeURIComponent(query)}` : '/api/v1/doctor/patients';
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) setPatients(await res.json());
    } catch {}
    setLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadPatients(search);
  };

  const requestConsent = async (patientId: string) => {
    setConsenting(patientId);
    setConsentFeedback((prev) => {
      const next = { ...prev };
      delete next[patientId];
      return next;
    });
    try {
      const res = await fetch(`/api/v1/doctor/consent-request/${patientId}`, {
        method: 'POST', credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setConsentFeedback((prev) => ({ ...prev, [patientId]: { type: 'success', message: 'Request sent!' } }));
        loadPatients(search);
      } else {
        setConsentFeedback((prev) => ({ ...prev, [patientId]: { type: 'error', message: data.error || 'Request failed' } }));
      }
    } catch {
      setConsentFeedback((prev) => ({ ...prev, [patientId]: { type: 'error', message: 'Could not reach server' } }));
    }
    setConsenting(null);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/doctor/profile')}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Patient Search</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/doctor/profile" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">Profile</Link>
            <Link href="/doctor/notifications" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">Notifications</Link>
            <Link href="/guide" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">Guide</Link>
            <button onClick={() => { logout(); router.push('/login'); }}
              className="text-xs text-red-600 dark:text-red-400">Sign Out</button>
          </div>
        </div>
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex gap-2">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name..."
              className="flex-1 px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <button type="submit" className="px-6 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-500">Search</button>
          </div>
        </form>
        {loading ? (
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        ) : patients.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No patients found.</p>
        ) : (
          <div className="space-y-2">
            {patients.map((p: any) => (
              <div key={p.id}
                className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <div>
                  <p className="text-gray-900 dark:text-white font-semibold">{p.first_name || 'Unknown'} {p.last_name || ''}</p>
                  <p className="text-xs text-gray-400">Patient ID: {p.user_id?.slice(0, 8)}...</p>
                </div>
                <div className="flex items-center gap-2">
                  {p.has_consent ? (
                    <Link href={`/doctor/patient/${p.id}`}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500">View Records</Link>
                  ) : (
                    <>
                      <button onClick={() => requestConsent(p.id)} disabled={consenting === p.id}
                        className="px-3 py-1.5 rounded-lg bg-gray-700 text-gray-300 text-xs font-semibold hover:bg-gray-600 disabled:opacity-50">
                        {consenting === p.id ? 'Sending...' : 'Request Consent'}
                      </button>
                      {consentFeedback[p.id] && (
                        <span className={`text-xs font-medium ${consentFeedback[p.id].type === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
                          {consentFeedback[p.id].message}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <TimeButton />
    </div>
  );
}
