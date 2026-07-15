'use client';
import { useState } from 'react';

const STEPS = [
  { title: 'Your data stays yours', desc: 'CHDS uses a patient-mediated model. You control who accesses your health records and when. No one sees your data without your explicit consent.' },
  { title: 'How access works', desc: 'Grant consent to doctors with specific scopes (all, read-only, emergency-only). Revoke anytime. Emergency overrides are always logged and notified.' },
  { title: 'Your audit trail', desc: 'Every access to your data is logged. View your full audit trail, generate QR receipts for verification, or request a complete data wipe at any time.' },
];

export default function OnboardingModal({ onComplete, onSkip }: { onComplete: () => void; onSkip: () => void }) {
  const [step, setStep] = useState(0);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex gap-1.5 mb-6">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-emerald-500' : 'bg-gray-700'}`} />
          ))}
        </div>
        <h2 className="text-xl font-bold text-white mb-2">{STEPS[step].title}</h2>
        <p className="text-gray-400 text-sm mb-8 leading-relaxed">{STEPS[step].desc}</p>
        <div className="flex justify-between">
          <button onClick={onSkip} className="text-sm text-gray-500 hover:text-gray-300">Skip</button>
          <button onClick={() => step < 2 ? setStep(step + 1) : onComplete()}
            className="px-6 py-2 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-500">
            {step < 2 ? 'Next' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  );
}
