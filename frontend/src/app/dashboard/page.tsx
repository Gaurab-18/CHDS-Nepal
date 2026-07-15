'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import ThemeToggle from '@/components/ui/ThemeToggle';
import OnboardingModal from '@/components/cute/OnboardingModal';
import ServiceStatusBanner from '@/components/ui/ServiceStatusBanner';
import IdleTimer from '@/components/ui/IdleTimer';
import TimeButton from '@/components/cute/TimeButton';

type Tab = 'profile' | 'records' | 'consents' | 'audit' | 'privacy';

const TABS: Tab[] = ['profile', 'records', 'consents', 'audit', 'privacy'];
const TAB_LABELS: Record<Tab, string> = {
  profile: 'Profile',
  records: 'Records',
  consents: 'Consents',
  audit: 'Audit Log',
  privacy: 'Privacy',
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, logout, updateUser } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (!user.onboarding_complete) setShowOnboarding(true);
    fetch('/api/v1/notifications/unread-count', { credentials: 'include' })
      .then((r) => r.json()).then((d) => setNotifCount(d.unread_count || 0)).catch(() => {});
  }, [user, router]);

  const completeOnboarding = useCallback(async () => {
    await fetch('/api/v1/auth/onboarding-complete', { method: 'POST', credentials: 'include' });
    updateUser({ onboarding_complete: true });
    setShowOnboarding(false);
  }, [updateUser]);

  if (!user) return null;

  return (
    <>
      <ServiceStatusBanner />
      <IdleTimer />
      {showOnboarding && <OnboardingModal onComplete={completeOnboarding} onSkip={() => setShowOnboarding(false)} />}
      <div className="min-h-screen bg-white dark:bg-gray-950 flex pt-8">
        <aside className="w-64 border-r border-gray-200 dark:border-gray-800 p-6 flex flex-col gap-1 relative">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">CHDS</h2>
            <ThemeToggle />
          </div>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t
                  ? 'bg-emerald-100 dark:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-600/30'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
          <div className="mt-2 pt-4 border-t border-gray-200 dark:border-gray-800 space-y-1">
            <button
              onClick={() => router.push('/dashboard/notifications')}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-all flex items-center justify-between"
            >
              <span>Notifications</span>
              {notifCount > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white text-xs font-bold">
                  {notifCount}
                </span>
              )}
            </button>
            <button
              onClick={() => router.push('/guide')}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
            >
              How to Use &rarr;
            </button>
          </div>
          <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{user.email}</p>
            <button
              onClick={() => {
                logout();
                fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
                router.push('/login');
              }}
              className="mt-2 text-xs text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300"
            >
              Sign Out
            </button>
          </div>
        </aside>

        <main className="flex-1 p-8 overflow-y-auto">
          {tab === 'profile' && <ProfileTab />}
          {tab === 'records' && <RecordsTab />}
          {tab === 'consents' && <ConsentsTab />}
          {tab === 'audit' && <AuditTab />}
          {tab === 'privacy' && <PrivacyTab />}
        </main>
      </div>
    </>
  );
}

