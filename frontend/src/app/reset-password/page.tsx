'use client';
import { useState, FormEvent, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPw, setShowPw] = useState({ newPw: false, confirm: false });

  const strength = password.length < 8 ? 0 : password.length < 12 ? 1 : 2;
  const strengthColors = ['bg-red-500', 'bg-yellow-500', 'bg-emerald-500'];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setSuccess(true);
    } catch { setError('Could not connect to server.'); }
  };

  if (success) {
    return (
      <div className="text-center">
        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-6">
          Password reset successful!
        </div>
        <Link href="/login" className="text-emerald-400 hover:text-emerald-300 font-semibold">Go to login</Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">New Password</label>
        <div className="relative">
          <input type={showPw.newPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required
            className="w-full px-4 py-2.5 pr-10 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Min 8 characters" />
          <button type="button" onClick={() => setShowPw({ ...showPw, newPw: !showPw.newPw })}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300">
            {showPw.newPw ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-gray-700 overflow-hidden">
          <div className={`h-full ${strengthColors[strength]} transition-all`} style={{ width: `${((strength + 1) / 3) * 100}%` }} />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Confirm Password</label>
        <div className="relative">
          <input type={showPw.confirm ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} required
            className="w-full px-4 py-2.5 pr-10 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <button type="button" onClick={() => setShowPw({ ...showPw, confirm: !showPw.confirm })}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300">
            {showPw.confirm ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>
      </div>
      <button type="submit" className="w-full py-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-500">
        Reset Password
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  useEffect(() => { document.documentElement.classList.add('dark'); }, []);
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Set new password</h1>
          <p className="text-gray-400 mt-2">Enter your new password below</p>
        </div>
        <Suspense fallback={<div className="text-gray-400 text-center">Loading...</div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
