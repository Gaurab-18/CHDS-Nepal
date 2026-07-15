'use client';
import { useState, FormEvent, Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import AmbulanceCursor from '@/components/cute/AmbulanceCursor';
import Link from 'next/link';

function TwoFAForm() {
  const router = useRouter();
  const { login } = useAuth();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const [password] = useState(searchParams.get('pwd') || '');
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleDigitChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newDigits = [...digits];
    newDigits[index] = value;
    setDigits(newDigits);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const token = digits.join('');
    if (token.length !== 6) { setError('Please enter all 6 digits'); return; }
    try {
      const res = await fetch('/api/v1/auth/login/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password: password || undefined, token }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      login(data.user);
      if (data.must_change_password) router.push('/change-password');
      else if (data.user.role === 'admin') router.push('/admin/users');
      else if (data.user.role === 'doctor') router.push('/doctor/search');
      else router.push('/dashboard');
    } catch { setError('Could not connect to server.'); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4 relative overflow-hidden">
      <AmbulanceCursor />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Two-Factor Auth</h1>
          <p className="text-gray-400 mt-2">Enter the 6-digit code</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
          <div className="flex justify-center gap-2">
            {digits.map((d, i) => (
              <input key={i} ref={(el) => { inputRefs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} value={d}
                onChange={(e) => handleDigitChange(i, e.target.value)} onKeyDown={(e) => handleKeyDown(i, e)}
                className="w-12 h-14 text-center text-2xl font-bold rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            ))}
          </div>
          <button type="submit" className="w-full py-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-500">
            Verify
          </button>
          <p className="text-center text-sm text-gray-500">
            <Link href="/login/backup-code" className="text-emerald-400 hover:text-emerald-300">Use a backup code instead</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function TwoFAPage() {
  useEffect(() => { document.documentElement.classList.add('dark'); }, []);
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
      <TwoFAForm />
    </Suspense>
  );
}
