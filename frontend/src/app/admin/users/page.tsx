'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import Link from 'next/link';
import TimeButton from '@/components/cute/TimeButton';

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', username: '', role: 'doctor' });
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'doctor' });
  const [createdPassword, setCreatedPassword] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  useEffect(() => {
    if (!user || !hasRole('admin')) { router.push('/login'); return; }
    loadUsers();
  }, [user, router, hasRole]);

  const loadUsers = async (q?: string) => {
    try {
      const url = q ? `/api/v1/admin/users?q=${encodeURIComponent(q)}` : '/api/v1/admin/users';
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) setUsers(await res.json());
    } catch {}
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadUsers(searchQuery);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/admin/users', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      if (res.ok) {
        const data = await res.json();
        setCreatedPassword(data.temp_password);
        setShowCreate(false);
        loadUsers();
      }
    } catch {}
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch('/api/v1/admin/invite', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      });
      setInviteForm({ email: '', role: 'doctor' });
    } catch {}
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await fetch(`/api/v1/admin/users/${userId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      loadUsers();
    } catch {}
  };

  const handleToggleActive = async (userId: string) => {
    try {
      await fetch(`/api/v1/admin/users/${userId}/disable`, {
        method: 'PATCH', credentials: 'include',
      });
      loadUsers();
    } catch {}
  };

  const handleDelete = async (userId: string) => {
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (res.ok) {
        setDeleteConfirm(null);
        loadUsers();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete user');
      }
    } catch {}
  };

  const handleResetPassword = async (userId: string) => {
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/reset-password`, {
        method: 'POST', credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setResetPassword(data.temp_password);
        setResetConfirm(null);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to reset password');
      }
    } catch {}
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowCreate(!showCreate)}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500">Create User</button>
            <Link href="/admin/notices" className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-500">Notices</Link>
            <Link href="/admin/notifications" className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-300 dark:hover:bg-gray-700">Notifications</Link>
            <Link href="/admin/audit" className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-300 dark:hover:bg-gray-700">Audit Log</Link>
            <Link href="/admin/wipe-requests" className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-300 dark:hover:bg-gray-700">Wipe Requests</Link>
            <Link href="/admin/storage-requests" className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-300 dark:hover:bg-gray-700">Storage</Link>
            <Link href="/admin/hospitals" className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-500">Hospitals</Link>
            <Link href="/admin/hospitals/matches" className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-300 dark:hover:bg-gray-700">Match Queue</Link>
            <Link href="/admin/ip-blocks" className="px-4 py-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm font-semibold hover:bg-red-200 dark:hover:bg-red-900/50">IP Blocks</Link>
            <button onClick={() => { logout(); fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {}); router.push('/login'); }} className="px-4 py-2 rounded-lg bg-red-600/20 text-red-400 text-sm font-semibold hover:bg-red-600/30">Sign Out</button>
          </div>
        </div>

        <form onSubmit={handleSearch} className="mb-4">
          <div className="flex gap-2 max-w-md">
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID, username, or email..."
              className="flex-1 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500">Search</button>
            {searchQuery && (
              <button type="button" onClick={() => { setSearchQuery(''); loadUsers(); }} className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-300 dark:hover:bg-gray-700">Clear</button>
            )}
          </div>
        </form>

        {showCreate && (
          <form onSubmit={handleCreate} className="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 max-w-md">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Create User</h3>
            <input type="email" placeholder="Email" value={createForm.email} onChange={(e) => setCreateForm({...createForm, email: e.target.value})} required
              className="w-full mb-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm" />
            <input type="text" placeholder="Username" value={createForm.username} onChange={(e) => setCreateForm({...createForm, username: e.target.value})} required
              className="w-full mb-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm" />
            <select value={createForm.role} onChange={(e) => setCreateForm({...createForm, role: e.target.value})}
              className="w-full mb-3 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm">
              <option value="doctor">Doctor</option>
              <option value="admin">Admin</option>
              <option value="patient">Patient</option>
            </select>
            <button type="submit" className="w-full py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500">Create & Send Password</button>
          </form>
        )}

        {createdPassword && (
          <div className="mb-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm">
            Temp password: <strong className="font-mono">{createdPassword}</strong> (shown once)
            <button onClick={() => setCreatedPassword('')} className="ml-4 text-xs underline">Dismiss</button>
          </div>
        )}

        {resetPassword && (
          <div className="mb-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400 text-sm">
            Password reset! New temp password: <strong className="font-mono">{resetPassword}</strong>
            <button onClick={() => setResetPassword('')} className="ml-4 text-xs underline">Dismiss</button>
          </div>
        )}

        {deleteConfirm && (
          <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-3">
            <span>Delete user permanently? This cannot be undone.</span>
            <button onClick={() => handleDelete(deleteConfirm)} className="px-3 py-1 rounded bg-red-600 text-white text-xs font-semibold">Delete</button>
            <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1 rounded bg-gray-600 text-white text-xs">Cancel</button>
          </div>
        )}

        {resetConfirm && (
          <div className="mb-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm flex items-center gap-3">
            <span>Reset this user&apos;s password? 2FA will be disabled.</span>
            <button onClick={() => handleResetPassword(resetConfirm)} className="px-3 py-1 rounded bg-amber-600 text-white text-xs font-semibold">Reset</button>
            <button onClick={() => setResetConfirm(null)} className="px-3 py-1 rounded bg-gray-600 text-white text-xs">Cancel</button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Username</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Email</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Role</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">2FA</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Active</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-900/50">
                  <td className="py-3 px-4 text-gray-900 dark:text-white">
                    <span className="text-xs text-gray-400 block">{u.username}</span>
                  </td>
                  <td className="py-3 px-4 text-gray-500 dark:text-gray-400">{u.email}</td>
                  <td className="py-3 px-4">
                    <select value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white text-xs border border-gray-200 dark:border-gray-700">
                      <option value="patient">Patient</option>
                      <option value="doctor">Doctor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="py-3 px-4"><span className={`text-xs ${u.two_factor_enabled ? 'text-emerald-500' : 'text-gray-400'}`}>{u.two_factor_enabled ? '✓' : '✗'}</span></td>
                  <td className="py-3 px-4">
                    <button onClick={() => handleToggleActive(u.id)}
                      className={`text-xs px-2 py-0.5 rounded ${u.active ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400'}`}>
                      {u.active ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1">
                      <button onClick={() => setResetConfirm(u.id)}
                        className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-500/20">
                        Reset Pwd
                      </button>
                      <button onClick={() => setDeleteConfirm(u.id)}
                        className="text-xs px-2 py-0.5 rounded bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/20">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <TimeButton />
    </div>
  );
}
