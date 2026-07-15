'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';

export default function DoctorDirectoryPage() {
  const router = useRouter();
  const { user, hasRole } = useAuth();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user || !hasRole('patient')) { router.push('/login'); return; }
    loadDoctors();
  }, [user, router, hasRole]);

  const loadDoctors = async () => {
    try {
      const res = await fetch('/api/v1/doctor/directory', { credentials: 'include' });
      if (res.ok) setDoctors(await res.json());
    } catch {}
    setLoading(false);
  };

  const filtered = search
    ? doctors.filter(d =>
        d.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        d.hospital_name?.toLowerCase().includes(search.toLowerCase())
      )
    : doctors;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Find Doctors</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Browse verified doctors and grant them consent to access your records.
        </p>

        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or hospital..."
          className="w-full px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-6" />

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500">No doctors found.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((d: any) => (
              <div key={d.id}
                className="p-5 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-emerald-400 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{d.full_name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{d.hospital_name}</p>
                    {d.hospital_address && (
                      <p className="text-xs text-gray-400 mt-1">{d.hospital_address}</p>
                    )}
                    {d.availability && (
                      <p className="text-xs text-gray-400 mt-1">Available: {d.availability}</p>
                    )}
                  </div>
                  <button onClick={() => router.push(`/dashboard/consents?doctorId=${d.id}`)}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 flex-shrink-0">
                    Grant Consent
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
