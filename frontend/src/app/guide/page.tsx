'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import Link from 'next/link';

const PATIENT_SECTIONS = [
  {
    title: 'Your Records',
    desc: 'Upload medical reports, lab results, and documents. All files are encrypted at rest. You can view, download, or delete them anytime.',
  },
  {
    title: 'Granting Consent',
    desc: 'When a doctor requests access, you\'ll see their full profile : name, hospital, license, availability. You can approve or decline. Once approved, you control which specific records they see.',
  },
  {
    title: 'Per-Record Toggle',
    desc: 'Each record has an ON/OFF switch per doctor. Toggle a record OFF and the doctor can\'t see it. Toggle it ON and they can. Change your mind anytime.',
  },
  {
    title: 'View Tracking',
    desc: 'Every time a doctor views your records, it\'s logged. Check the Records tab to see which doctor viewed what and how many times.',
  },
  {
    title: 'Notifications',
    desc: 'Get notified when a doctor sends a prescription, bill, or any new record. Check your Notifications page for updates.',
  },
  {
    title: 'Audit Trail',
    desc: 'Every access to your data is logged immutably. Filter by date or action, export as CSV, or generate a QR receipt for verification.',
  },
  {
    title: '2FA Security',
    desc: 'Enable two-factor authentication in Privacy settings for an extra layer of protection. You\'ll get backup codes in case you lose your authenticator.',
  },
  {
    title: 'Data Wipe',
    desc: 'Request a complete wipe of your data at any time. An admin will review and process your request.',
  },
];

const DOCTOR_SECTIONS = [
  {
    title: 'Find Patients',
    desc: 'Search for patients by name. You\'ll only see their name : no private details until they consent.',
  },
  {
    title: 'Request Consent',
    desc: 'Send a consent request to a patient. They\'ll see your full profile and decide whether to approve.',
  },
  {
    title: 'View Patient Records',
    desc: 'Once consented, view the patient\'s shared records. You can see both your own entries and the patient\'s uploaded files they\'ve toggled ON.',
  },
  {
    title: 'Send Prescriptions & Bills',
    desc: 'Create records for the patient categorized as Prescription, Bill, Timetable, or Explanation. The patient gets notified instantly.',
  },
  {
    title: 'Upload Files for Patient',
    desc: 'Upload documents like lab results or imaging reports. Choose the right category so the patient knows what it is.',
  },
  {
    title: 'Emergency Override',
    desc: 'In emergencies, you can override consent to access all records. This is logged to the audit trail and the patient is notified.',
  },
  {
    title: 'Security Score',
    desc: 'Your profile has a security health score based on 2FA setup, password strength, and recent activity. Keep it high.',
  },
  {
    title: 'Notifications',
    desc: 'Get notified when a patient approves or declines your consent request.',
  },
];

export default function GuidePage() {
  const router = useRouter();
  const { user, hasRole } = useAuth();

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
  }, [user, router]);

  if (!user) return null;

  const isDoctor = hasRole('doctor');
  const sections = isDoctor ? DOCTOR_SECTIONS : PATIENT_SECTIONS;
  const title = isDoctor ? 'Doctor Guide' : 'Patient Guide';

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link href={isDoctor ? '/doctor/search' : '/dashboard'}
          className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
          &larr; Back to App
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mt-4 mb-2">{title}</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">
          How to use CHDS features.
        </p>

        <div className="space-y-4">
          {sections.map((s, i) => (
            <div key={i} className="p-5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{s.title}</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
