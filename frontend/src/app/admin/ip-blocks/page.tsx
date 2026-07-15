'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import Link from 'next/link';

interface IPBlock {
  id: string;
  ip_address: string;
  reason: string;
  blocked_by: string | null;
  blocked_at: string;
  expires_at: string | null;
  status: string;
  affected_user_id: string | null;
  affected_email: string | null;
  affected_username: string | null;
  geo_city: string | null;
  geo_country: string | null;
  geo_region: string | null;
  geo_isp: string | null;
  failed_attempts: number;
  notes: string | null;
  last_request_at: string | null;
}

export default function AdminIPBlocksPage() {
  const router = useRouter();
  const { user, hasRole } = useAuth();
  const [blocks, setBlocks] = useState<IPBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');
  const [flash, setFlash] = useState('');
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesText, setNotesText] = useState('');

  useEffect(() => {
    if (!user || !hasRole('admin')) { router.push('/login'); return; }
    loadBlocks();
  }, [user, router, hasRole, statusFilter]);

  async function loadBlocks() {
    try {
      const res = await fetch(`/api/v1/admin/ip-blocks?status=${statusFilter}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setBlocks(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  async function handleStatus(blockId: string, status: string) {
    try {
      const res = await fetch(`/api/v1/admin/ip-blocks/${blockId}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setFlash(status === 'unblocked' ? 'IP unblocked' : 'IP marked as reviewed');
        loadBlocks();
      }
    } catch {}
  }

  async function saveNotes(blockId: string) {
    try {
      await fetch(`/api/v1/admin/ip-blocks/${blockId}/notes`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesText }),
      });
      setEditingNotes(null);
      setFlash('Notes saved');
      loadBlocks();
    } catch {}
  }

  function reasonBadge(reason: string) {
    const colors: Record<string, string> = {
      BRUTE_FORCE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      MANUAL: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      SUSPICIOUS_ACTIVITY: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    };
    const labels: Record<string, string> = {
      BRUTE_FORCE: 'Brute Force',
      MANUAL: 'Manual',
      SUSPICIOUS_ACTIVITY: 'Suspicious',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[reason] || 'bg-gray-100 text-gray-700'}`}>
        {labels[reason] || reason}
      </span>
    );
  }

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      active: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      reviewed: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      unblocked: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">IP Blocks</h1>
          <Link href="/admin/users" className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700">Back to Users</Link>
        </div>

        {flash && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm">
            {flash}
            <button onClick={() => setFlash('')} className="float-right font-bold">&times;</button>
          </div>
        )}

        <div className="flex gap-2 mb-6">
          {['active', 'reviewed', 'unblocked', 'all'].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === s
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : blocks.length === 0 ? (
          <p className="text-gray-500 text-sm">No IP blocks found.</p>
        ) : (
          <div className="space-y-3">
            {blocks.map((b) => (
              <div key={b.id} className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <div className="flex items-start justify-between mb-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">{b.ip_address}</span>
                      {reasonBadge(b.reason)}
                      {statusBadge(b.status)}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span>Attempts: <strong>{b.failed_attempts}</strong></span>
                      <span>Blocked: {new Date(b.blocked_at).toLocaleString()}</span>
                      {b.expires_at && <span>Expires: {new Date(b.expires_at).toLocaleString()}</span>}
                      {b.last_request_at && <span>Last: {new Date(b.last_request_at).toLocaleString()}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      {b.affected_email && <span>Target: <strong>{b.affected_email}</strong> ({b.affected_username})</span>}
                      {b.geo_city && <span>Location: {[b.geo_city, b.geo_region, b.geo_country].filter(Boolean).join(', ')}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {b.status === 'active' && (
                      <>
                        <button onClick={() => handleStatus(b.id, 'reviewed')}
                          className="px-2 py-1 rounded bg-yellow-600 text-white hover:bg-yellow-500 text-xs">
                          Mark Reviewed
                        </button>
                        <button onClick={() => handleStatus(b.id, 'unblocked')}
                          className="px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-500 text-xs">
                          Unblock
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {editingNotes === b.id ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text" value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                      placeholder="Add admin notes..."
                      className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      autoFocus
                    />
                    <button onClick={() => saveNotes(b.id)} className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-500">Save</button>
                    <button onClick={() => setEditingNotes(null)} className="px-3 py-1.5 rounded bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs">Cancel</button>
                  </div>
                ) : (
                  <div className="mt-2">
                    {b.notes ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                        Notes: {b.notes}
                        <button onClick={() => { setEditingNotes(b.id); setNotesText(b.notes || ''); }} className="ml-2 text-emerald-600 hover:text-emerald-500">Edit</button>
                      </p>
                    ) : (
                      <button onClick={() => { setEditingNotes(b.id); setNotesText(''); }} className="text-xs text-gray-400 hover:text-gray-300">+ Add Notes</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
