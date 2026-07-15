'use client';

import { useEffect, useState } from 'react';

const COOKIE_CONSENT_KEY = 'chds_cookie_consent';
const TERMS_KEY = 'chds_terms_accepted';

export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) setShow(true);
  }, []);

  const accept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    setShow(false);
  };

  const decline = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'declined');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9998] bg-gray-900/95 border-t border-gray-700 backdrop-blur-sm">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <p className="text-xs text-gray-300 leading-relaxed">
          This website uses cookies and similar technologies to improve your experience.
          By continuing, you consent to our use of cookies in accordance with our{' '}
          <a href="/terms" className="text-emerald-400 hover:underline">Privacy Policy &amp; Terms</a>.
        </p>
        <div className="flex gap-2 shrink-0">
          <button onClick={decline} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-700 text-gray-300 hover:bg-gray-600">Decline</button>
          <button onClick={accept} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500">Accept</button>
        </div>
      </div>
    </div>
  );
}

export function TermsModal() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem(TERMS_KEY);
    if (!accepted) setShow(true);
  }, []);

  const accept = () => {
    localStorage.setItem(TERMS_KEY, 'accepted');
    localStorage.setItem(TERMS_ACCEPTED_AT_KEY, new Date().toISOString());
    setShow(false);
    fetch('/api/v1/auth/accept-terms', { method: 'POST', credentials: 'include' }).catch(() => {});
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-gray-900 border border-gray-700 rounded-xl p-6 max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-white mb-3">Terms & Conditions</h2>
        <p className="text-amber-400/80 text-xs mb-3 border-l-2 border-amber-500/30 pl-2 leading-relaxed">
          You must accept these Terms to use the System. If you do not accept, you will not be able to access your account.
          By clicking Accept, you confirm you have read and agree to the full Terms &amp; Conditions.
        </p>
        <div className="text-xs text-gray-400 space-y-3 leading-relaxed mb-6">
          <p><strong className="text-gray-200">1. Acceptance Required.</strong> You must accept before accessing the System. Continued use without acceptance is prohibited.</p>
          <p><strong className="text-gray-200">2. System Provided &quot;As Is&quot;.</strong> CHDS Nepal makes no warranties about availability, accuracy, or freedom from errors. The System is a research prototype.</p>
          <p><strong className="text-gray-200">3. Limited Liability.</strong> CHDS Nepal is not liable for breaches resulting from your own credential negligence, lost passwords, failure to log out, or sharing your 2FA codes.</p>
          <p><strong className="text-gray-200">4. Your Security Responsibility.</strong> You are solely responsible for your password, 2FA codes, and session security. Enable 2FA. Use a strong, unique password. Log out every time.</p>
          <p><strong className="text-gray-200">5. Data Protection Standards.</strong> All PHI is encrypted at rest (AES-256) and in transit (TLS 1.3) in alignment with HIPAA Security Rule standards.</p>
          <p><strong className="text-gray-200">6. Consent Controls.</strong> You control who sees your records. Consents expire in 90 days and can be revoked any time from your dashboard.</p>
          <p><strong className="text-gray-200">7. Immutable Audit Log.</strong> Every access to your data is permanently logged. You can view the full history from your dashboard.</p>
          <p><strong className="text-gray-200">8. Breach Notification.</strong> If a breach of your data occurs, you will be notified within 60 days of discovery.</p>
          <p><strong className="text-gray-200">9. Data Deletion.</strong> You can request permanent deletion of your PHI at any time. Deletion is processed within 72 business hours.</p>
          <p><strong className="text-gray-200">10. Indemnification.</strong> You agree to hold CHDS Nepal harmless from claims arising from your own failure to comply with your security obligations.</p>
        </div>
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs text-emerald-400 hover:text-emerald-300 underline mb-4"
        >
          Read full Privacy Policy &amp; Terms of Service
        </a>
        <button onClick={accept} className="w-full py-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-500">
          I Accept
        </button>
      </div>
    </div>
  );
}

const TERMS_ACCEPTED_AT_KEY = 'chds_terms_accepted_at';
