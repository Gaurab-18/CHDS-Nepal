'use client';

import { useEffect, useState, FormEvent, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';

const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);

const EyeOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

export default function DoctorProfilePage() {
  const router = useRouter();
  const { user, hasRole, logout, updateUser } = useAuth();
  const [fullName, setFullName] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalAddress, setHospitalAddress] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [certificates, setCertificates] = useState<string[]>([]);
  const [availability, setAvailability] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('pending');
  const [rejectionReason, setRejectionReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [score, setScore] = useState<any>(null);
  const [twoFAState, setTwoFAState] = useState<'idle' | 'loading' | 'ready' | 'enabled'>(user?.two_factor_enabled ? 'enabled' : 'idle');
  const [twoFASecret, setTwoFASecret] = useState('');
  const [twoFAQr, setTwoFAQr] = useState('');
  const [twoFAToken, setTwoFAToken] = useState('');
  const [twoFAMsg, setTwoFAMsg] = useState('');
  const [twoFABackupCodes, setTwoFABackupCodes] = useState<string[]>([]);

  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [showPw, setShowPw] = useState({ current: false, newPw: false, confirm: false });

  useEffect(() => {
    if (!user || !hasRole('doctor')) { router.push('/login'); return; }
    loadProfile();
  }, [user, router, hasRole]);

  const loadScore = useCallback(() => {
    fetch('/api/v1/auth/security-score', { credentials: 'include' })
      .then((r) => r.json()).then(setScore).catch(() => {});
  }, []);

  useEffect(() => { loadScore(); }, [loadScore]);

  const loadProfile = async () => {
    try {
      const res = await fetch('/api/v1/doctor/profile', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setFullName(data.full_name || '');
        setHospitalName(data.hospital_name || '');
        setHospitalAddress(data.hospital_address || '');
        setLicenseNumber(data.license_number || '');
        setPhone(data.phone || '');
        setCertificates(data.certificates || []);
        setAvailability(data.availability || '');
        setVerificationStatus(data.verification_status || 'pending');
        setRejectionReason(data.rejection_reason || '');
      }
    } catch {}
    setLoading(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    const formData = new FormData();
    formData.append('full_name', fullName);
    formData.append('hospital_name', hospitalName);
    formData.append('hospital_address', hospitalAddress);
    formData.append('license_number', licenseNumber);
    formData.append('phone', phone);
    formData.append('availability', availability);

    try {
      const res = await fetch('/api/v1/doctor/profile', {
        method: 'PUT',
        credentials: 'include',
        body: formData,
      });

      if (res.ok) {
        setMessage('Profile saved. Admin will review your verification.');
        loadProfile();
      } else {
        const data = await res.json();
        setMessage(data.error || 'Failed to save profile');
      }
    } catch {
      setMessage('Network error');
    }
    setSaving(false);
  };

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
    const res = await fetch('/api/v1/auth/2fa/disable', { method: 'POST', credentials: 'include' });
    if (!res.ok) { const d = await res.json(); setTwoFAMsg(d.error || 'Disable failed'); return; }
    setTwoFAState('idle');
    setTwoFABackupCodes([]);
    setTwoFAQr('');
    updateUser({ two_factor_enabled: false });
    loadScore();
  };

  const handleChangePassword = async () => {
    setPwMsg('');
    if (pwNew !== pwConfirm) { setPwMsg('Passwords do not match'); return; }
    if (pwNew.length < 8) { setPwMsg('Password must be at least 8 characters'); return; }
    const res = await fetch('/api/v1/auth/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
    });
    const data = await res.json();
    if (!res.ok) { setPwMsg(data.error || 'Change failed'); return; }
    setPwMsg('Password changed! Redirecting to login...');
    setTimeout(() => { localStorage.removeItem('chds-user'); window.location.href = '/login'; }, 2000);
  };

  if (loading) return <div className="min-h-screen bg-white dark:bg-gray-950 p-6"><p className="text-gray-500">Loading...</p></div>;

  const pct = score?.score || 0;
  const bd = score?.breakdown || {};
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/doctor/search')}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Doctor Profile</h1>
          </div>
          <button onClick={() => { logout(); router.push('/login'); }}
            className="text-xs text-red-600 dark:text-red-400">Sign Out</button>
        </div>

        {verificationStatus === 'pending' && (
          <div className="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm">
            Your account is pending admin verification. You cannot access patient records until approved.
          </div>
        )}
        {verificationStatus === 'approved' && (
          <div className="mb-6 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm">
            Your account is verified. You can now access patient records.
          </div>
        )}
        {verificationStatus === 'rejected' && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            Verification rejected{rejectionReason ? `: ${rejectionReason}` : ''}. Please update your profile to re-submit.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-800 pb-2">Profile Information</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name *</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required
              className="w-full px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hospital / Clinic *</label>
            <input type="text" value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} required
              className="w-full px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hospital Address</label>
            <input type="text" value={hospitalAddress} onChange={(e) => setHospitalAddress(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">License Number</label>
            <input type="text" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Availability</label>
            <textarea value={availability} onChange={(e) => setAvailability(e.target.value)} rows={3}
              placeholder="e.g. Mon-Fri 9AM-5PM, Sat 10AM-2PM"
              className="w-full px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Certificates (optional)</label>
            {certificates.length > 0 && (
              <ul className="mb-2 space-y-1">
                {certificates.map((cert: string, i: number) => {
                  const fileName = cert.split('/').pop() || `Certificate ${i + 1}`;
                  return (
                    <li key={i}>
                      <a href={`/api/v1/uploads/${fileName}`} target="_blank" rel="noopener noreferrer"
                        className="text-emerald-400 hover:text-emerald-300 text-xs underline">{fileName}</a>
                    </li>
                  );
                })}
              </ul>
            )}
            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png"
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500" />
            <p className="text-xs text-gray-400 mt-1">Upload medical license, degree certificates, etc.</p>
          </div>
          {message && (
            <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm">{message}</div>
          )}
          <button type="submit" disabled={saving}
            className="w-full py-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-500 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>

        {/* Security Health Score */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 border-b border-gray-200 dark:border-gray-800 pb-2">Security Health</h2>
          {score && (
            <div className="flex items-center gap-4 mb-4">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 72 72">
                  <circle cx="36" cy="36" r="30" fill="none" stroke="#374151" strokeWidth="6" />
                  <circle cx="36" cy="36" r="30" fill="none" stroke={pct >= 80 ? '#10b981' : pct >= 50 ? '#eab308' : '#ef4444'} strokeWidth="6"
                    strokeDasharray={`${(pct / 100) * 188.5} 188.5`} strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-white">{pct}</span>
              </div>
              <div className="flex-1">
                <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
                  <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">{score?.label || ''}</p>
              </div>
            </div>
          )}
        </div>

        {/* 2FA Section */}
        <div className="mb-8 p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Two-Factor Authentication</h3>
          {twoFAState === 'idle' && (
            <button onClick={handle2FASetup} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500">Set Up 2FA</button>
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
                    {twoFABackupCodes.map((c, i) => (<code key={i} className="text-xs text-gray-300 font-mono">{c}</code>))}
                  </div>
                </div>
              )}
              <button onClick={handle2FADisable} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-500">Disable 2FA</button>
              {twoFAMsg && <p className="text-xs text-red-400 mt-2">{twoFAMsg}</p>}
            </div>
          )}
        </div>

        {/* Change Password */}
        <div className="mb-8 p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Change Password</h3>
          <div className="space-y-3">
            <div className="relative">
              <input type={showPw.current ? 'text' : 'password'} placeholder="Current password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)}
                className="w-full px-3 py-2 pr-10 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <button type="button" onClick={() => setShowPw({ ...showPw, current: !showPw.current })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                {showPw.current ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <div className="relative">
              <input type={showPw.newPw ? 'text' : 'password'} placeholder="New password (min 8 chars)" value={pwNew} onChange={(e) => setPwNew(e.target.value)}
                className="w-full px-3 py-2 pr-10 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <button type="button" onClick={() => setShowPw({ ...showPw, newPw: !showPw.newPw })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                {showPw.newPw ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <div className="relative">
              <input type={showPw.confirm ? 'text' : 'password'} placeholder="Confirm new password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)}
                className="w-full px-3 py-2 pr-10 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <button type="button" onClick={() => setShowPw({ ...showPw, confirm: !showPw.confirm })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                {showPw.confirm ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <button onClick={handleChangePassword} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500">Change Password</button>
            {pwMsg && <p className={`text-xs ${pwMsg.includes('Redirecting') ? 'text-emerald-500' : 'text-red-400'}`}>{pwMsg}</p>}
          </div>
        </div>

        <div className="flex gap-4">
          <button onClick={() => router.push('/doctor/search')}
            className="flex-1 py-2.5 rounded-lg bg-gray-800 text-gray-300 text-sm font-semibold hover:bg-gray-700">Search Patients</button>
          <button onClick={() => router.push('/doctor/notifications')}
            className="flex-1 py-2.5 rounded-lg bg-gray-800 text-gray-300 text-sm font-semibold hover:bg-gray-700">Notifications</button>
        </div>
      </div>
    </div>
  );
}
