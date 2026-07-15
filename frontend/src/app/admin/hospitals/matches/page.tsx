'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import Link from 'next/link';

interface PendingMatch {
  link_id: string;
  hospital_local_id: string;
  match_confidence: number;
  match_method: string;
  created_at: string;
  hospital_name: string;
  candidate_patient_id: string;
  candidate_dob: string | null;
  candidate_gender: string | null;
}

export default function MatchReviewPage() {
  const router = useRouter();
  const { user, hasRole } = useAuth();
  const [matches, setMatches] = useState<PendingMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    if (!user || !hasRole('admin')) { router.push('/login'); return; }
    loadMatches();
  }, [user, router, hasRole]);

  async function loadMatches() {
    try {
      const res = await fetch('/api/v1/admin/hospitals/matches', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setMatches(data.pending_matches);
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  async function handleMatch(linkId: string, action: 'confirm' | 'reject') {
    try {
      const res = await fetch(`/api/v1/admin/hospitals/matches/${linkId}/confirm`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setFlash(`Match ${action === 'confirm' ? 'confirmed' : 'rejected'}`);
        loadMatches();
      }
    } catch {}
  }

  function confidenceColor(score: number) {
    if (score >= 0.9) return 'text-emerald-600';
    if (score >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  }

  if (!user || !hasRole('admin')) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Match Review Queue</h1>
            <p className="text-sm text-gray-500 mt-1">Review uncertain patient matches</p>
          </div>
          <Link href="/admin/hospitals" className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700">Back to Hospitals</Link>
        </div>

        {flash && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm">
            {flash}
            <button onClick={() => setFlash('')} className="float-right font-bold">&times;</button>
          </div>
        )}

        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : matches.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-400 text-sm">No pending matches to review.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map(m => (
              <div key={m.link_id} className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {m.hospital_name}
                      <span className="ml-2 text-xs text-gray-500">ID: {m.hospital_local_id}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                      <span>Method: {m.match_method}</span>
                      <span className={`font-medium ${confidenceColor(m.match_confidence)}`}>
                        Confidence: {(m.match_confidence * 100).toFixed(0)}%
                      </span>
                      <span>Date: {new Date(m.created_at).toLocaleDateString()}</span>
                    </div>
                    {m.candidate_dob && (
                      <div className="text-xs text-gray-500">
                        Candidate DOB: {m.candidate_dob} | Gender: {m.candidate_gender || 'N/A'}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleMatch(m.link_id, 'confirm')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-sm font-medium"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => handleMatch(m.link_id, 'reject')}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
