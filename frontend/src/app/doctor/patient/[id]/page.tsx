'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import Link from 'next/link';

const CATEGORIES = [
  { value: 'general', label: 'General', color: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800' },
  { value: 'prescription', label: 'Prescription', color: 'text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/10' },
  { value: 'bill', label: 'Bill', color: 'text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-500/10' },
  { value: 'timetable', label: 'Timetable', color: 'text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/10' },
  { value: 'explanation', label: 'Explanation', color: 'text-teal-700 dark:text-teal-400 bg-teal-100 dark:bg-teal-500/10' },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

export default function DoctorPatientPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white dark:bg-gray-950 p-6"><p>Loading...</p></div>}>
      <PatientView />
    </Suspense>
  );
}

function PatientView() {
  const router = useRouter();
  const params = useParams();
  const { user, hasRole, logout } = useAuth();
  const patientId = params.id as string;
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const [overrideResult, setOverrideResult] = useState<any>(null);
  const [patientInfo, setPatientInfo] = useState<any>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    if (!user || !hasRole('doctor')) { router.push('/login'); return; }
    fetch(`/api/v1/doctor/patients/${patientId}/profile`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(setPatientInfo)
      .catch(() => {});
    loadRecords();
  }, [patientId, user, router, hasRole]);

  const loadRecords = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/v1/doctor/patients/${patientId}/records`, { credentials: 'include' });
      if (res.status === 403) { setError('No consent'); setRecords([]); }
      else if (res.ok) setRecords(await res.json());
      else setError('Error loading records');
    } catch { setError('Network error'); }
    setLoading(false);
  };

  const handleOverride = async () => {
    if (overrideReason.length < 20) return;
    try {
      const res = await fetch('/api/v1/doctor/emergency-override', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId, reason: overrideReason }),
      });
      if (res.ok) {
        const data = await res.json();
        setOverrideResult(data);
        setRecords(data.records || []);
      }
    } catch {}
    setShowOverride(false);
  };

  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDesc.trim()) return;
    setCreating(true); setCreateError('');
    try {
      const res = await fetch(`/api/v1/doctor/patients/${patientId}/records`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, description: newDesc, category: newCategory }),
      });
      if (res.ok) {
        setNewTitle(''); setNewDesc(''); setNewCategory('general');
        loadRecords();
      } else {
        const data = await res.json();
        setCreateError(data.error || 'Failed to create record');
      }
    } catch { setCreateError('Network error'); }
    setCreating(false);
  };

  const isOwnRecord = (r: any) => r.source === 'doctor_entry' || r.source === 'doctor_upload';

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">
        {patientInfo && (
          <div className="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">Name</span>
                <p className="text-gray-900 dark:text-white font-medium">{patientInfo.first_name} {patientInfo.last_name}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">National ID</span>
                <p className="text-gray-900 dark:text-white font-medium">{patientInfo.national_id || 'Not set'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">DOB</span>
                <p className="text-gray-900 dark:text-white font-medium">{patientInfo.dob || 'Not set'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">Patient ID</span>
                <p className="text-gray-900 dark:text-white font-mono text-xs truncate" title={patientId}>{patientId.slice(0, 8)}...</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/doctor/search" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">&larr; Back to search</Link>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">Patient Records</h1>
          </div>
          <button onClick={() => { logout(); router.push('/login'); }}
            className="text-xs text-red-600 dark:text-red-400">Sign Out</button>
        </div>

        {overrideResult && (
          <div className="mb-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm">
            Emergency access used &mdash; logged to audit trail. Reason: {overrideResult.override_reason}
          </div>
        )}

        {error === 'No consent' ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 mb-4">No active consent from this patient.</p>
            <button onClick={() => setShowOverride(true)}
              className="px-6 py-2.5 rounded-lg bg-amber-600 text-white font-semibold text-sm hover:bg-amber-500">
              Emergency Override
            </button>
          </div>
        ) : loading ? (
          <p className="text-gray-500 dark:text-gray-400">Loading records...</p>
        ) : (
          <>
            {records.length === 0 && <p className="text-gray-500 dark:text-gray-400 mb-6">No records found.</p>}

            <div className="space-y-3 mb-8">
              {records.map((r: any) => {
                const catInfo = CATEGORY_MAP[r.category] || CATEGORY_MAP['general'];
                return (
                  <div key={r.id} className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-gray-900 dark:text-white font-semibold">{r.title}</h3>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${catInfo.color}`}>{catInfo.label}</span>
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{r.description}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded ${isOwnRecord(r) ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10' : 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10'}`}>
                            {isOwnRecord(r) ? 'Your entry' : "Patient's file"}
                          </span>
                        </div>
                        {r.file_path && (
                          <button onClick={() => window.open(`/api/v1/doctor/patients/${patientId}/records/${r.id}/file`, '_blank')}
                            className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 hover:underline">
                            View Uploaded File
                          </button>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{new Date(r.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Create Record for Patient</h2>
              <form onSubmit={handleCreateRecord} className="space-y-3 max-w-lg">
                <input type="text" placeholder="Title" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <textarea placeholder="Description" value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Category</label>
                  <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    {CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                {createError && <p className="text-sm text-red-400">{createError}</p>}
                <button type="submit" disabled={creating || !newTitle.trim() || !newDesc.trim()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50">
                  {creating ? 'Creating...' : 'Create Record'}
                </button>
              </form>
            </div>
          </>
        )}

        {error === 'No consent' && <button onClick={loadRecords} className="mt-4 text-sm text-emerald-600 dark:text-emerald-400 hover:underline">Retry</button>}

        {showOverride && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full mx-4">
              <h2 className="text-lg font-bold text-white mb-2">Emergency Override</h2>
              <p className="text-gray-400 text-sm mb-4">This action will be logged to the audit trail. The patient will be notified.</p>
              <textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Reason for override (min 20 characters)..."
                className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[100px]" />
              <p className="text-xs text-gray-500 mt-1 text-right">{overrideReason.length}/20</p>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setShowOverride(false)} className="flex-1 py-2.5 rounded-lg bg-gray-700 text-white text-sm font-semibold hover:bg-gray-600">Cancel</button>
                <button onClick={handleOverride} disabled={overrideReason.length < 20}
                  className="flex-1 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-500 disabled:opacity-50">Confirm Override</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
