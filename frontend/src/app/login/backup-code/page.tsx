'use client';
import { useState, FormEvent, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useAuth } from '@/providers/AuthProvider';

function BackupCodeForm() {
  const router = useRouter();
  const { login } = useAuth();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/v1/auth/verify-backup-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      login(data.user);
      if (data.user.role === 'admin') router.push('/admin/users');
      else if (data.user.role === 'doctor') router.push('/doctor/search');
      else router.push('/dashboard');
    } catch { setError('Could not connect to server.'); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Backup Code</h1>
          <p className="text-gray-400 mt-2">Enter your password and a backup code</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Your password" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Backup Code</label>
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} required
              placeholder="Enter backup code"
              className="w-full text-center text-lg tracking-widest px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <button type="submit" className="w-full py-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-500">
            Verify
          </button>
        </form>
      </div>
    </div>
  );
}

export default function BackupCodePage() {
  useEffect(() => { document.documentElement.classList.add('dark'); }, []);
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
      <BackupCodeForm />
    </Suspense>
  );
}