function ProfileTab() {
  const [profile, setProfile] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', address: '' });
  const [saveMsg, setSaveMsg] = useState('');
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    fetch('/api/v1/patient/profile', { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then((p) => { setProfile(p); setForm({ first_name: p.first_name || '', last_name: p.last_name || '', phone: p.phone || '', address: p.address || '' }); })
      .catch(() => setProfileError('Could not load profile. Make sure you have a patient profile set up.'));
  }, []);

  const handleSave = async () => {
    setSaveMsg('');
    const res = await fetch('/api/v1/patient/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setSaveMsg(data.error || 'Save failed'); return; }
    setProfile(data.profile);
    setEditing(false);
    setSaveMsg('Saved');
    setTimeout(() => setSaveMsg(''), 2000);
  };

  const LIMIT = 100;

  if (profileError) return <p className="text-gray-500 dark:text-gray-400">{profileError}</p>;
  if (!profile) return <p className="text-gray-500 dark:text-gray-400">Loading profile...</p>;
  return (
    <div>
          <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">My Profile</h2>
        <button onClick={() => setEditing(!editing)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500">
          {editing ? 'Cancel' : 'Edit'}
            </button>
          </div>
      {saveMsg && <p className="mb-4 text-sm text-emerald-500">{saveMsg}</p>}
      <div className="grid grid-cols-2 gap-4 max-w-lg">
        {editing ? (
          <>
            <EditField label="First Name" value={form.first_name} maxLen={LIMIT} onChange={(v) => setForm({ ...form, first_name: v })} />
            <EditField label="Last Name" value={form.last_name} maxLen={LIMIT} onChange={(v) => setForm({ ...form, last_name: v })} />
            <Field label="National ID" value={profile.national_id || 'Not set'} />
            <Field label="Date of Birth" value={profile.dob} />
            <EditField label="Phone" value={form.phone} maxLen={20} onChange={(v) => setForm({ ...form, phone: v })} />
            <EditField label="Address" className="col-span-2" value={form.address} maxLen={500} onChange={(v) => setForm({ ...form, address: v })} />
            <div className="col-span-2">
              <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500">
                Save Changes
              </button>
            </div>
          </>
        ) : (
          <>
            <Field label="First Name" value={profile.first_name} />
            <Field label="Last Name" value={profile.last_name} />
            <Field label="National ID" value={profile.national_id || 'Not set'} />
            <Field label="Date of Birth" value={profile.dob} />
            <Field label="Phone" value={profile.phone} />
            <Field label="Address" className="col-span-2" value={profile.address} />
          </>
        )}
      </div>
    </div>
  );
}

const CATEGORY_STYLES: Record<string, string> = {
  general: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800',
  prescription: 'text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/10',
  bill: 'text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-500/10',
  timetable: 'text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/10',
  explanation: 'text-teal-700 dark:text-teal-400 bg-teal-100 dark:bg-teal-500/10',
};

function RecordsTab() {
  const [records, setRecords] = useState<any[]>([]);
  const [accessStats, setAccessStats] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/v1/patient/records', { credentials: 'include' })
      .then((r) => r.json()).then(setRecords).catch(() => {});
    fetch('/api/v1/patient/records/access-stats', { credentials: 'include' })
      .then((r) => r.json()).then(setAccessStats).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!uploadTitle.trim() || !uploadDesc.trim()) {
      setUploadMsg('Please enter a title and description');
      return;
    }
    setUploading(true);
    setUploadMsg('');
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256 = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('sha256', sha256);
    formData.append('title', uploadTitle);
    formData.append('description', uploadDesc);

    try {
      const res = await fetch('/api/v1/patient/records/upload', { method: 'POST', credentials: 'include', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setUploadMsg(data.error || 'Upload failed');
      } else {
        setUploadMsg('Upload successful');
        setUploadTitle('');
        setUploadDesc('');
        load();
      }
    } catch {
      setUploadMsg('Could not connect to server');
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/v1/patient/records/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) load();
    setDeleteConfirm(null);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">My Records</h2>

      <div className="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 max-w-lg space-y-3">
        <input type="text" placeholder="Title" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <textarea placeholder="Description" value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} rows={2}
          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50">
          {uploading ? (
            <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Uploading...</>
          ) : 'Upload Record'}
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading || !uploadTitle.trim() || !uploadDesc.trim()} />
        </label>
        {uploadMsg && <p className={`text-sm ${uploadMsg === 'Upload successful' ? 'text-emerald-500' : 'text-red-400'}`}>{uploadMsg}</p>}
      </div>

      {deleteConfirm && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-3 max-w-lg">
          <span>Delete this record?</span>
          <button onClick={() => handleDelete(deleteConfirm)} className="px-2 py-1 rounded bg-red-600 text-white text-xs">Yes</button>
          <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 rounded bg-gray-600 text-white text-xs">No</button>
        </div>
      )}

      {accessStats.length > 0 && (
        <div className="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Record Access History</h3>
          <div className="space-y-1">
            {accessStats.slice(0, 5).map((a: any, i: number) => (
              <p key={i} className="text-xs text-gray-500 dark:text-gray-400">
                {a.doctor_name || a.doctor_username} viewed {a.view_count} time{a.view_count !== 1 ? 's' : ''}
                {a.last_viewed_at && ` : last ${new Date(a.last_viewed_at).toLocaleString()}`}
              </p>
            ))}
            {accessStats.length > 5 && (
              <p className="text-xs text-gray-400 dark:text-gray-500">...and {accessStats.length - 5} more</p>
            )}
          </div>
        </div>
      )}

      {records.length === 0 && <p className="text-gray-500 dark:text-gray-400">No records found.</p>}
      <div className="space-y-3">
        {records.map((r: any) => (
          <div key={r.id} className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-gray-900 dark:text-white font-semibold">{r.title}</h3>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${CATEGORY_STYLES[r.category] || CATEGORY_STYLES.general}`}>
                    {r.category || 'general'}
                  </span>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{r.description}</p>
                <span className="inline-block mt-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 px-2 py-0.5 rounded">{r.source}</span>
                {r.file_hash && (
                  <p className="text-xs text-gray-400 dark:text-gray-600 mt-1 font-mono">SHA-256: {r.file_hash.slice(0, 16)}...</p>
                )}
                {r.file_hash && r.id && (
                  <button onClick={() => window.open(`/api/v1/patient/records/file/${r.id}`, '_blank')}
                    className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 hover:underline">
                    View Uploaded File
                  </button>
                )}
                {accessStats.filter((a: any) => a.record_id === r.id).map((a: any, i: number) => (
                  <p key={i} className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Viewed {a.view_count} time{a.view_count !== 1 ? 's' : ''} by {a.doctor_name || a.doctor_username}
                    {a.last_viewed_at && ` (last: ${new Date(a.last_viewed_at).toLocaleDateString()})`}
                  </p>
                ))}
              </div>
              <button onClick={() => setDeleteConfirm(r.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline ml-4 shrink-0">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConsentsTab() {
  const [consents, setConsents] = useState<any[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedConsent, setExpandedConsent] = useState<string | null>(null);
  const [consentRecords, setConsentRecords] = useState<any[]>([]);
  const [viewingDoctor, setViewingDoctor] = useState<any | null>(null);

  const load = useCallback(() => {
    fetch('/api/v1/patient/consents', { credentials: 'include' })
      .then((r) => r.json()).then(setConsents).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadRecords = async (consentId: string) => {
    if (expandedConsent === consentId) {
      setExpandedConsent(null);
      setConsentRecords([]);
      return;
    }
    setExpandedConsent(consentId);
    try {
      const res = await fetch(`/api/v1/patient/consents/${consentId}/records`, { credentials: 'include' });
      if (res.ok) setConsentRecords(await res.json());
    } catch {}
  };

  const toggleRecord = async (consentId: string, recordId: string) => {
    await fetch(`/api/v1/patient/consents/${consentId}/records/${recordId}/toggle`, {
      method: 'POST', credentials: 'include',
    });
    loadRecords(consentId);
  };

  const handleRevoke = async (id: string) => {
    await fetch(`/api/v1/patient/consents/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  const handleApprove = async (id: string) => {
    await fetch(`/api/v1/patient/consents/${id}/approve`, { method: 'POST', credentials: 'include' });
    load();
  };

  const handleDecline = async (id: string) => {
    await fetch(`/api/v1/patient/consents/${id}/decline`, { method: 'POST', credentials: 'include' });
    load();
  };

  const clearFilters = () => {
    setFromDate('');
    setToDate('');
    setStatusFilter('all');
  };

  const now = new Date();
  const filtered = consents.filter((c) => {
    const status = c.status === 'active' && new Date(c.expires_at) <= now ? 'expired' : c.status;
    if (statusFilter !== 'all' && status !== statusFilter) return false;
    if (fromDate && new Date(c.created_at) < new Date(fromDate)) return false;
    if (toDate && new Date(c.created_at) > new Date(toDate + 'T23:59:59')) return false;
    return true;
  });

  const pendingReqs = filtered.filter((c) => c.status === 'pending');
  const active = filtered.filter((c) => c.status === 'active' && new Date(c.expires_at) > now);
  const expired = filtered.filter((c) => c.status === 'active' && new Date(c.expires_at) <= now);
  const revoked = filtered.filter((c) => c.status === 'revoked');

  const scopeLabels: Record<string, string> = {
    all: 'Full Access',
    read_only: 'Read Only',
    emergency_only: 'Emergency Only',
  };
  const scopeDescriptions: Record<string, string> = {
    all: 'Clinician can view and update all your records',
    read_only: 'Clinician can view your records but not modify them',
    emergency_only: 'Clinician can access records only during emergencies',
  };
  const scopeColors: Record<string, string> = {
    all: 'bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400',
    read_only: 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400',
    emergency_only: 'bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400',
  };

  const hasAnyFilter = fromDate || toDate || statusFilter !== 'all';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">My Consents</h2>
      </div>

      <div className="mb-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/30 text-sm text-gray-700 dark:text-gray-300 max-w-lg">
        <p className="font-semibold text-blue-700 dark:text-blue-400 mb-1">How consent works</p>
        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
          Consent lets you control which doctors can access your medical data. Only active consents grant access.
          Each consent has a <strong>scope</strong> that defines what the doctor can do and an <strong>expiration date</strong>.
          You can also control per-record visibility for each doctor.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="px-2 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="px-2 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>
        {hasAnyFilter && (
          <button onClick={clearFilters} className="px-3 py-2 rounded-lg bg-red-600/10 border border-red-600/20 text-red-400 text-xs font-semibold hover:bg-red-600/20">Clear</button>
        )}
      </div>

      {consents.length === 0 && <p className="text-gray-500 dark:text-gray-400">No consents yet.</p>}

      {/* Pending Requests */}
      {pendingReqs.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
            Pending Requests ({pendingReqs.length})
          </h3>
          <div className="space-y-3">
            {pendingReqs.map((c: any) => (
              <div key={c.id} className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 border-l-4 border-l-amber-500">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-gray-900 dark:text-white font-semibold text-base">{c.full_name || c.username || 'Unknown Doctor'}</p>
                    {c.hospital_name && <p className="text-gray-600 dark:text-gray-400 text-sm">{c.hospital_name}</p>}
                    {c.hospital_address && <p className="text-gray-400 dark:text-gray-500 text-xs">{c.hospital_address}</p>}
                    {c.phone && <p className="text-gray-400 dark:text-gray-500 text-xs">Phone: {c.phone}</p>}
                    {c.license_number && <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">License: {c.license_number}</p>}
                    {c.email && <p className="text-gray-400 dark:text-gray-500 text-xs">Email: {c.email}</p>}
                    {c.certificates?.length > 0 && <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">{c.certificates.length} certificate(s) uploaded</p>}
                    {c.availability && <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Availability: {c.availability}</p>}
                    <p className="text-xs text-gray-400 mt-2">Requested {new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex flex-col gap-2 ml-4">
                    <button onClick={() => setViewingDoctor(c)} className="px-3 py-1.5 rounded-lg bg-gray-700 text-gray-300 text-xs font-semibold hover:bg-gray-600">View Profile</button>
                    <button onClick={() => handleApprove(c.id)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500">Approve</button>
                    <button onClick={() => handleDecline(c.id)} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-500">Decline</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Consents */}
      {active.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Active ({active.length})
          </h3>
          <div className="space-y-3">
            {active.map((c: any) => {
              const daysLeft = Math.ceil((new Date(c.expires_at).getTime() - now.getTime()) / 86400000);
              const isExpanded = expandedConsent === c.id;
              return (
                <div key={c.id}>
                  <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-4 border-l-emerald-500">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-gray-900 dark:text-white font-semibold">{c.full_name || c.username || c.email}</p>
                        {c.hospital_name && <p className="text-gray-500 dark:text-gray-400 text-xs">{c.hospital_name}</p>}
                        {c.phone && <p className="text-gray-400 dark:text-gray-500 text-xs">Phone: {c.phone}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${scopeColors[c.scoped_access] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                            {scopeLabels[c.scoped_access] || c.scoped_access}
                          </span>
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{daysLeft}d remaining</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{scopeDescriptions[c.scoped_access] || ''}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          Granted: {new Date(c.created_at).toLocaleDateString()} &middot; Expires: {new Date(c.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 ml-4">
                        <button onClick={() => loadRecords(c.id)} className={`px-3 py-1 rounded-lg text-xs font-semibold ${isExpanded ? 'bg-gray-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                          {isExpanded ? 'Hide Records' : 'Manage Records'}
                        </button>
                        <button onClick={() => handleRevoke(c.id)} className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-500">Revoke</button>
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-1 ml-6 p-3 rounded-lg bg-gray-900/50 border border-gray-800">
                      <p className="text-xs text-gray-400 mb-2">Toggle which records this doctor can see:</p>
                      <div className="space-y-1">
                        {consentRecords.length === 0 && <p className="text-xs text-gray-500">No records found.</p>}
                        {consentRecords.map((r: any) => (
                          <div key={r.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-800">
                            <div className="flex-1">
                              <p className="text-xs text-gray-300">{r.title || 'Untitled'}</p>
                              <p className="text-xs text-gray-500">{r.source_label} &middot; {new Date(r.created_at).toLocaleDateString()}</p>
                            </div>
                            <button onClick={() => toggleRecord(c.id, r.id)}
                              className={`text-xs px-2 py-0.5 rounded font-medium ${r.visible ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                              {r.visible ? 'On' : 'Off'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {expired.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />
            Expired ({expired.length})
          </h3>
          <div className="space-y-2">
            {expired.map((c: any) => (
              <div key={c.id} className="p-3 rounded-lg bg-gray-50/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 border-l-4 border-l-yellow-500">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-gray-500 dark:text-gray-400 text-sm">{c.full_name || c.username || c.email}</p>
                    {c.hospital_name && <p className="text-gray-400 dark:text-gray-500 text-xs">{c.hospital_name}</p>}
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${scopeColors[c.scoped_access] || ''}`}>
                      {scopeLabels[c.scoped_access] || c.scoped_access}
                    </span>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Expired {new Date(c.expires_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {revoked.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            Revoked ({revoked.length})
          </h3>
          <div className="space-y-2">
            {revoked.map((c: any) => (
              <div key={c.id} className="p-3 rounded-lg bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 border-l-4 border-l-red-500">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-gray-500 dark:text-gray-400 text-sm">{c.full_name || c.username || c.email}</p>
                    {c.hospital_name && <p className="text-gray-400 dark:text-gray-500 text-xs">{c.hospital_name}</p>}
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${scopeColors[c.scoped_access] || ''}`}>
                      {scopeLabels[c.scoped_access] || c.scoped_access}
                    </span>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Revoked {c.updated_at ? new Date(c.updated_at).toLocaleDateString() : ''}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewingDoctor && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setViewingDoctor(null)}>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Doctor Profile</h2>
              <button onClick={() => setViewingDoctor(null)} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500 text-xs">Name</span>
                <p className="text-white font-medium">{viewingDoctor.full_name || viewingDoctor.username || 'Unknown'}</p>
              </div>
              {viewingDoctor.hospital_name && (
                <div>
                  <span className="text-gray-500 text-xs">Hospital</span>
                  <p className="text-white">{viewingDoctor.hospital_name}</p>
                  {viewingDoctor.hospital_address && <p className="text-gray-400 text-xs">{viewingDoctor.hospital_address}</p>}
                </div>
              )}
              {viewingDoctor.phone && (
                <div>
                  <span className="text-gray-500 text-xs">Phone</span>
                  <p className="text-white">{viewingDoctor.phone}</p>
                </div>
              )}
              {viewingDoctor.email && (
                <div>
                  <span className="text-gray-500 text-xs">Email</span>
                  <p className="text-white">{viewingDoctor.email}</p>
                </div>
              )}
              {viewingDoctor.license_number && (
                <div>
                  <span className="text-gray-500 text-xs">License Number</span>
                  <p className="text-white">{viewingDoctor.license_number}</p>
                </div>
              )}
              {viewingDoctor.availability && (
                <div>
                  <span className="text-gray-500 text-xs">Availability</span>
                  <p className="text-white">{viewingDoctor.availability}</p>
                </div>
              )}
              {viewingDoctor.certificates?.length > 0 && (
                <div>
                  <span className="text-gray-500 text-xs">Certificates ({viewingDoctor.certificates.length})</span>
                  <ul className="mt-1 space-y-1">
                    {viewingDoctor.certificates.map((cert: string, i: number) => {
                      const fileName = cert.split('/').pop() || `Certificate ${i + 1}`;
                      return (
                        <li key={i}>
                          <a href={`/api/v1/uploads/${fileName}`} target="_blank" rel="noopener noreferrer"
                            className="text-emerald-400 hover:text-emerald-300 text-xs underline">
                            {fileName}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <div className="border-t border-gray-700 pt-3 text-xs text-gray-500">
                Requested consent on {new Date(viewingDoctor.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditTab() {
  const [entries, setEntries] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [qrShown, setQrShown] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState('');

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    if (actionFilter) params.set('action', actionFilter);
    return params;
  }, [fromDate, toDate, actionFilter]);

  const load = useCallback(() => {
    const qs = buildParams().toString();
    fetch(`/api/v1/patient/audit-log${qs ? '?' + qs : ''}`, { credentials: 'include' })
      .then((r) => r.json()).then(setEntries).catch(() => {});
  }, [buildParams]);
  useEffect(() => { load(); }, [load]);

  const clearFilters = () => {
    setFilter('');
    setFromDate('');
    setToDate('');
    setActionFilter('');
  };

  const filtered = filter ? entries.filter((e) => e.action.toLowerCase().includes(filter.toLowerCase()) || (e.override_reason || '').toLowerCase().includes(filter.toLowerCase())) : entries;

  const exportCSV = () => {
    const qs = buildParams().toString();
    fetch(`/api/v1/patient/audit-log/download${qs ? '?' + qs : ''}`, { credentials: 'include' })
      .then((r) => r.blob()).then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'audit-log.csv'; a.click();
        URL.revokeObjectURL(url);
      }).catch(() => {});
  };

  const generateQRReceipt = async () => {
    setQrLoading(true);
    try {
      const params = buildParams();
      const qs = params.toString();
      const res = await fetch(`/api/v1/patient/audit-qr${qs ? '?' + qs : ''}`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.qrCode) {
        setQrUrl(data.qrCode);
        setReceiptUrl(data.url);
        setQrShown(true);
      }
    } catch {}
    setQrLoading(false);
  };

  const actionTypeOptions = [
    { value: '', label: 'All types' },
    { value: 'LOGIN', label: 'Authentication' },
    { value: 'PASSWORD', label: 'Password Changes' },
    { value: '2FA', label: '2FA Events' },
    { value: 'CONSENT', label: 'Consents' },
    { value: 'WIPE', label: 'Data Wipe' },
  ];

  const hasAnyFilter = fromDate || toDate || actionFilter || filter;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Log</h2>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700">
            Export CSV
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="px-2 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="px-2 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
            className="px-2 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500">
            {actionTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Keyword</label>
          <input type="text" placeholder="Filter entries..." value={filter} onChange={(e) => setFilter(e.target.value)}
            className="px-2 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 w-36" />
        </div>
        {hasAnyFilter && (
          <button onClick={clearFilters} className="px-3 py-2 rounded-lg bg-red-600/10 border border-red-600/20 text-red-400 text-xs font-semibold hover:bg-red-600/20">
            Clear
          </button>
        )}
      </div>

      <div className="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 max-w-lg">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Printable Audit Receipt</h3>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500">
              {actionTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <button onClick={generateQRReceipt} disabled={qrLoading}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 disabled:opacity-50">
          {qrLoading ? 'Generating...' : 'Generate QR Receipt'}
        </button>
        <p className="text-xs text-gray-500 mt-2">Generate a QR code and receipt link for the filtered date range</p>
      </div>

      {qrShown && qrUrl && (
        <div className="mb-4 p-6 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-center">
          <img src={qrUrl} alt="Audit QR" className="mx-auto w-48 h-48 animate-fade-in" />
          <p className="text-xs text-gray-500 mt-2">
            Receipt: {fromDate || 'Last 30 days'}{toDate ? ' to ' + toDate : ''}{actionFilter ? ' · ' + actionFilter : ''}
          </p>
          <p className="text-xs text-gray-500">Expires in 24 hours</p>
          <div className="flex items-center justify-center gap-3 mt-3">
            <button onClick={() => { setQrShown(false); setQrUrl(''); }} className="text-xs text-red-500 hover:underline">Close</button>
            <a href={qrUrl} download="audit-qr.png" className="text-xs text-emerald-500 hover:underline">Download QR</a>
            {receiptUrl && (
              <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500">
                View Receipt
              </a>
            )}
          </div>
          {receiptUrl && (
            <p className="text-xs text-gray-500 mt-2 break-all select-all">{receiptUrl}</p>
          )}
        </div>
      )}
      {filtered.length === 0 && <p className="text-gray-500 dark:text-gray-400">No audit entries found.</p>}
      <div className="space-y-2">
        {filtered.map((e: any) => (
          <div key={e.id} className="p-3 rounded-lg bg-gray-50/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <div>
              <span className="text-emerald-700 dark:text-emerald-400 text-sm font-medium">{e.action}</span>
              {e.override_reason && <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">{e.override_reason}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 dark:text-gray-500">{new Date(e.timestamp).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrivacyTab() {
  const { user, updateUser } = useAuth();
  const [score, setScore] = useState<any>(null);
  const [twoFAState, setTwoFAState] = useState<'idle' | 'loading' | 'ready' | 'enabled'>(user?.two_factor_enabled ? 'enabled' : 'idle');
  const [twoFASecret, setTwoFASecret] = useState('');
  const [twoFAQr, setTwoFAQr] = useState('');
  const [twoFAToken, setTwoFAToken] = useState('');
  const [twoFAMsg, setTwoFAMsg] = useState('');
  const [twoFABackupCodes, setTwoFABackupCodes] = useState<string[]>([]);
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [showPw, setShowPw] = useState({ current: false, newPw: false, confirm: false });

  const loadScore = useCallback(() => {
    fetch('/api/v1/auth/security-score', { credentials: 'include' })
      .then((r) => r.json()).then(setScore).catch(() => {});
  }, []);

  useEffect(() => { loadScore(); }, [loadScore]);

  const handle2FASetup = async () => {
    setTwoFAState('loading');
    setTwoFAMsg('');
    const res = await fetch('/api/v1/auth/2fa/setup', { method: 'POST', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) { setTwoFAMsg(data.error || 'Setup failed'); setTwoFAState('idle'); return; }
    setTwoFASecret(data.secret);
    setTwoFAQr(data.qrCode);
    setTwoFAState('ready');
  };

  const handle2FAEnable = async () => {
    if (twoFAToken.length !== 6) { setTwoFAMsg('Enter a 6-digit token'); return; }
    const res = await fetch('/api/v1/auth/2fa/enable', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ token: twoFAToken }),
    });
    const data = await res.json();
    if (!res.ok) { setTwoFAMsg(data.error || 'Enable failed'); return; }
    setTwoFABackupCodes(data.backup_codes || []);
    setTwoFAState('enabled');
    setTwoFAToken('');
    updateUser({ two_factor_enabled: true });
    loadScore();
  };

  const handle2FADisable = async () => {
    setTwoFAMsg('');
    const res = await fetch('/api/v1/auth/2fa/disable', {
      method: 'POST', credentials: 'include',
    });
    if (!res.ok) { const d = await res.json(); setTwoFAMsg(d.error || 'Disable failed'); return; }
    setTwoFAState('idle');
    setTwoFABackupCodes([]);
    setTwoFAQr('');
    updateUser({ two_factor_enabled: false });
    loadScore();
  };

  const handleChangePassword = async () => {
    setPwMsg('');
    if (pwForm.newPw !== pwForm.confirm) { setPwMsg('Passwords do not match'); return; }
    if (pwForm.newPw.length < 8) { setPwMsg('Password must be at least 8 characters'); return; }
    const res = await fetch('/api/v1/auth/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.newPw }),
    });
    const data = await res.json();
    if (!res.ok) { setPwMsg(data.error || 'Change failed'); return; }
    setPwMsg('Password changed! Redirecting to login...');
    setTimeout(() => { localStorage.removeItem('chds-user'); window.location.href = '/login'; }, 2000);
  };

  if (!score) return <p className="text-gray-500 dark:text-gray-400">Loading security score...</p>;

  const pct = score.score || 0;
  const bd = score.breakdown || {};
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  const factors: { label: string; key: string; desc: string }[] = [
    { label: 'Two-factor authentication', key: 'twoFactor', desc: 'Protect your account with a second authentication factor' },
    { label: 'Recent login activity', key: 'recentLogin', desc: 'Log in at least once every 30 days' },
    { label: 'No recent failed logins', key: 'noFailedLogins', desc: 'Avoid repeated failed login attempts' },
    { label: 'Recent consent review', key: 'recentConsentReview', desc: 'Review your data sharing consents regularly' },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Privacy & Security</h2>

      <div className="max-w-md mb-8">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Security Health Score</h3>
        <div className="flex items-center gap-4 mb-2">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="30" fill="none" stroke="#374151" strokeWidth="6" />
              <circle cx="36" cy="36" r="30" fill="none" stroke={pct >= 80 ? '#10b981' : pct >= 50 ? '#eab308' : '#ef4444'} strokeWidth="6"
                strokeDasharray={`${(pct / 100) * 188.5} 188.5`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-white">{pct}</span>
          </div>
          <div className="flex-1">
            <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
              <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">{score.label || 'Needs attention'}</p>
          </div>
        </div>
      </div>

      <div className="max-w-md space-y-2 mb-8">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Security Factors</h3>
        {factors.map((f) => {
          const passed = (bd[f.key] || 0) > 0;
          return (
            <div key={f.key} className={`p-3 rounded-lg border ${passed ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{f.label}</span>
                  {!passed && <p className="text-xs text-gray-500 mt-0.5">{f.desc}</p>}
                </div>
                <span className={`text-xs font-medium ${passed ? 'text-emerald-500' : 'text-red-400'}`}>{passed ? '✓' : '✗'}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="max-w-lg mb-8">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Storage Usage</h3>
        <StorageUsage />
      </div>

      <div className="max-w-lg space-y-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white border-t border-gray-200 dark:border-gray-800 pt-6">Settings</h3>

        <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Two-Factor Authentication</h4>
          {twoFAState === 'idle' && (
            <button onClick={handle2FASetup} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500">
              Set Up 2FA
            </button>
          )}
          {twoFAState === 'loading' && <p className="text-xs text-gray-400">Generating 2FA key...</p>}
          {twoFAState === 'ready' && (
            <div className="space-y-3">
              {twoFAQr && <img src={twoFAQr} alt="2FA QR" className="w-32 h-32 mx-auto" />}
              <p className="text-xs text-gray-400 text-center font-mono">Secret: {twoFASecret}</p>
              <div className="flex items-center gap-2">
                <input type="text" maxLength={6} placeholder="6-digit code" value={twoFAToken} onChange={(e) => setTwoFAToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <button onClick={handle2FAEnable} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500">Verify</button>
              </div>
              {twoFAMsg && <p className="text-xs text-red-400">{twoFAMsg}</p>}
            </div>
          )}
          {twoFAState === 'enabled' && (
            <div>
              <p className="text-xs text-emerald-500 mb-2">2FA is enabled</p>
              {twoFABackupCodes.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-3 mb-3">
                  <p className="text-xs text-gray-400 mb-2">Backup codes (save these):</p>
                  <div className="grid grid-cols-2 gap-1">
                    {twoFABackupCodes.map((c, i) => (
                      <code key={i} className="text-xs text-gray-300 font-mono">{c}</code>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={handle2FADisable} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-500">
                Disable 2FA
              </button>
            </div>
          )}
        </div>

        <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Change Password</h4>
          <div className="space-y-3">
            <div className="relative">
              <input type={showPw.current ? 'text' : 'password'} placeholder="Current password" value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                className="w-full px-3 py-2 pr-10 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <button type="button" onClick={() => setShowPw({ ...showPw, current: !showPw.current })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                {showPw.current ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
            <div className="relative">
              <input type={showPw.newPw ? 'text' : 'password'} placeholder="New password (min 8 chars)" value={pwForm.newPw} onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })}
                className="w-full px-3 py-2 pr-10 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <button type="button" onClick={() => setShowPw({ ...showPw, newPw: !showPw.newPw })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                {showPw.newPw ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
            <div className="relative">
              <input type={showPw.confirm ? 'text' : 'password'} placeholder="Confirm new password" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                className="w-full px-3 py-2 pr-10 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <button type="button" onClick={() => setShowPw({ ...showPw, confirm: !showPw.confirm })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                {showPw.confirm ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
            <button onClick={handleChangePassword} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500">Change Password</button>
            {pwMsg && <p className={`text-xs ${pwMsg.includes('Redirecting') ? 'text-emerald-500' : 'text-red-400'}`}>{pwMsg}</p>}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Data Wipe Request</h4>
          <p className="text-xs text-gray-500 mb-3">Request permanent deletion of all your data. Requires admin approval.</p>
          <RequestWipe />
        </div>
      </div>
    </div>
  );
}

function RequestWipe() {
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const handleWipe = async () => {
    if (!reason.trim()) { setMsg('Please provide a reason'); return; }
    const res = await fetch('/api/v1/patient/wipe-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    setMsg(res.ok ? 'Wipe request submitted for admin review' : data.error || 'Request failed');
  };
  return (
    <div className="space-y-2">
      <textarea placeholder="Reason for data wipe" value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
      <button onClick={handleWipe} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-500">Request Data Wipe</button>
      {msg && <p className={`text-xs ${msg.includes('submitted') ? 'text-emerald-500' : 'text-red-400'}`}>{msg}</p>}
    </div>
  );
}

function StorageUsage() {
  const [info, setInfo] = useState<{ used: number; limit: number; hasPendingRequest: boolean } | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [requestLimit, setRequestLimit] = useState('5');
  const [requestReason, setRequestReason] = useState('');
  const [requestMsg, setRequestMsg] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/patient/storage-info', { credentials: 'include' });
    if (res.ok) setInfo(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRequest = async () => {
    setRequestMsg('');
    const gb = parseFloat(requestLimit);
    if (!gb || gb <= 2) { setRequestMsg('Must be greater than 2 GB'); return; }
    if (!requestReason.trim()) { setRequestMsg('Please provide a reason'); return; }
    const res = await fetch('/api/v1/patient/storage-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ requested_limit: Math.round(gb * 1073741824), reason: requestReason }),
    });
    const data = await res.json();
    if (res.ok) {
      setShowRequest(false);
      load();
    }
    setRequestMsg(data.error || 'Request submitted');
  };

  if (!info) return <p className="text-xs text-gray-400">Loading storage info...</p>;

  const pct = info.limit > 0 ? Math.min(100, Math.round((info.used / info.limit) * 100)) : 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-emerald-500';
  const usedGb = (info.used / 1073741824).toFixed(2);
  const limitGb = (info.limit / 1073741824).toFixed(1);

  return (
    <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">{usedGb} GB / {limitGb} GB</span>
        <span className={`text-xs font-medium ${pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-yellow-400' : 'text-emerald-400'}`}>{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-gray-700 overflow-hidden mb-3">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {!info.hasPendingRequest && (
        <button onClick={() => setShowRequest(true)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500">
          Request Increase
        </button>
      )}
      {info.hasPendingRequest && (
        <p className="text-xs text-yellow-400">Pending increase request : awaiting admin review</p>
      )}

      {showRequest && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full mx-4">
            <h2 className="text-lg font-bold text-white mb-4">Request Storage Increase</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Requested Limit (GB)</label>
                <input type="number" min="2.1" step="0.1" value={requestLimit} onChange={(e) => setRequestLimit(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Reason</label>
                <textarea value={requestReason} onChange={(e) => setRequestReason(e.target.value)} rows={3} placeholder="Why do you need more storage?"
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              {requestMsg && <p className="text-xs text-emerald-400">{requestMsg}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setShowRequest(false); setRequestMsg(''); }} className="flex-1 py-2.5 rounded-lg bg-gray-700 text-white text-sm font-semibold hover:bg-gray-600">Cancel</button>
                <button onClick={handleRequest} className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500">Submit Request</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <TimeButton />
    </div>
  );
}

function Field({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-gray-900 dark:text-white text-sm bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-800">
        {value || '-'}
      </p>
    </div>
  );
}

function EditField({ label, value, maxLen, className = '', onChange }: { label: string; value: string; maxLen: number; className?: string; onChange: (v: string) => void }) {
  return (
    <div className={className}>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value.slice(0, maxLen))}
        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      <p className="text-xs text-gray-500 mt-0.5 text-right">{value.length}/{maxLen}</p>
    </div>
  );
}
